import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { fromFileUrl, join } from "@std/path";

/**
 * #523 — `create_pr_idempotent` reported every `gh pr create` failure as
 * benign idempotency.
 *
 * The old body was `gh pr create … 2>/dev/null` under an `if !`, printing one
 * reassuring "PR already exists" line for any non-zero exit. A rate limit, a
 * revoked scope, a missing base branch and a real already-exists all produced
 * the same sentence and the same 0.
 *
 * When opening the PR is the channel's last step, a lie here is the last word —
 * which is how a publish channel stayed green for eighteen months without
 * publishing anything. These tests drive the real function with a stubbed `gh`,
 * one scenario per failure mode, because the four are indistinguishable by
 * reading.
 */

const ROOT = fromFileUrl(new URL("../../", import.meta.url));

type Scenario = {
  /** Exit code and stderr for `gh pr create`. */
  createExit: number;
  createErr?: string;
  /** What `gh pr list` reports: a PR number, or nothing. */
  existingPr?: number;
  /** Make `gh pr list` itself fail, as a rate limit would. */
  listFails?: boolean;
};

async function callHelper(s: Scenario): Promise<{ code: number; out: string }> {
  const dir = await Deno.makeTempDir({ prefix: "specnaut-523-" });
  try {
    const bin = join(dir, "bin");
    await Deno.mkdir(bin);

    const listBody = s.listFails
      ? ['  echo "API rate limit exceeded" >&2', "  exit 1"]
      : [`  printf '%s' "${s.existingPr ?? ""}"`, "  exit 0"];

    const stub = [
      "#!/usr/bin/env bash",
      'if [ "$1" = "pr" ] && [ "$2" = "create" ]; then',
      `  printf '%s\\n' ${JSON.stringify(s.createErr ?? "")} >&2`,
      `  exit ${s.createExit}`,
      "fi",
      'if [ "$1" = "pr" ] && [ "$2" = "list" ]; then',
      ...listBody,
      "fi",
      "exit 0",
      "",
    ].join("\n");
    await Deno.writeTextFile(join(bin, "gh"), stub);
    await Deno.chmod(join(bin, "gh"), 0o755);

    const driver = join(dir, "drive.sh");
    await Deno.writeTextFile(
      driver,
      [
        "set -uo pipefail",
        `. "${ROOT}scripts/lib/sync-helpers.sh"`,
        'create_pr_idempotent "acme/repo" "sync/v1" "title" "body"',
        "exit $?",
        "",
      ].join("\n"),
    );

    const { code, stdout, stderr } = await new Deno.Command("bash", {
      args: [driver],
      cwd: dir,
      env: { PATH: `${bin}:${Deno.env.get("PATH")}`, HOME: dir },
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

Deno.test("a successful create returns 0 and says nothing about existing PRs", async () => {
  const { code, out } = await callHelper({ createExit: 0 });
  assertEquals(code, 0);
  assert(!out.includes("already exists"), out);
});

Deno.test("a genuine already-exists is still benign", async () => {
  // The case the helper exists for: a re-run over a branch whose PR is open.
  const { code, out } = await callHelper({
    createExit: 1,
    createErr: "a pull request for branch sync/v1 already exists",
    existingPr: 42,
  });
  assertEquals(code, 0, `an open PR for this head must not fail the release:\n${out}`);
  assertStringIncludes(out, "PR #42 already exists");
});

Deno.test("a rate limit is not idempotency", async () => {
  const { code, out } = await callHelper({
    createExit: 1,
    createErr: "HTTP 403: API rate limit exceeded",
  });
  assert(code !== 0, `the release log must see this as a failure:\n${out}`);
  assertStringIncludes(out, "API rate limit exceeded");
});

Deno.test("a revoked scope is not idempotency", async () => {
  const { code, out } = await callHelper({
    createExit: 1,
    createErr: "HTTP 403: Resource not accessible by personal access token",
  });
  assert(code !== 0, out);
  assertStringIncludes(out, "Resource not accessible");
});

Deno.test("a missing base branch is not idempotency", async () => {
  const { code, out } = await callHelper({
    createExit: 1,
    createErr: "GraphQL: Base ref must be a branch (createPullRequest)",
  });
  assert(code !== 0, out);
  assertStringIncludes(out, "Base ref must be a branch");
});

Deno.test("a failing lookup propagates rather than reading as idempotency", async () => {
  // If `gh pr list` cannot answer, we do not know whether a PR exists — and
  // "we do not know" must never resolve to "all good".
  const { code, out } = await callHelper({
    createExit: 1,
    createErr: "HTTP 502",
    listFails: true,
  });
  assert(code !== 0, `an unanswerable lookup must not be read as success:\n${out}`);
});
