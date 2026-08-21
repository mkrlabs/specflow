import { assert, assertEquals } from "@std/assert";
import { versionsIn } from "../../scripts/check-release-commit.ts";

/**
 * The gate between the release commit and `git tag`.
 *
 * v3.0.0 tagged a `feat(...)` commit that a stray `git add -A` had swept the
 * version bump into. The tree happened to be correct, so nothing anywhere
 * reported it — which is the problem: only luck separated "the bump rode along
 * with a feature" from "the tag captured half a feature".
 */

const SCRIPT = new URL("../../scripts/check-release-commit.ts", import.meta.url).pathname;

async function run(cwd: string, tag: string): Promise<{ code: number; err: string }> {
  const out = await new Deno.Command("deno", {
    args: ["run", "--allow-read", "--allow-run", SCRIPT, tag],
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();
  return { code: out.code, err: new TextDecoder().decode(out.stderr) };
}

async function git(cwd: string, ...args: string[]) {
  const out = await new Deno.Command("git", { args, cwd, stdout: "null", stderr: "null" }).output();
  assert(out.success, `git ${args.join(" ")} failed`);
}

/** A repo carrying all six version files at `version`, committed with `subject`. */
async function repoAt(version: string, subject: string, opts: { desync?: string } = {}) {
  const dir = await Deno.makeTempDir();
  await git(dir, "init", "-q");
  await git(dir, "config", "user.email", "t@t");
  await git(dir, "config", "user.name", "t");
  const json = (v: string) => JSON.stringify({ version: v }, null, 2);
  await Deno.writeTextFile(`${dir}/deno.json`, json(version));
  await Deno.mkdir(`${dir}/src/domain`, { recursive: true });
  await Deno.writeTextFile(
    `${dir}/src/domain/version.ts`,
    `export const VERSION = "${opts.desync ?? version}";\n`,
  );
  for (
    const p of [
      "plugin/.claude-plugin/plugin.json",
      "templates/manifest.json",
      ".codex-plugin/plugin.json",
      ".cursor-plugin/plugin.json",
    ]
  ) {
    await Deno.mkdir(`${dir}/${p.split("/").slice(0, -1).join("/")}`, { recursive: true });
    await Deno.writeTextFile(`${dir}/${p}`, json(version));
  }
  await git(dir, "add", "-A");
  await git(dir, "commit", "-q", "-m", subject);
  return dir;
}

Deno.test("a correct release commit passes", async () => {
  const dir = await repoAt("3.0.0", "chore: release v3.0.0");
  assertEquals((await run(dir, "v3.0.0")).code, 0);
});

Deno.test("the v3.0.0 mistake is refused — bump swept into a feat commit", async () => {
  const dir = await repoAt("3.0.0", "feat(changelog): let a release lead with what it is about");
  const { code, err } = await run(dir, "v3.0.0");
  assertEquals(code, 1);
  assert(err.includes('expected "chore: release v3.0.0"'), err);
});

Deno.test("version files that disagree are refused", async () => {
  // bump-version.ts writes all six in lockstep, but a hand-edit or a partial
  // revert can desync them — and a binary whose --version disagrees with its
  // templates manifest is a support ticket nobody can reproduce.
  const dir = await repoAt("3.0.0", "chore: release v3.0.0", { desync: "2.1.0" });
  const { code, err } = await run(dir, "v3.0.0");
  assertEquals(code, 1);
  assert(err.includes("src/domain/version.ts declares 2.1.0"), err);
});

Deno.test("a dirty tree is refused", async () => {
  const dir = await repoAt("3.0.0", "chore: release v3.0.0");
  await Deno.writeTextFile(`${dir}/stray.txt`, "not in the tag");
  const { code, err } = await run(dir, "v3.0.0");
  assertEquals(code, 1);
  assert(err.includes("working tree is dirty"), err);
});

Deno.test("a malformed tag is a usage error, not a release verdict", async () => {
  const dir = await repoAt("3.0.0", "chore: release v3.0.0");
  assertEquals((await run(dir, "3.0.0")).code, 2);
  assertEquals((await run(dir, "latest")).code, 2);
});

Deno.test("versionsIn finds both the JSON field and the TS constant", () => {
  assertEquals(versionsIn('{"version": "1.2.3"}'), ["1.2.3"]);
  assertEquals(versionsIn('export const VERSION = "1.2.3";'), ["1.2.3"]);
  assertEquals(versionsIn('{"version":"1.0.0"}\nVERSION = "2.0.0"'), ["1.0.0", "2.0.0"]);
});
