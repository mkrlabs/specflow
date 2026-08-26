import { assert, assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import {
  assertInsideProject,
  resolveProjectRoot,
  resolveTarget,
} from "../../src/infrastructure/fs_containment.ts";

/** A project directory beside an `outside/` sibling, both under one temp root. */
async function box(): Promise<{ root: string; proj: string; outside: string }> {
  const root = await Deno.makeTempDir({ prefix: "containment-" });
  const proj = join(root, "proj");
  const outside = join(root, "outside");
  await Deno.mkdir(proj);
  await Deno.mkdir(outside);
  return { root, proj, outside };
}

Deno.test("a temp-dir project is inside itself", async () => {
  // The assertion that fails FIRST if the two sides are resolved differently.
  // `makeTempDir` returns a path under /var on macOS, which is a symlink to
  // /private/var — so a lexical root against a realPath'd candidate reports
  // every file in the project as outside it, and the whole suite goes red.
  const { root, proj } = await box();
  try {
    const r = await resolveProjectRoot(proj);
    await assertInsideProject(r, join(proj, "a/b.md"));
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("an absent destination is judged on its parent", async () => {
  const { root, proj } = await box();
  try {
    const r = await resolveProjectRoot(proj);
    await assertInsideProject(r, join(proj, "not-written-yet.md"));
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("a symlink resolving INSIDE the project is allowed", async () => {
  // FR-005 / SC-003. This is the case the existing skipIfExists guard was
  // written to protect — a project consolidating its context files — and the
  // one an over-correction into a blanket symlink refusal breaks.
  const { root, proj } = await box();
  try {
    await Deno.writeTextFile(join(proj, "real.md"), "x");
    await Deno.symlink(join(proj, "real.md"), join(proj, "link.md"));
    const r = await resolveProjectRoot(proj);
    await assertInsideProject(r, join(proj, "link.md"));
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("a leaf symlink resolving outside is refused", async () => {
  // Shape B. The plan's first algorithm — resolve the PARENT and append the
  // leaf — says "inside" here, because the parent is a normal in-project
  // directory. Measured before this test existed: rel="link.md", contained,
  // allowed, and the write landed on the victim.
  const { root, proj, outside } = await box();
  try {
    await Deno.writeTextFile(join(outside, "victim.md"), "ORIGINAL");
    await Deno.symlink(join(outside, "victim.md"), join(proj, "link.md"));
    const r = await resolveProjectRoot(proj);
    const err = await assertRejects(() => assertInsideProject(r, join(proj, "link.md")));
    assert(err instanceof Error);
    assert(err.message.includes("leaves the project"), err.message);
    assert(err.message.includes("victim.md"), "the message must name where it resolved to");
    assert(err.message.includes(r), "and the resolved root, so a widened root is visible");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("a symlinked ANCESTOR is refused", async () => {
  // Shape A and C. The dest is a clean relative path the whole way; the escape
  // is one directory up.
  const { root, proj, outside } = await box();
  try {
    await Deno.symlink(outside, join(proj, ".claude"));
    const r = await resolveProjectRoot(proj);
    await assertRejects(() => assertInsideProject(r, join(proj, ".claude/x.md")));
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("a DANGLING symlink is judged on where it points, not treated as absent", async () => {
  // The trap in the obvious fix. "Try realPath, fall back to the parent on
  // NotFound" cannot tell a dangling link from a file that does not exist, and
  // writeTextFile on a dangling link CREATES the target — so the fallback is
  // the escape. Measured: Deno.realPath does not even throw on a dangling link
  // on macOS, so a predicate written that way behaves differently per platform.
  const { root, proj, outside } = await box();
  try {
    await Deno.symlink(join(outside, "does-not-exist.md"), join(proj, "dangling.md"));
    const r = await resolveProjectRoot(proj);
    await assertRejects(() => assertInsideProject(r, join(proj, "dangling.md")));
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("a dangling symlink pointing INSIDE is still allowed", async () => {
  // The other half of the rule: a dangling link is judged on its target, not
  // refused for being dangling. Without this, the previous test passes against
  // a blanket "refuse every unresolvable link".
  const { root, proj } = await box();
  try {
    await Deno.symlink(join(proj, "not-yet.md"), join(proj, "dangling-in.md"));
    const r = await resolveProjectRoot(proj);
    await assertInsideProject(r, join(proj, "dangling-in.md"));
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("resolveTarget follows a chain of links to its end", async () => {
  const { root, proj, outside } = await box();
  try {
    await Deno.writeTextFile(join(outside, "end.md"), "x");
    await Deno.symlink(join(outside, "end.md"), join(outside, "mid.md"));
    await Deno.symlink(join(outside, "mid.md"), join(proj, "start.md"));
    const resolved = await resolveTarget(join(proj, "start.md"));
    assertEquals(resolved, await Deno.realPath(join(outside, "end.md")));
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("the filesystem root is refused as a project", async () => {
  await assertRejects(() => resolveProjectRoot("/"));
});

Deno.test("the home directory is refused as a project", async () => {
  const home = Deno.env.get("HOME");
  if (home === undefined || home === "") return; // not applicable on this host
  await assertRejects(() => resolveProjectRoot(home));
});
