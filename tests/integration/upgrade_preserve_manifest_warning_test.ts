import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { fromFileUrl, join } from "@std/path";

const MAIN = fromFileUrl(new URL("../../src/main.ts", import.meta.url));

/**
 * #535 — a `preserve.yml` that declares nothing must say so.
 *
 * Every malformed shape parsed to an empty config and produced no output: no
 * warning, no notice, no non-zero exit. Indistinguishable from having no
 * manifest, so the maintainer read the silence as protection while the files
 * they had "frozen" were refreshed. A session hit this, tried `preserve:` and
 * then a bare list, saw nothing happen either time, and concluded Specnaut has
 * no way to decline a bundled file — a false conclusion, which is the measure
 * of what a silent no-op costs.
 *
 * These assert on the *text*: which file, and which of the three reasons. A
 * presence-shaped assertion ("something was printed") passes for a message
 * naming the wrong file or the wrong key, which is the failure being guarded.
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

/** A scaffolded project, optionally carrying a preserve manifest. */
async function project(manifest: string | null): Promise<string> {
  const dir = await Deno.makeTempDir();
  const init = await runSpecnaut(INIT, dir);
  assertEquals(init.code, 0, `init failed: ${init.stderr}`);
  if (manifest !== null) {
    await Deno.writeTextFile(join(dir, ".specnaut/preserve.yml"), manifest);
  }
  return dir;
}

async function upgradeStderr(manifest: string | null): Promise<{ err: string; code: number }> {
  const dir = await project(manifest);
  try {
    const r = await runSpecnaut(["upgrade", "--dry-run"], dir);
    return { err: r.stderr, code: r.code };
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

Deno.test("a bare top-level list names the expected key", async () => {
  const { err, code } = await upgradeStderr("- AGENTS.md\n");
  assertStringIncludes(err, ".specnaut/preserve.yml");
  assertStringIncludes(err, "preserved:");
  assertStringIncludes(err, "nothing is being preserved");
  assertEquals(code, 0, "the warning is advisory and must not change the exit code");
});

Deno.test("the wrong key name names the expected key", async () => {
  const { err, code } = await upgradeStderr("preserve:\n  - AGENTS.md\n");
  assertStringIncludes(err, ".specnaut/preserve.yml");
  assertStringIncludes(err, "preserved:");
  assertEquals(code, 0);
});

Deno.test("unparseable YAML is reported as unparseable, not as a wrong key", async () => {
  const { err, code } = await upgradeStderr("preserved: [\n  unclosed\n");
  assertStringIncludes(err, ".specnaut/preserve.yml");
  assertStringIncludes(err, "not valid YAML");
  assertEquals(code, 0);
});

Deno.test("the right key with no usable paths is its own message", async () => {
  const { err, code } = await upgradeStderr("preserved: []\n");
  assertStringIncludes(err, ".specnaut/preserve.yml");
  assertStringIncludes(err, "no usable paths");
  assertEquals(code, 0);
});

Deno.test("an absent manifest stays completely silent", async () => {
  // Absence is the normal case for almost every project. A warning here would
  // train every user to ignore the one that matters.
  const { err, code } = await upgradeStderr(null);
  assert(
    !err.includes("preserve.yml"),
    `no manifest must produce no preserve output, got: ${err}`,
  );
  assertEquals(code, 0);
});

Deno.test("a correct manifest stays silent too", async () => {
  const { err } = await upgradeStderr("preserved:\n  - AGENTS.md\n");
  assert(
    !err.includes("nothing is being preserved"),
    `a working manifest must not warn, got: ${err}`,
  );
});
