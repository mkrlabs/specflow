import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { fromFileUrl, join } from "@std/path";

/**
 * A gate must not be able to fail because its output was piped.
 *
 * `preflight.sh` runs under `set -e`. When its stdout goes away — `| tail`,
 * `| head`, a closing terminal — the next write aborts the script, and the
 * status it aborts with is indistinguishable from a real gate failure. What
 * that cost, observed on the v4.2.2 attempt: `preflight.sh | tail` produced
 * `echo: write error: Interrupted system call` mid-report, and preflight
 * announced **"smoke audit is red — fix the findings"** over an audit that had
 * found nothing and had never reached its own summary. Advice for a condition
 * that had not occurred, at the worst possible moment — the same class the
 * `case "$audit_rc"` block above it already exists to prevent.
 *
 * Two mechanisms, two different failures, and neither alone is enough:
 * SIGPIPE kills the shell with 141 before any `|| true` is consulted, and
 * EINTR makes the write return non-zero without any signal being fatal. The
 * script carries both, and this file is what keeps them there — `bash -n`
 * cannot see either, and the first attempt at the guard was a `say` whose body
 * called `say`.
 */

const ROOT = fromFileUrl(new URL("../../", import.meta.url));
const PREFLIGHT = `${ROOT}.specnaut/release/preflight.sh`;

/** The pipe-hardening prologue: everything above the first `REPO_ROOT=`. */
async function prologue(): Promise<string> {
  const src = await Deno.readTextFile(PREFLIGHT);
  const cut = src.indexOf('REPO_ROOT="$(git rev-parse');
  assert(cut > 0, "preflight.sh no longer opens with a REPO_ROOT assignment");
  return src.slice(0, cut);
}

/**
 * Run the real prologue, then emit far more output than a `head -2` will take.
 * Exit 0 is the assertion: the body decided nothing was wrong, and the closed
 * consumer must not overwrite that.
 */
async function runWithClosedConsumer(body: string): Promise<number> {
  const script = `${await prologue()}\n${body}\n`;
  return await withWatchdog(script);
}

/**
 * Run a script whose stdout is dropped after the first chunk, and never wait
 * forever for it.
 *
 * The watchdog is not defensive decoration. Measured against the UNFIXED
 * script, this harness does not fail — it BLOCKS, because a writer whose pipe
 * is full and undrained waits rather than erroring. A probe that hangs where
 * it should go red reports nothing and burns a CI job's whole timeout instead,
 * so the hang is converted into the failure it stands for.
 */
async function withWatchdog(script: string): Promise<number> {
  const p = new Deno.Command("bash", {
    args: ["-c", script],
    stdout: "piped",
    stderr: "null",
  }).spawn();

  // Read one chunk, then drop the reader — the writer's stdout is now closed.
  const reader = p.stdout.getReader();
  await reader.read();
  await reader.cancel();

  let timer: number | ReturnType<typeof setTimeout> = 0;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), 15_000);
  });
  const result = await Promise.race([p.status, timeout]);
  clearTimeout(timer);

  if (result === "timeout") {
    p.kill("SIGKILL");
    await p.status;
    throw new Error(
      "the script blocked on its closed stdout instead of finishing — " +
        "a full pipe with no reader makes the writer wait, which is neither a " +
        "pass nor a usable failure",
    );
  }
  return result.code;
}

Deno.test("preflight: a closed stdout does not forge a failure", async () => {
  const code = await runWithClosedConsumer(
    'for i in $(seq 1 20000); do say "line $i"; done\nsay "VERDICT: clean"\nexit 0',
  );
  assertEquals(code, 0, "a closed consumer turned a clean run into a failing one");
});

Deno.test("preflight: a real failure still fails through a closed stdout", async () => {
  // The guard must not swallow verdicts along with write errors. A gate that
  // cannot fail is worse than one that fails spuriously.
  const code = await runWithClosedConsumer(
    'for i in $(seq 1 20000); do say "line $i"; done\nsay "❌ something is wrong"\nexit 1',
  );
  assertEquals(code, 1, "an explicit failure was lost");
});

Deno.test("preflight: the helper does not call itself", async () => {
  // The first version of this guard was written by a regex that rewrote every
  // `echo "` in the file — including the one inside the helper's own body,
  // producing `say() { say "$@" ...; }`. `bash -n` parses that happily.
  const src = await Deno.readTextFile(PREFLIGHT);
  const def = src.split("\n").find((l) => l.trimStart().startsWith("say()"));
  assert(def, "the say helper is gone");
  assert(
    !/say\(\)\s*\{\s*say\b/.test(def),
    `the helper calls itself — infinite recursion: ${def}`,
  );
});

Deno.test("preflight: both pipe mechanisms are present", async () => {
  // Each answers a different failure and each was measured insufficient alone.
  const src = await Deno.readTextFile(PREFLIGHT);
  assertStringIncludes(src, 'trap "" PIPE');
  assert(
    /say\(\)\s*\{[^}]*2>\/dev\/null\s*\|\|\s*true/.test(src),
    "the say helper no longer guards its own write",
  );
});

Deno.test("preflight: the audit reports through a file, not through shared stdout", async () => {
  // audit.sh runs under `set -e` as well, and aborts with exit 1 — the same
  // code a real coverage gap uses. Handing it a regular file is what keeps its
  // exit code meaning what the `case` below reads it as.
  const src = await Deno.readTextFile(PREFLIGHT);
  const line = src.split("\n").find((l) => l.includes("scripts/smoke/audit.sh"));
  assert(line, "preflight no longer runs the smoke audit");
  assert(
    /audit\.sh\s*>\s*"\$audit_log"/.test(line),
    `the audit still writes to preflight's own stdout: ${line}`,
  );
});

Deno.test("preflight: a piped audit cannot be reported as findings", async () => {
  // End to end on the real invocation block, with a stub audit that prints a
  // lot and exits 0. Before the fix the stub's writes died on preflight's
  // broken pipe and the run was announced as a coverage failure.
  const dir = await Deno.makeTempDir({ prefix: "specnaut-preflight-pipe-" });
  try {
    await Deno.mkdir(join(dir, "scripts", "smoke"), { recursive: true });
    await Deno.writeTextFile(
      join(dir, "scripts", "smoke", "audit.sh"),
      "#!/usr/bin/env bash\nset -euo pipefail\nfor i in $(seq 1 20000); do echo \"audit line $i\"; done\necho '  ✓ clean'\nexit 0\n",
    );

    const src = await Deno.readTextFile(PREFLIGHT);
    const start = src.indexOf('say "▶ smoke audit"');
    const end = src.indexOf("esac", start);
    assert(start > 0 && end > start, "the smoke-audit block moved");
    const block = src.slice(start, end + 4);

    const script = `${await prologue()}\ncd ${
      JSON.stringify(dir)
    }\n${block}\nsay "REACHED THE END"\nexit 0\n`;
    assertEquals(await withWatchdog(script), 0, "a piped audit was reported as a failure");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
