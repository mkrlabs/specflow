import { assert, assertStringIncludes } from "@std/assert";
import { fromFileUrl, join } from "@std/path";

/**
 * End-to-end on the report, because the report is the deliverable.
 *
 * `upgrade` already split its preserved files into "settled" and "behind" —
 * the remediation for a recorded incident where files sat three months behind
 * while every run printed a clean success. That repair was applied to the
 * `customized` population only. A DECLARED preserve returned from
 * `buildUpgradePlan` before `staleSince` was ever computed, so it carried
 * none, landed in `settled` by construction, and printed under
 * **"customized locally (not touched)"** — a heading wrong twice over: the
 * file was declared rather than customized, and "not touched" asserted
 * exactly the fact a declaration makes unverifiable.
 *
 * The assertions are on the STATE the report names. A test that only checked
 * the path appeared somewhere would have passed against the defect.
 */

/**
 * The block of output under a heading: from it to the next blank line, or to
 * the end when the section is the last thing printed.
 *
 * The `-1` case is why this is a function. `indexOf` returning -1 fed into
 * `slice(start, -1 + 1)` yields an EMPTY string, and an empty section makes a
 * "the path is not listed here" assertion pass for the wrong reason — the
 * exact shape of vacuity these tests are about.
 */
function sectionAt(out: string, heading: string): string | null {
  const start = out.indexOf(heading);
  if (start === -1) return null;
  const end = out.indexOf("\n\n", start);
  return end === -1 ? out.slice(start) : out.slice(start, end);
}

const MAIN = fromFileUrl(new URL("../../../src/main.ts", import.meta.url));

async function specnaut(args: string[], cwd: string) {
  const { code, stdout, stderr } = await new Deno.Command("deno", {
    args: ["run", "-A", MAIN, ...args],
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr),
  };
}

async function sandbox(): Promise<string> {
  const dir = await Deno.makeTempDir({ prefix: "specnaut-declared-" });
  await new Deno.Command("git", { args: ["init", "-q", "."], cwd: dir }).output();
  await Deno.writeTextFile(join(dir, "package.json"), "{}");
  const r = await specnaut(["init", "--here", "--ai", "claude", "--backlog", "local"], dir);
  assert(r.code === 0, `init failed:\n${r.out}`);
  return dir;
}

/**
 * Declare a tracked path in `preserve.yml`, and optionally age its lock entry
 * so an update has been published for it and never applied.
 *
 * Both halves matter, as in the customized case: a declaration alone is a
 * settled freeze and unremarkable; an aged entry alone changes nothing while
 * the recorded SHA still matches the bundle.
 */
async function declare(dir: string, opts: { upstreamMoved: boolean }): Promise<string> {
  const lockPath = join(dir, ".specnaut", "installed.lock");
  const lock = await Deno.readTextFile(lockPath);

  const target = [...lock.matchAll(/^ {2}(\.claude\/agents\/[^\s:]+\.md):$/gm)]
    .map((m) => m[1])[0];
  assert(target, "expected the lock to track at least one agent file");

  await Deno.writeTextFile(
    join(dir, ".specnaut", "preserve.yml"),
    `preserved:\n  - ${target}\n`,
  );

  const block = new RegExp(
    `(^ {2}${target.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}:\\n` +
      `    sha256: )([0-9a-f]+)(\\n    installed_at: '[^']+'\\n    templates_version: )(\\S+)`,
    "m",
  );
  assert(block.test(lock), `could not locate the lock entry for ${target}`);
  await Deno.writeTextFile(
    lockPath,
    lock.replace(
      block,
      (_m, head, sha, mid) => `${head}${opts.upstreamMoved ? "f".repeat(64) : sha}${mid}1.12.0`,
    ),
  );
  return target;
}

Deno.test("a declared preserve that fell behind is reported as behind", async () => {
  const dir = await sandbox();
  try {
    const target = await declare(dir, { upstreamMoved: true });
    const { out } = await specnaut(["upgrade", "--dry-run"], dir);

    assertStringIncludes(out, "preserved by declaration, and BEHIND");
    assertStringIncludes(out, target);
    // The freeze point, from the same predicate the customized bucket uses.
    assertStringIncludes(out, "frozen at v1.12.0");
    // And why this is the only place it can be learned.
    assertStringIncludes(out, "reconcile --status");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("a declared preserve is never filed under 'customized locally'", async () => {
  // The heading is wrong twice: the file was declared, not customized, and
  // "not touched" asserts what the declaration makes unverifiable.
  const dir = await sandbox();
  try {
    const target = await declare(dir, { upstreamMoved: true });
    const { out } = await specnaut(["upgrade", "--dry-run"], dir);

    // Positive first. A bare "it is not under the wrong heading" is satisfied
    // by a report that lost the path entirely, or by one that printed nothing
    // at all — every failure satisfies a negative assertion.
    const behind = sectionAt(out, "preserved by declaration, and BEHIND");
    assert(behind !== null, `the declared-behind section is missing:\n${out}`);
    assertStringIncludes(behind, target, "the path is not in the section that names its state");

    const settled = sectionAt(out, "customized locally (not touched)");
    assert(
      settled === null || !settled.includes(target),
      `a declared preserve is still listed under "customized locally":\n${settled}`,
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("a declared preserve level with upstream is not reported as behind", async () => {
  // The other half. A report that called every declared path behind would
  // pass the first assertion and be worth nothing.
  const dir = await sandbox();
  try {
    const target = await declare(dir, { upstreamMoved: false });
    const { out } = await specnaut(["upgrade", "--dry-run"], dir);

    assertStringIncludes(out, "preserved by declaration — level with upstream");
    const behind = sectionAt(out, "preserved by declaration, and BEHIND");
    assert(
      behind === null || !behind.includes(target),
      `an up-to-date declared path was called behind:\n${behind}`,
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("learning a declared path is behind needs no flag", async () => {
  // AC3: not `--reset-preserved`, which lifts the freeze, and not a full
  // `specnaut diff` dump. A plain dry run says it.
  const dir = await sandbox();
  try {
    await declare(dir, { upstreamMoved: true });
    const { out } = await specnaut(["upgrade", "--dry-run"], dir);
    assertStringIncludes(out, "preserved by declaration, and BEHIND");
    assert(
      !out.includes("--reset-preserved"),
      "the report points at the flag that lifts the freeze instead of reporting the drift",
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
