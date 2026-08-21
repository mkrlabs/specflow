import { assert, assertEquals } from "@std/assert";
import { computeUpgradePlan } from "../../src/domain/upgrade_plan.ts";
import type { InstalledLock } from "../../src/domain/installed_lock.ts";

/**
 * A customized file that is also behind upstream.
 *
 * Preserving a customized file is right. Freezing its lock entry alongside it
 * is what turns a single skip into a permanent one: `upgrade_project.ts` copies
 * `sha256` and `templatesVersion` over verbatim whenever the file was not
 * written, so every later run reaches the same verdict and skips again. The
 * summary said only "customized locally", which reads as settled rather than as
 * an update that never arrived.
 *
 * These lock the *discrimination*, which is the part that is easy to get wrong
 * in the noisy direction: warning about every customized file would train the
 * reader to skip the warning, and the one that matters would go with it.
 */

const DEST = ".claude/agents/product-owner.md";

function lock(
  entryVersion: string,
  lockVersion: string,
  sha = "lock-sha",
): InstalledLock {
  return {
    version: 2,
    harness: "claude",
    backlogBackend: "local",
    versionScheme: "semver",
    specBackend: "local",
    templatesVersion: lockVersion,
    entries: new Map([[
      DEST,
      { sha256: sha, installedAt: "2026-05-26T10:00:00Z", templatesVersion: entryVersion },
    ]]),
  };
}

/** The customized `preserve` action for DEST, or null if the plan has none. */
function preserved(plan: ReturnType<typeof computeUpgradePlan>) {
  const a = plan.find((x) => x.kind === "preserve" && x.dest === DEST);
  return a?.kind === "preserve" ? a : null;
}

Deno.test("a customized file whose template moved on, and never caught up, is flagged", () => {
  // Entry frozen at 1.12.0 while the lock itself reached 2.0.1 — so at least
  // one completed upgrade skipped it — and the template's SHA has moved, so
  // there was something to deliver.
  const plan = computeUpgradePlan(
    new Map([[DEST, "edited-by-hand"]]),
    lock("1.12.0", "2.0.1"),
    new Map([[DEST, "upstream-moved"]]),
  );
  const a = preserved(plan);
  assert(a, "expected a preserve action");
  assertEquals(a.reason, "customized");
  assert(a.staleSince, "an update was published for this path and never applied");
  assertEquals(a.staleSince.templatesVersion, "1.12.0");
  assertEquals(a.staleSince.installedAt, "2026-05-26T10:00:00Z");
});

Deno.test("a customized file whose template never moved is NOT flagged", () => {
  // The lock entry lags — but `lockSha === newSha`, so nothing was published
  // for this path. Reporting it as behind would be a false positive, and the
  // noisy kind: it fires on every long-lived local edit in the project.
  const plan = computeUpgradePlan(
    new Map([[DEST, "edited-by-hand"]]),
    lock("1.12.0", "2.0.1", "same-as-upstream"),
    new Map([[DEST, "same-as-upstream"]]),
  );
  const a = preserved(plan);
  assert(a, "expected a preserve action");
  assertEquals(a.reason, "customized");
  assertEquals(
    a.staleSince,
    undefined,
    "upstream did not move, so nothing was missed and nothing should be warned about",
  );
});

Deno.test("a customized file edited since the last upgrade is NOT flagged", () => {
  // Entry version equals the lock's own: this file was current as of the most
  // recent run, and the divergence is this cycle's. It is a normal preserve,
  // not a file that has been silently skipped for releases.
  const plan = computeUpgradePlan(
    new Map([[DEST, "edited-by-hand"]]),
    lock("2.0.1", "2.0.1"),
    new Map([[DEST, "upstream-moved"]]),
  );
  const a = preserved(plan);
  assert(a, "expected a preserve action");
  assertEquals(a.staleSince, undefined, "no completed upgrade has skipped this file yet");
});

Deno.test("a declared preserve is never flagged as behind", () => {
  // `.specnaut/preserve.yml` is the user saying "this one is mine". It is
  // expected to diverge and expected to stay behind; that is the whole point
  // of declaring it. Warning about it would be telling them their own
  // instruction went wrong.
  const plan = computeUpgradePlan(
    new Map([[DEST, "edited-by-hand"]]),
    lock("1.12.0", "2.0.1"),
    new Map([[DEST, "upstream-moved"]]),
    { isDeclaredPreserved: (d: string) => d === DEST },
  );
  const a = preserved(plan);
  assert(a, "expected a preserve action");
  assertEquals(a.reason, "declared");
  assertEquals(a.staleSince, undefined, "a declared preserve is meant to stay put");
});

Deno.test("an untracked file has no lock entry and cannot be dated", () => {
  // No entry means no recorded version, so there is nothing to compare and
  // nothing honest to report. It must not guess.
  const plan = computeUpgradePlan(
    new Map([[DEST, "on-disk"]]),
    {
      version: 2,
      harness: "claude",
      backlogBackend: "local",
      versionScheme: "semver",
      specBackend: "local",
      templatesVersion: "2.0.1",
      entries: new Map(),
    },
    new Map([[DEST, "upstream"]]),
  );
  const a = preserved(plan);
  assert(a, "expected a preserve action");
  assertEquals(a.staleSince, undefined);
});
