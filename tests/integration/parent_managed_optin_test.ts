import { assert, assertEquals } from "@std/assert";
import { exists } from "@std/fs/exists";
import { fromFileUrl, join } from "@std/path";

const MAIN = fromFileUrl(new URL("../../src/main.ts", import.meta.url));

/**
 * #476 — a child on a foreign toolchain must be able to declare itself
 * parent-managed, and the flip must clean the lock rather than just stop
 * writing.
 *
 * Detection had one positive signal: membership of the parent's `deno.json`
 * `workspace[]`. That quietly made "is a Deno workspace member" the definition
 * of "inherits agentic files from the parent" — unreachable for a sub-repo kept
 * out of that array precisely because including it breaks its own build. There
 * was a negative opt-out marker and no positive opt-in.
 *
 * The second half matters as much: suppressing future writes leaves rows in
 * `installed.lock` describing files the workspace does not own. The
 * resurrection would move from "planned adds" to phantom rows.
 */

async function runSpecnaut(args: string[], cwd: string) {
  const { code, stdout, stderr } = await new Deno.Command("deno", {
    args: ["run", "--allow-read", "--allow-write", "--allow-run", "--allow-env", MAIN, ...args],
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    code,
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
  };
}

const INIT = ["init", "--here", "--no-git", "--ai", "claude", "--backlog", "local"];

/**
 * A providing workspace with a child that is NOT in its `workspace[]` — the
 * shape of a sub-repo running a different toolchain.
 */
async function workspaceWithForeignChild(): Promise<{ root: string; child: string }> {
  const root = await Deno.makeTempDir({ prefix: "specnaut-parent-optin-" });
  await Deno.mkdir(join(root, ".specnaut"), { recursive: true });
  // The parent is a Specnaut workspace, but its workspace array names only a
  // sibling — the child below is deliberately absent from it.
  await Deno.writeTextFile(
    join(root, "deno.json"),
    JSON.stringify({ workspace: ["./other-half"] }, null, 2),
  );
  const child = join(root, "apps", "foreign-half");
  await Deno.mkdir(child, { recursive: true });
  return { root, child };
}

Deno.test("without the marker, a non-member child is provisioned standalone", async () => {
  // The baseline. Nothing about this changes: absent any declaration, a child
  // the parent does not claim gets its own agentic files.
  const { root, child } = await workspaceWithForeignChild();
  try {
    assertEquals((await runSpecnaut(INIT, child)).code, 0);
    assertEquals(
      await exists(join(child, ".claude/skills/specnaut/SKILL.md")),
      true,
      "an unclaimed child must still get its own agentic files",
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("the child's marker makes it parent-managed without touching deno.json", async () => {
  const { root, child } = await workspaceWithForeignChild();
  try {
    await Deno.mkdir(join(child, ".specnaut"), { recursive: true });
    await Deno.writeTextFile(
      join(child, ".specnaut/parent-managed.yml"),
      "# agentic files come from the enclosing workspace\n",
    );

    const init = await runSpecnaut(INIT, child);
    assertEquals(init.code, 0, `init failed: ${init.stderr}`);

    assertEquals(
      await exists(join(child, ".claude/skills/specnaut/SKILL.md")),
      false,
      "a declared child must not receive its own copy of the agentic files",
    );
    // ...while the toolkit itself is still provisioned.
    assertEquals(await exists(join(child, ".specnaut/templates")), true);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("standalone.yml still wins over the new marker", async () => {
  // The opt-out is the override and stays the override — a user must be able
  // to refuse a layout that happens to look parent-managed.
  const { root, child } = await workspaceWithForeignChild();
  try {
    await Deno.mkdir(join(child, ".specnaut"), { recursive: true });
    await Deno.writeTextFile(join(child, ".specnaut/parent-managed.yml"), "\n");
    await Deno.writeTextFile(join(child, ".specnaut/standalone.yml"), "\n");

    assertEquals((await runSpecnaut(INIT, child)).code, 0);
    assertEquals(
      await exists(join(child, ".claude/skills/specnaut/SKILL.md")),
      true,
      "standalone.yml must defeat the parent-managed declaration",
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("the flip prunes agentic rows from the lock and plans no agentic adds", async () => {
  const { root, child } = await workspaceWithForeignChild();
  try {
    // Scaffold standalone first: the lock now records agentic files.
    assertEquals((await runSpecnaut(INIT, child)).code, 0);
    const lockPath = join(child, ".specnaut/installed.lock");
    assert(
      (await Deno.readTextFile(lockPath)).includes(".claude/skills/"),
      "setup: the standalone lock must record agentic entries",
    );

    // Now the workspace claims it, and the local agentic files are removed —
    // exactly what centralising them looks like.
    await Deno.writeTextFile(join(child, ".specnaut/parent-managed.yml"), "\n");
    await Deno.remove(join(child, ".claude"), { recursive: true });

    const up = await runSpecnaut(["upgrade"], child);
    assertEquals(up.code, 0, `upgrade failed: ${up.stderr}`);

    const lock = await Deno.readTextFile(lockPath);
    assert(
      !lock.includes(".claude/skills/") && !lock.includes(".claude/agents/") &&
        !lock.includes(".claude/commands/"),
      "the lock must not keep describing files this workspace no longer owns",
    );
    assertEquals(
      await exists(join(child, ".claude/skills/specnaut/SKILL.md")),
      false,
      "the upgrade must not re-add the agentic directory the workspace removed",
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
