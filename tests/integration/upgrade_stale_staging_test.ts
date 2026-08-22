import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { fromFileUrl, join } from "@std/path";

const MAIN = fromFileUrl(new URL("../../src/main.ts", import.meta.url));

/**
 * #477 — `upgrade --force` must not leave staged copies of files it wrote.
 *
 * Staging exists so `reconcile` can offer the upstream version of a file the
 * run refused to touch. A file `--force` overwrote has nothing left to
 * reconcile — its destination IS the upstream — so the staged copy is stale.
 *
 * Left behind, it inflated `reconcile --status` permanently. On the workspace
 * where this was found, a forced upgrade reported 46 pending paths, 23 of them
 * byte-identical to their staged copy. The assertions below are on the COUNT,
 * because the failure mode is an over-long list, not an error: every command
 * exited 0 throughout.
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
const CUSTOMIZED = [
  ".claude/skills/specnaut/phases/tasks.md",
  ".claude/skills/specnaut/phases/review.md",
];

async function pending(dir: string): Promise<string[]> {
  const r = await runSpecnaut(["reconcile", "--status"], dir);
  assertEquals(r.code, 0, `reconcile failed: ${r.stderr}`);
  return (JSON.parse(r.stdout) as { pending: string[] }).pending;
}

/** Scaffolds a project with two locally-customized managed files. */
async function customizedProject(): Promise<string> {
  const dir = await Deno.makeTempDir({ prefix: "specnaut-stale-staging-" });
  assertEquals((await runSpecnaut(INIT, dir)).code, 0);
  for (const rel of CUSTOMIZED) {
    const abs = join(dir, rel);
    await Deno.writeTextFile(abs, (await Deno.readTextFile(abs)) + "\n<!-- ours -->\n");
  }
  return dir;
}

Deno.test("a forced upgrade leaves nothing pending for the files it overwrote", async () => {
  const dir = await customizedProject();
  try {
    const up = await runSpecnaut(["upgrade", "--force"], dir);
    assertEquals(up.code, 0, `upgrade failed: ${up.stderr}`);

    const after = await pending(dir);
    for (const rel of CUSTOMIZED) {
      assert(
        !after.includes(rel),
        `${rel} was overwritten by --force, so it must not be pending reconciliation`,
      );
    }
    assertEquals(after.length, 0, `nothing should be pending, got: ${after.join(", ")}`);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("a dry run stages nothing — it is a preview, not a partial upgrade", async () => {
  // This reverses a deliberate earlier choice (#516). Staging during --dry-run
  // was introduced so an agent could preview the reconciliation before
  // committing to it. The cost turned out to be higher than the benefit: the
  // run wrote dozens of files and then printed "no files written", and it left
  // `specnaut reconcile` primed with upstream content for an upgrade that was
  // never applied — a pending reconciliation for a decision nobody took.
  //
  // The preview survives without the writes: the plan already names every
  // customized dest, and `specnaut diff` shows the content.
  const dir = await customizedProject();
  try {
    const dry = await runSpecnaut(["upgrade", "--dry-run"], dir);
    assertEquals(dry.code, 0, `dry-run failed: ${dry.stderr}`);

    assertEquals(await pending(dir), [], "a dry run must leave nothing staged");
    for (const rel of CUSTOMIZED) {
      assertStringIncludes(dry.stdout, rel);
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("an unforced upgrade keeps the staged copy it did not write", async () => {
  // A preserved file genuinely still needs reconciling — clearing it would be
  // the opposite bug, and would lose the upstream copy the user needs.
  const dir = await customizedProject();
  try {
    const up = await runSpecnaut(["upgrade"], dir);
    assertEquals(up.code, 0, `upgrade failed: ${up.stderr}`);

    const after = await pending(dir);
    for (const rel of CUSTOMIZED) {
      assert(after.includes(rel), `${rel} was preserved, so it must stay pending`);
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
