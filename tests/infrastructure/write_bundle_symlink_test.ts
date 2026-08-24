import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import { DenoFsWriter } from "../../src/infrastructure/deno_fs_writer.ts";

/**
 * Writing a `skipIfExists` dest that is a SYMLINK.
 *
 * Some projects consolidate their context files and leave `AGENTS.md` behind as
 * a symlink to the one that survived. That is a reasonable thing to do, and it
 * puts a Specnaut-managed path in front of a file Specnaut knows nothing about.
 *
 * `Deno.writeTextFile` follows symlinks. So a full write to `AGENTS.md` does not
 * replace `AGENTS.md` — it overwrites whatever the link points at, and leaves
 * the link intact afterwards. Nothing in a directory listing shows the damage:
 * the symlink is still a symlink, still pointing where it did. The file that
 * gets destroyed is a different one, that nobody asked to touch.
 *
 * No path in the CLI does that today, and these tests exist to keep it that
 * way. Each pins one of the two guards that currently hold, so a future change
 * that removes one fails here instead of in someone's repository.
 */

const BUNDLE = {
  "AGENTS.md": { content: "BUNDLED AGENTS TEMPLATE\n", skipIfExists: true },
} as const;

const TARGET = "SENTINEL — the project's one context file\n";

/** A project whose `AGENTS.md` is a symlink to `.claude/CLAUDE.md`. */
async function consolidatedProject(): Promise<string> {
  const dir = await Deno.makeTempDir({ prefix: "specnaut-symlink-" });
  await Deno.mkdir(join(dir, ".claude"), { recursive: true });
  await Deno.writeTextFile(join(dir, ".claude/CLAUDE.md"), TARGET);
  await Deno.symlink(".claude/CLAUDE.md", join(dir, "AGENTS.md"));
  return dir;
}

Deno.test("an ordinary run skips the dest and never reaches through the link", async () => {
  const dir = await consolidatedProject();
  try {
    // `overwrite: false` is what every non-forced init passes. The
    // `skipIfExists` branch in writeBundle must fire on a symlink exactly as it
    // does on a regular file — `fileExists` has to see the link as present.
    const r = await new DenoFsWriter().writeBundle(
      BUNDLE as never,
      dir,
      { overwrite: false, backupExisting: false },
    );

    assertEquals(r.skippedSkipIfExists, ["AGENTS.md"]);
    assertEquals(
      await Deno.readTextFile(join(dir, ".claude/CLAUDE.md")),
      TARGET,
      "the link's target belongs to the project and must not be written",
    );
    assert((await Deno.lstat(join(dir, "AGENTS.md"))).isSymlink);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("a forced write moves the link aside instead of writing through it", async () => {
  const dir = await consolidatedProject();
  try {
    // `--force` passes `overwrite: true` AND `backupExisting: true`. The backup
    // is what saves the target: `Deno.rename` moves the LINK, so the write that
    // follows lands on a fresh regular file. Drop the backup and the same call
    // overwrites `.claude/CLAUDE.md` with the AGENTS template.
    const r = await new DenoFsWriter().writeBundle(
      BUNDLE as never,
      dir,
      { overwrite: true, backupExisting: true },
    );

    assertEquals(
      await Deno.readTextFile(join(dir, ".claude/CLAUDE.md")),
      TARGET,
      "forcing AGENTS.md must not destroy the unrelated file its link points at",
    );
    assertEquals(r.backups.map((b) => b.dest), ["AGENTS.md"]);
    assert(
      (await Deno.lstat(join(dir, "AGENTS.md.specnaut.bak"))).isSymlink,
      "the backup should be the original link, so the choice is recoverable",
    );
    assert(
      !(await Deno.lstat(join(dir, "AGENTS.md"))).isSymlink,
      "the new AGENTS.md is a regular file, not a second write to the target",
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("writeTextFile follows symlinks — the reason the guards above matter", async () => {
  const dir = await consolidatedProject();
  try {
    // Not a wish, a fact about the platform, pinned so nobody has to rediscover
    // it the expensive way. If a future caller passes `overwrite: true` without
    // a backup for a dest the user may have symlinked, THIS is what happens:
    // the target is replaced and the link still looks perfectly healthy.
    await new DenoFsWriter().writeBundle(
      BUNDLE as never,
      dir,
      { overwrite: true, backupExisting: false },
    );

    assertEquals(
      await Deno.readTextFile(join(dir, ".claude/CLAUDE.md")),
      BUNDLE["AGENTS.md"].content,
      "documents the hazard: the write reached through the link",
    );
    assert(
      (await Deno.lstat(join(dir, "AGENTS.md"))).isSymlink,
      "and the link survives, so the damage is invisible to `ls`",
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
