// `setup-plan.sh` used to copy a blank plan template over the PREVIOUS
// feature's finished plan, on every feature after the first.
//
// The trigger was an ordering bug in the phase doc: `plan` ran
// `create-new-feature.sh`, then `setup-plan.sh`, and only afterwards persisted
// `.specnaut/feature.json`. Since `get_feature_paths()` reads that file ahead
// of the branch name, `setup-plan.sh` resolved its paths into the feature the
// PREVIOUS run had been writing. On feature 001 the file does not exist yet,
// the branch-prefix fallback fires, and everything looks correct — which is
// why this survived: it is invisible exactly once, on the run everybody tests.
//
// Nothing covered this script at all before these tests. Two independent
// guards are asserted here, because either alone leaves the other's caller
// exposed: the copy refuses to clobber, and a resolution that contradicts the
// branch fails instead of being emitted.

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { fromFileUrl, join } from "@std/path";

const BASH = fromFileUrl(
  new URL("../../templates/core/specnaut/scripts/bash/", import.meta.url),
);

const PWSH = fromFileUrl(
  new URL("../../templates/core/specnaut/scripts/powershell/", import.meta.url),
);

type Result = { code: number; stdout: string; stderr: string };
type Runner = { name: string; run: (args: string[], cwd: string) => Promise<Result> };

async function exec(bin: string, argv: string[], cwd: string): Promise<Result> {
  const { code, stdout, stderr } = await new Deno.Command(bin, {
    args: argv,
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

async function hasPwsh(): Promise<boolean> {
  try {
    return (await exec("pwsh", ["-NoProfile", "-Command", "exit 0"], ".")).code === 0;
  } catch {
    return false;
  }
}

const PWSH_AVAILABLE = await hasPwsh();

/**
 * The same scenarios run against BOTH implementations.
 *
 * The defect existed in both, and the guard was carried across to neither.
 * Two hand-written copies of these tests would have to be kept in agreement by
 * somebody remembering to; running one set over both runners makes the parity
 * a property of the file instead.
 *
 * The PowerShell twin was in fact the worse of the two — its copy passed an
 * explicit `-Force` — and it was the half nothing in this repository executed:
 * no test touched a `.ps1`, and no workflow ran one.
 */
const RUNNERS: Runner[] = [
  { name: "bash", run: (args, cwd) => exec("bash", [join(BASH, "setup-plan.sh"), ...args], cwd) },
];
if (PWSH_AVAILABLE) {
  RUNNERS.push({
    name: "pwsh",
    run: (args, cwd) =>
      exec("pwsh", ["-NoProfile", "-File", join(PWSH, "setup-plan.ps1"), ...args], cwd),
  });
}

Deno.test("the PowerShell arm actually runs where it must", () => {
  // A missing interpreter must not quietly halve what this file covers.
  // GitHub-hosted runners ship pwsh on all three OSes, so on CI its absence is
  // a broken environment, not a local convenience.
  if (Deno.env.get("CI") === "true") {
    assert(PWSH_AVAILABLE, "pwsh is absent on CI — the PowerShell scenarios did not run");
  } else if (!PWSH_AVAILABLE) {
    console.log("  note: pwsh not installed — PowerShell scenarios skipped locally");
  }
});

/**
 * A project with one finished feature, its `feature.json` still naming it, and
 * a second feature branch checked out. This is the state the documented
 * procedure produces between the two script calls — not a contrived one.
 */
async function withTwoFeatures(
  fn: (dir: string, plans: { first: string; second: string }) => Promise<void>,
): Promise<void> {
  const dir = await Deno.makeTempDir({ prefix: "setup-plan-clobber-" });
  try {
    const git = async (...args: string[]) => {
      await new Deno.Command("git", { args, cwd: dir, stdout: "null", stderr: "null" }).output();
    };
    await git("init", "-q");
    await git("config", "user.email", "t@example.invalid");
    await git("config", "user.name", "t");

    await Deno.mkdir(join(dir, ".specnaut", "templates"), { recursive: true });
    await Deno.writeTextFile(
      join(dir, ".specnaut", "templates", "plan-template.md"),
      "# Plan template\n\nBLANK TEMPLATE MARKER\n",
    );

    const first = join(dir, ".specnaut", "specs", "001-alpha");
    const second = join(dir, ".specnaut", "specs", "002-beta");
    await Deno.mkdir(first, { recursive: true });
    await Deno.mkdir(second, { recursive: true });

    // 001 is finished: a real plan, nothing like the template.
    await Deno.writeTextFile(
      join(first, "plan.md"),
      "# Alpha\n\nFINISHED PLAN MARKER\n" + "a real decision\n".repeat(50),
    );
    await Deno.writeTextFile(join(second, "plan.md"), "# Plan template\n\nBLANK TEMPLATE MARKER\n");

    await Deno.writeTextFile(join(dir, "README.md"), "x\n");
    await git("add", "-A");
    await git("commit", "-qm", "init");
    await git("checkout", "-qb", "002-beta");

    // The state the phase doc used to leave behind: still naming feature 001.
    await Deno.writeTextFile(
      join(dir, ".specnaut", "feature.json"),
      JSON.stringify({ feature_directory: first, linked_issue: null }),
    );

    await fn(dir, { first: join(first, "plan.md"), second: join(second, "plan.md") });
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

for (const runner of RUNNERS) {
  Deno.test(`setup-plan [${runner.name}]: does not destroy the previous feature's plan`, async () => {
    await withTwoFeatures(async (dir, plans) => {
      const before = await Deno.readTextFile(plans.first);
      await runner.run(["--json"], dir);
      // Whatever the script decided to do, feature 001's plan is not collateral.
      assertEquals(
        await Deno.readTextFile(plans.first),
        before,
        "the previous feature's plan.md was modified",
      );
    });
  });
}

for (const runner of RUNNERS) {
  Deno.test(`setup-plan [${runner.name}]: fails on a feature.json that contradicts the branch`, async () => {
    await withTwoFeatures(async (dir) => {
      const { code, stderr } = await runner.run(["--json"], dir);
      assert(code !== 0, "a self-contradicting resolution must not exit 0");
      // The message has to name BOTH sides, or it cannot be acted on.
      assertStringIncludes(stderr, "002-beta");
      assertStringIncludes(stderr, "001-alpha");
    });
  });
}

for (const runner of RUNNERS) {
  Deno.test(`setup-plan [${runner.name}]: emits no JSON when the resolution contradicts itself`, async () => {
    // The original defect emitted BRANCH and IMPL_PLAN naming different features
    // in one object. A caller parsing that JSON has no way to notice.
    await withTwoFeatures(async (dir) => {
      const { stdout } = await runner.run(["--json"], dir);
      assertEquals(stdout.trim(), "", `expected no JSON on the error path, got: ${stdout}`);
    });
  });
}

for (const runner of RUNNERS) {
  Deno.test(`setup-plan [${runner.name}]: leaves an existing plan alone on the happy path`, async () => {
    // `create-new-feature.sh` has already written the template into the new
    // feature's directory by the time this runs, so the copy is redundant. If a
    // plan is there, it stays there — that is what makes the script incapable of
    // destroying work, independently of whether the path resolved correctly.
    await withTwoFeatures(async (dir, plans) => {
      await Deno.writeTextFile(
        join(dir, ".specnaut", "feature.json"),
        JSON.stringify({ feature_directory: join(dir, ".specnaut", "specs", "002-beta") }),
      );
      await Deno.writeTextFile(plans.second, "# Beta\n\nWORK IN PROGRESS MARKER\n");

      const { code, stdout } = await runner.run(["--json"], dir);
      assertEquals(code, 0, "the consistent case must still succeed");
      assertStringIncludes(await Deno.readTextFile(plans.second), "WORK IN PROGRESS MARKER");
      assertStringIncludes(stdout, "002-beta");
    });
  });
}

for (const runner of RUNNERS) {
  Deno.test(`setup-plan [${runner.name}]: still seeds a plan when none exists`, async () => {
    // A guard that refuses to write is satisfied by never writing. This is the
    // assertion that keeps the script doing its job.
    await withTwoFeatures(async (dir, plans) => {
      await Deno.writeTextFile(
        join(dir, ".specnaut", "feature.json"),
        JSON.stringify({ feature_directory: join(dir, ".specnaut", "specs", "002-beta") }),
      );
      await Deno.remove(plans.second);

      const { code } = await runner.run(["--json"], dir);
      assertEquals(code, 0);
      assertStringIncludes(await Deno.readTextFile(plans.second), "BLANK TEMPLATE MARKER");
    });
  });
}
