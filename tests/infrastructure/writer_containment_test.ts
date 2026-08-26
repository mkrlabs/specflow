import { assert, assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { DenoFsWriter } from "../../src/infrastructure/deno_fs_writer.ts";

/**
 * The escapes cli#574 measured, at the sink rather than at the predicate.
 *
 * Every case asserts TWO things: that the command refused, AND that the file
 * outside the project is byte-unchanged. Asserting only the refusal would pass
 * against a guard that refuses after acting — which is the shape of half the
 * defects this project has already found in its own guards.
 */
async function box(): Promise<{ root: string; proj: string; outside: string }> {
  const root = await Deno.makeTempDir({ prefix: "escape-" });
  const proj = join(root, "proj");
  const outside = join(root, "outside");
  await Deno.mkdir(proj);
  await Deno.mkdir(outside);
  return { root, proj, outside };
}

const w = new DenoFsWriter();

Deno.test("shape A — a symlinked ancestor cannot receive a write", async () => {
  const { root, proj, outside } = await box();
  try {
    await Deno.symlink(outside, join(proj, ".claude"));
    await assertRejects(() =>
      w.writeBundle({ ".claude/x.md": { content: "A", executable: false } }, proj, {
        overwrite: true,
        backupExisting: false,
      })
    );
    assertEquals(
      await Deno.stat(join(outside, "x.md")).then(() => true).catch(() => false),
      false,
      "nothing may be created at the link's target",
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("shape A' — mkdir -p may not create directories through the link either", async () => {
  // The sink the plan's first version omitted, and the reason the check moved
  // ahead of `mkdir`. Damage is bounded — empty directories, no content — but a
  // guard blind to a sink it never reads is the class this change closes.
  const { root, proj, outside } = await box();
  try {
    await Deno.symlink(outside, join(proj, ".claude"));
    await assertRejects(() =>
      w.writeBundle(
        { ".claude/skills/deep/SKILL.md": { content: "A", executable: false } },
        proj,
        { overwrite: true, backupExisting: false },
      )
    );
    assertEquals(
      await Deno.stat(join(outside, "skills")).then(() => true).catch(() => false),
      false,
      "not even a directory may be created at the link's target",
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("shape B — a leaf symlink cannot be written through", async () => {
  // The case the plan's first algorithm allowed: the parent is a normal
  // in-project directory, so resolve-the-parent-and-append-the-leaf says
  // "inside" and the write lands on the victim.
  const { root, proj, outside } = await box();
  try {
    const victim = join(outside, "victim.md");
    await Deno.writeTextFile(victim, "ORIGINAL");
    await Deno.symlink(victim, join(proj, "y.md"));
    await assertRejects(() =>
      w.writeBundle({ "y.md": { content: "B", executable: false } }, proj, {
        overwrite: true,
        backupExisting: false,
      })
    );
    assertEquals(await Deno.readTextFile(victim), "ORIGINAL");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("shape B' — an executable dest cannot be chmodded through a link", async () => {
  const { root, proj, outside } = await box();
  try {
    const victim = join(outside, "victim.sh");
    await Deno.writeTextFile(victim, "ORIGINAL");
    await Deno.chmod(victim, 0o600);
    await Deno.symlink(victim, join(proj, "s.sh"));
    await assertRejects(() =>
      w.writeBundle({ "s.sh": { content: "B", executable: true } }, proj, {
        overwrite: true,
        backupExisting: false,
      })
    );
    assertEquals(await Deno.readTextFile(victim), "ORIGINAL");
    const mode = (await Deno.stat(victim)).mode ?? 0;
    assertEquals(mode & 0o777, 0o600, "and its mode is untouched");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("shape C — a delete cannot reach through a symlinked ancestor", async () => {
  const { root, proj, outside } = await box();
  try {
    await Deno.writeTextFile(join(outside, "z.md"), "keep");
    await Deno.symlink(outside, join(proj, ".claude"));
    await assertRejects(() => w.deletePaths([".claude/z.md"], proj, { backupExisting: false }));
    assertEquals(await Deno.readTextFile(join(outside, "z.md")), "keep");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("a backup rename cannot move a file out of the project either", async () => {
  const { root, proj, outside } = await box();
  try {
    await Deno.writeTextFile(join(outside, "z.md"), "keep");
    await Deno.symlink(outside, join(proj, ".claude"));
    await assertRejects(() => w.deletePaths([".claude/z.md"], proj, { backupExisting: true }));
    assertEquals(await Deno.readTextFile(join(outside, "z.md")), "keep");
    assertEquals(
      await Deno.stat(join(outside, "z.md.specnaut.bak")).then(() => true).catch(() => false),
      false,
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("the refusal names the path, where it resolved, and the root", async () => {
  const { root, proj, outside } = await box();
  try {
    await Deno.symlink(outside, join(proj, ".claude"));
    const err = await assertRejects(() =>
      w.writeBundle({ ".claude/x.md": { content: "A", executable: false } }, proj, {
        overwrite: true,
        backupExisting: false,
      })
    );
    assert(err instanceof Error);
    assert(err.message.includes(".claude/x.md"), err.message);
    assert(err.message.includes("resolves:"), "where it went");
    assert(
      err.message.includes("project:"),
      "and against which root — a widened root is otherwise invisible",
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("an ordinary project is written exactly as before", async () => {
  // The positive control. Every assertion above is a refusal, and a guard that
  // refuses everything would satisfy all of them.
  const { root, proj } = await box();
  try {
    const report = await w.writeBundle(
      {
        "a/b.md": { content: "hello\n", executable: false },
        "c.sh": { content: "#!/bin/sh\n", executable: true },
      },
      proj,
      { overwrite: true, backupExisting: false },
    );
    assertEquals(await Deno.readTextFile(join(proj, "a/b.md")), "hello\n");
    assertEquals(report.backups.length, 0);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
