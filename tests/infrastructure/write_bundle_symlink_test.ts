import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import { DenoFsWriter } from "../../src/infrastructure/deno_fs_writer.ts";

/**
 * Writing a `skipIfExists` dest that is a SYMLINK.
 *
 * Some projects consolidate their context files and leave `AGENTS.md` behind as
 * a symlink to the one that survived. That is a reasonable thing to do — and
 * Specnaut's own bundled instructions tell agents to read `AGENTS.md`, so the
 * shape recurs. It puts a Specnaut-managed path in front of a file Specnaut
 * knows nothing about.
 *
 * `Deno.writeTextFile` follows symlinks. A wholesale write to such a dest does
 * not replace the dest: it overwrites whatever the link points at, and leaves
 * the link intact afterwards — same name, same mode, same target. Nothing in a
 * directory listing shows the damage, and the file destroyed is a different one
 * nobody asked to touch.
 *
 * `writeBundle` now refuses that write. These tests pin the refusal, the two
 * paths that were already safe, and — importantly — the one write that still
 * SHOULD follow a link.
 *
 * Skipped on Windows, where `Deno.symlink` needs developer mode or elevation.
 */

const WINDOWS = Deno.build.os === "windows";

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

Deno.test({
  name: "an ordinary run skips the dest and never reaches through the link",
  ignore: WINDOWS,
  async fn() {
    const dir = await consolidatedProject();
    try {
      // `overwrite: false` is what every non-forced init passes. The
      // `skipIfExists` branch must fire on a symlink exactly as on a regular
      // file — `fileExists` uses `lstat`, so it sees the link as present.
      const r = await new DenoFsWriter().writeBundle(
        BUNDLE as never,
        dir,
        { overwrite: false, backupExisting: false },
      );

      assertEquals(r.skippedSkipIfExists, ["AGENTS.md"]);
      assertEquals(await Deno.readTextFile(join(dir, ".claude/CLAUDE.md")), TARGET);
      assert((await Deno.lstat(join(dir, "AGENTS.md"))).isSymlink);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "a forced write moves the link aside instead of writing through it",
  ignore: WINDOWS,
  async fn() {
    const dir = await consolidatedProject();
    try {
      // `--force` passes `overwrite: true` AND `backupExisting: true`. The
      // backup is what makes it safe: `Deno.rename` moves the LINK, so the
      // write that follows lands on a fresh regular file.
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
      assert(!(await Deno.lstat(join(dir, "AGENTS.md"))).isSymlink);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "an unbacked-up overwrite of a symlinked skipIfExists dest is refused",
  ignore: WINDOWS,
  async fn() {
    const dir = await consolidatedProject();
    try {
      // The one combination that would reach through the link. No caller passes
      // it today; both guards that prevent it are incidental, so this is the
      // one that has to hold on its own.
      const r = await new DenoFsWriter().writeBundle(
        BUNDLE as never,
        dir,
        { overwrite: true, backupExisting: false },
      );

      assertEquals(
        await Deno.readTextFile(join(dir, ".claude/CLAUDE.md")),
        TARGET,
        "the link's target is a file Specnaut was never asked to write",
      );
      assertEquals(r.skippedSkipIfExists, ["AGENTS.md"]);
      assert(
        (await Deno.lstat(join(dir, "AGENTS.md"))).isSymlink,
        "the project made this a symlink on purpose; breaking it is its own damage",
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "a non-skipIfExists write still follows the link, as the section merge needs",
  ignore: WINDOWS,
  async fn() {
    const dir = await consolidatedProject();
    try {
      // The managed-section merge reads the dest, merges its fenced block, and
      // writes the RESULT through a bundle entry it builds itself — with no
      // `skipIfExists` flag. Through a symlink that lands the section in the
      // real file, which is the correct outcome for a consolidated project.
      // The guard above must not reach this path.
      const merged = TARGET + "<!-- managed:chain-stops -->\nsection\n";
      await new DenoFsWriter().writeBundle(
        { "AGENTS.md": { content: merged, executable: false } } as never,
        dir,
        { overwrite: true, backupExisting: false },
      );

      assertEquals(
        await Deno.readTextFile(join(dir, ".claude/CLAUDE.md")),
        merged,
        "a merged write is the project's own content plus our fenced block — " +
          "following the link is what puts the block in the file they actually read",
      );
      assert((await Deno.lstat(join(dir, "AGENTS.md"))).isSymlink);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
