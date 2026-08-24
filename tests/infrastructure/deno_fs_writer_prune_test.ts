import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { DenoFsWriter } from "../../src/infrastructure/deno_fs_writer.ts";

/**
 * A renamed skill must not leave its old name behind as an empty folder.
 *
 * `deletePaths` removed the files and reported them removed, but the
 * directory survived — so `upgrade` printed "2 removed" while the old
 * command's folder was still sitting in the harness skills directory.
 * The staging store had pruned its own parents since it was written; the
 * real tree never did.
 *
 * These assert on the *directory*, because asserting on the files is what
 * the shipped behaviour already satisfied.
 */

async function box(): Promise<string> {
  const dir = await Deno.makeTempDir();
  await Deno.mkdir(join(dir, ".claude/skills/backlog"), { recursive: true });
  await Deno.writeTextFile(join(dir, ".claude/skills/backlog/SKILL.md"), "x");
  await Deno.writeTextFile(join(dir, ".claude/skills/backlog/groom.md"), "y");
  // A surviving sibling. Without one the walk correctly continues past
  // `skills/` and the "parent survives" assertion tests nothing.
  await Deno.mkdir(join(dir, ".claude/skills/specnaut"), { recursive: true });
  await Deno.writeTextFile(join(dir, ".claude/skills/specnaut/SKILL.md"), "z");
  return dir;
}

async function exists(p: string): Promise<boolean> {
  try {
    await Deno.stat(p);
    return true;
  } catch {
    return false;
  }
}

Deno.test("emptying a directory removes it, not just its files", async () => {
  const dir = await box();
  try {
    await new DenoFsWriter().deletePaths(
      [".claude/skills/backlog/SKILL.md", ".claude/skills/backlog/groom.md"],
      dir,
      { backupExisting: false },
    );
    assertEquals(await exists(join(dir, ".claude/skills/backlog")), false);
    // The walk stops at the first directory still in use.
    assertEquals(await exists(join(dir, ".claude/skills")), true);
    assertEquals(await exists(join(dir, ".claude/skills/specnaut/SKILL.md")), true);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("a directory that still holds a file is left alone", async () => {
  const dir = await box();
  try {
    await new DenoFsWriter().deletePaths(
      [".claude/skills/backlog/SKILL.md"],
      dir,
      { backupExisting: false },
    );
    assertEquals(await exists(join(dir, ".claude/skills/backlog")), true);
    assertEquals(await exists(join(dir, ".claude/skills/backlog/groom.md")), true);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("a backup keeps the directory alive on purpose", async () => {
  // The .bak lands beside the original, so the folder is not empty and
  // must not be pruned — losing it would lose the backup.
  const dir = await box();
  try {
    await new DenoFsWriter().deletePaths(
      [".claude/skills/backlog/SKILL.md", ".claude/skills/backlog/groom.md"],
      dir,
      { backupExisting: true },
    );
    assertEquals(await exists(join(dir, ".claude/skills/backlog")), true);
    assertEquals(
      await exists(join(dir, ".claude/skills/backlog/SKILL.md.specnaut.bak")),
      true,
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("pruning stops at the project root, whatever is emptied", async () => {
  // The walk must never delete the directory it was pointed at, even when
  // that directory ends up empty.
  const dir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(join(dir, "only.md"), "x");
    await new DenoFsWriter().deletePaths(["only.md"], dir, {
      backupExisting: false,
    });
    assertEquals(await exists(dir), true);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("the walk cascades while each ancestor is left empty", async () => {
  // Removing the last skill empties `skills/`, which empties `.claude/`.
  // Stopping at the immediate parent would leave two ghost directories
  // instead of one.
  const dir = await Deno.makeTempDir();
  try {
    await Deno.mkdir(join(dir, ".claude/skills/backlog"), { recursive: true });
    await Deno.writeTextFile(join(dir, ".claude/skills/backlog/SKILL.md"), "x");
    await new DenoFsWriter().deletePaths(
      [".claude/skills/backlog/SKILL.md"],
      dir,
      { backupExisting: false },
    );
    assertEquals(await exists(join(dir, ".claude")), false);
    assertEquals(await exists(dir), true);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
