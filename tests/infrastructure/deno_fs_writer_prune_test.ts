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

Deno.test("nothing outside the target directory is ever pruned", async () => {
  // The containment guard, exercised directly. It is the half that was
  // written as a POSIX string prefix and so did nothing on Windows —
  // where "does nothing" degraded safely, but the pruning it gates did
  // not happen either.
  const parent = await Deno.makeTempDir();
  try {
    const target = join(parent, "project");
    const sibling = join(parent, "sibling");
    await Deno.mkdir(join(target, "a"), { recursive: true });
    await Deno.mkdir(sibling, { recursive: true });
    await Deno.writeTextFile(join(target, "a/f.md"), "x");

    await new DenoFsWriter().deletePaths(["a/f.md"], target, {
      backupExisting: false,
    });

    assertEquals(await exists(join(target, "a")), false, "the emptied dir goes");
    assertEquals(await exists(target), true, "the target itself stays");
    assertEquals(await exists(sibling), true, "a sibling is never reachable");
    assertEquals(await exists(parent), true, "nor is the target's parent");
  } finally {
    await Deno.remove(parent, { recursive: true });
  }
});

Deno.test("the walk still prunes when the project is reached through a symlink", async () => {
  // The failure mode this pins is SILENCE, so it asserts the directory is
  // GONE — never merely that no error was raised (cli#574, F6).
  //
  // `pruneEmptyParents` compares two paths, and the whole walk stops the
  // instant they are resolved differently: a `realPath`'d root against a
  // lexical candidate returns a `../..` chain for every path, the predicate
  // says "outside", and the function returns on its first iteration. Nothing
  // throws, nothing is reported, and the ghost directory this walk exists to
  // remove simply survives — which is the Windows prefix bug the predicate's
  // own comment commemorates, arriving from the opposite direction.
  //
  // Every other case here reaches the box by its literal path, so the two
  // sides agree by accident. This one reaches it through a link, where they
  // only agree if the code resolves both or neither.
  const real = await box();
  const linkParent = await Deno.makeTempDir();
  const viaLink = join(linkParent, "project");
  await Deno.symlink(real, viaLink);

  await new DenoFsWriter().deletePaths(
    [".claude/skills/backlog/SKILL.md", ".claude/skills/backlog/groom.md"],
    viaLink,
    { backupExisting: false },
  );

  assertEquals(
    await exists(join(real, ".claude/skills/backlog")),
    false,
    "the emptied directory must be pruned when the project is reached through a link",
  );
  assertEquals(
    await exists(join(real, ".claude/skills/specnaut")),
    true,
    "and the surviving sibling must be left alone — a walk that deleted everything would also pass the assertion above",
  );

  await Deno.remove(linkParent, { recursive: true });
  await Deno.remove(real, { recursive: true });
});
