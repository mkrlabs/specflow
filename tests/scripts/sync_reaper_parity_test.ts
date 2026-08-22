import { assert, assertEquals } from "@std/assert";
import { fromFileUrl } from "@std/path";

/**
 * The two publish channels reap their own superseded sync branches. Their
 * filters drifted, and the drift was the leak.
 *
 * `sync-to-marketplace.sh` matched both the current and the pre-rebrand branch
 * prefix; `sync-to-codex-plugin.sh` matched only its own `BRANCH_PREFIX`. So
 * three `specflow-sync/*` branches on the public Codex fork were invisible to
 * the thing whose job was to delete them, and went on serving a consuming
 * project's scaffolded tree for months after that tree was purged from this
 * repo's history — the same content, the same fork, surviving the remediation
 * that was supposed to end it (constitution § XI).
 *
 * Nothing compared the two scripts, so nothing could notice. This does.
 */

const ROOT = fromFileUrl(new URL("../../", import.meta.url));

const SCRIPTS = [
  "scripts/sync-to-codex-plugin.sh",
  "scripts/sync-to-marketplace.sh",
] as const;

/** The line that decides which remote branches a reaper can even see. */
function reaperFilter(source: string): string {
  const line = source
    .split("\n")
    .find((l) => l.includes("--jq '.[].name'") && l.includes("grep"));
  assert(line, "no branch-reaping filter found — did the reaper move or vanish?");
  const m = line.match(/grep\s+(?:-E\s+)?"([^"]+)"/);
  assert(m, `could not read the pattern out of: ${line.trim()}`);
  return m[1];
}

Deno.test("every sync reaper matches the pre-rebrand branch prefix", async () => {
  for (const rel of SCRIPTS) {
    const pattern = reaperFilter(await Deno.readTextFile(ROOT + rel));
    assert(
      new RegExp(pattern).test("specflow-sync/v1.13.1"),
      `${rel} cannot see pre-rebrand sync branches (pattern: ${pattern}). ` +
        `They carry content purged from this repo and are published on a public fork.`,
    );
    assert(
      new RegExp(pattern).test("specnaut-sync/v3.1.2"),
      `${rel} cannot see current sync branches (pattern: ${pattern}).`,
    );
  }
});

Deno.test("both reapers use the same filter", async () => {
  const [codex, marketplace] = await Promise.all(
    SCRIPTS.map(async (rel) => reaperFilter(await Deno.readTextFile(ROOT + rel))),
  );
  assertEquals(
    codex,
    marketplace,
    "the two channels publish the same content to different public forks; " +
      "a filter that holds for one and not the other is how the last leak survived",
  );
});
