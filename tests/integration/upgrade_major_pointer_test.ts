import { assert, assertEquals } from "@std/assert";
import { fromFileUrl, join } from "@std/path";

const MAIN = fromFileUrl(new URL("../../src/main.ts", import.meta.url));

/**
 * #481 — end to end: a major-crossing upgrade names the migration guide, a
 * same-major one does not.
 *
 * The predicate is unit-tested; this pins the wiring, which is the half that
 * actually reaches a user. A correct predicate nobody calls prints nothing.
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

/** Rewrites the lock's recorded templates version, faking an older install. */
async function setLockVersion(dir: string, version: string) {
  const path = join(dir, ".specnaut/installed.lock");
  const lock = await Deno.readTextFile(path);
  await Deno.writeTextFile(
    path,
    lock.replace(/^templates_version: .*$/m, `templates_version: ${version}`),
  );
}

async function upgradeFrom(version: string) {
  const dir = await Deno.makeTempDir({ prefix: "specnaut-major-pointer-" });
  try {
    assertEquals((await runSpecnaut(INIT, dir)).code, 0);
    await setLockVersion(dir, version);
    // Rewriting the recorded version alone leaves every file byte-identical, so
    // the plan is all-unchanged and `upgrade` short-circuits to "already up to
    // date" before any of this is reached. Remove a managed file so the run has
    // real work, which is also what a genuine 1.x → 2.x upgrade looks like.
    await Deno.remove(join(dir, ".claude/skills/specnaut/phases/tasks.md"));
    const up = await runSpecnaut(["upgrade", "--force"], dir);
    assertEquals(up.code, 0, `upgrade failed: ${up.stderr}`);
    return up.stdout;
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

Deno.test("a major-crossing upgrade names the migration guide", async () => {
  const out = await upgradeFrom("1.21.0");
  assert(out.includes("UPGRADING.md"), "the guide's path must appear in the output");
  assert(out.includes("major version"), "and the reason it is being shown");
});

Deno.test("a same-major upgrade says nothing about it", async () => {
  // The quiet half. A pointer on every patch bump is a line people learn to
  // skip, and then it is not there when it matters.
  const out = await upgradeFrom("2.0.0");
  assert(!out.includes("UPGRADING.md"), "no migration pointer on a routine bump");
});
