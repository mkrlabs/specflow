import { assert } from "@std/assert";
import { fromFileUrl } from "@std/path";

/**
 * A publish channel reaps its own superseded sync branches. The filter that
 * decides which branches it can see must match the PRE-REBRAND prefix too.
 *
 * This test began as a parity check between two channels, because their filters
 * had drifted: `sync-to-marketplace.sh` matched `^(specnaut|specflow)-sync/`
 * while `sync-to-codex-plugin.sh` matched only its own `BRANCH_PREFIX`. Three
 * `specflow-sync/*` branches on the public Codex fork were therefore invisible
 * to the one mechanism whose job was to delete them, and went on serving a
 * consuming project's scaffolded tree for months after that tree was purged
 * from this repo's history (constitution § XI).
 *
 * That fork has since been deleted outright, so only one reaper remains and
 * there is no parity left to check. The rule it broke still binds: a rename
 * orphans what it renames away from, and the reaper is the only thing standing
 * between a stale snapshot and indefinite publication — its `|| true` means an
 * unreapable branch produces no signal at all.
 *
 * Any future channel added here must be appended to SCRIPTS.
 */

const ROOT = fromFileUrl(new URL("../../", import.meta.url));

const SCRIPTS = [
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
        `They carry content purged from this repo and are published on a public repo.`,
    );
    assert(
      new RegExp(pattern).test("specnaut-sync/v3.1.2"),
      `${rel} cannot see current sync branches (pattern: ${pattern}).`,
    );
  }
});

Deno.test("no script still points at the deleted Codex fork", async () => {
  // The repository is gone. A surviving reference would clone nothing, and the
  // release wrapper mapped only exit 2 to success — so it would red a release.
  for await (const entry of Deno.readDir(ROOT + "scripts")) {
    if (!entry.isFile || !entry.name.endsWith(".sh")) continue;
    const source = await Deno.readTextFile(`${ROOT}scripts/${entry.name}`);
    const live = source
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("#"))
      .join("\n");
    assert(
      !live.includes("specnaut/specnaut-plugins"),
      `scripts/${entry.name} still targets the deleted fork specnaut/specnaut-plugins`,
    );
  }
});
