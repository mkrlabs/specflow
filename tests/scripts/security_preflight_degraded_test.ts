import { assert, assertStringIncludes } from "@std/assert";
import { fromFileUrl, join } from "@std/path";
import { parse } from "@std/yaml";

/**
 * #522 — the release security gate's degraded-mode warning was dead code.
 *
 * `fetch_count` recorded inaccessible queries by appending to a `missing_perms`
 * array, but every call site is a command substitution, so the function ran in
 * a subshell and the mutation died with it. The parent's array was always
 * empty and the `::warning::` had never printed.
 *
 * The `private_advisories` query returns non-numeric on every run under
 * `GITHUB_TOKEN` — the step's own comment says so — which means the step had
 * been permanently in degraded mode and permanently silent about it. The cost
 * is not a missing log line: a revoked scope on any of the seven queries reads
 * as "0 open alerts", and the gate then passes on an empty signal it believes
 * is a clean one.
 *
 * These tests run the step's actual shell against a stubbed `gh`, because the
 * defect was invisible to reading — the code looked correct and the array was
 * right there.
 */

const ROOT = fromFileUrl(new URL("../../", import.meta.url));

type Step = { name?: string; run?: string };
type Workflow = { jobs: Record<string, { steps?: Step[] }> };

async function alertStepScript(): Promise<string> {
  const wf = parse(
    await Deno.readTextFile(`${ROOT}.github/workflows/release.yml`),
  ) as Workflow;
  const step = Object.values(wf.jobs)
    .flatMap((j) => j.steps ?? [])
    .find((s) => s.name === "Query open security alerts");
  assert(step?.run, "no 'Query open security alerts' step with a run block");
  return step.run;
}

/**
 * Run the step's shell with a fake `gh` on PATH.
 *
 * @param failingUrlFragment when a queried URL contains it, `gh` emits GitHub's
 *   4xx error JSON on STDOUT — the exact shape that makes `fetch_count` take
 *   its failure branch. Pass null for a fully healthy run.
 */
async function runStep(
  failingUrlFragment: string | null,
): Promise<{ code: number; out: string }> {
  const dir = await Deno.makeTempDir({ prefix: "specnaut-522-" });
  try {
    const bin = join(dir, "bin");
    await Deno.mkdir(bin);
    // No spaces: an unquoted space in a `case` pattern is a bash syntax error,
    // which silently makes the stub non-executable — every query then "fails"
    // and the degraded warning fires for all seven, passing the wrong test for
    // the wrong reason.
    const fail = failingUrlFragment ?? "__no_such_url__";
    const stub = [
      "#!/usr/bin/env bash",
      'for a in "$@"; do',
      `  case "$a" in *${fail}*)`,
      `    echo '{"message":"Resource not accessible by integration","status":"403"}'`,
      "    exit 1;;",
      "  esac",
      "done",
      "echo 0",
      "",
    ].join("\n");
    await Deno.writeTextFile(join(bin, "gh"), stub);
    await Deno.chmod(join(bin, "gh"), 0o755);

    const script = join(dir, "step.sh");
    await Deno.writeTextFile(script, await alertStepScript());

    const { code, stdout, stderr } = await new Deno.Command("bash", {
      args: [script],
      cwd: dir,
      env: {
        PATH: `${bin}:${Deno.env.get("PATH")}`,
        RUNNER_TEMP: dir,
        GITHUB_STEP_SUMMARY: join(dir, "summary.md"),
        REPO: "specnaut/specnaut-cli",
        GH_TOKEN: "stub",
      },
      clearEnv: true,
      stdout: "piped",
      stderr: "piped",
    }).output();
    return {
      code,
      out: new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr),
    };
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

Deno.test("an inaccessible query is named in a degraded-mode warning", async () => {
  const { code, out } = await runStep("security-advisories");
  assertStringIncludes(
    out,
    "::warning::Security preflight had no GITHUB_TOKEN access to:",
  );
  assertStringIncludes(out, "private_advisories");
  // ...and ONLY that one. A warning naming all seven means the stub never ran
  // and every query fell through — which is how this test first passed while
  // proving nothing.
  assert(
    !out.includes("secret_scanning"),
    `only the inaccessible query should be named; got:\n${out}`,
  );
  // Degraded mode is a warning, never a block — the gate's behaviour is unchanged.
  assert(code === 0, `degraded mode must not fail the release, got exit ${code}:\n${out}`);
});

Deno.test("the warning discriminates — a healthy run stays silent", async () => {
  const { code, out } = await runStep(null);
  assert(
    !out.includes("had no GITHUB_TOKEN access"),
    `every query succeeded; the warning must not fire:\n${out}`,
  );
  assert(code === 0, `a clean run must pass, got exit ${code}:\n${out}`);
});

Deno.test("one failing dependabot URL is named once per label, not repeated", async () => {
  // The three dependabot counts share a URL, so a single permission gap trips
  // fetch_count three times. The labels differ, but a naive report would repeat
  // the source; this pins the de-duplication.
  const { out } = await runStep("dependabot");
  assertStringIncludes(out, "::warning::");
  const warning = out.split("\n").find((l) => l.includes("had no GITHUB_TOKEN access"))!;
  const labels = warning.split("access to:")[1].split("—")[0].trim().split(/\s+/);
  assert(
    new Set(labels).size === labels.length,
    `labels must be de-duplicated, got: ${labels.join(" ")}`,
  );
});
