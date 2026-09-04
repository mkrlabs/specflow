import { assert, assertEquals } from "@std/assert";
import { computeUpgradePlan } from "../../src/domain/upgrade_plan.ts";
import type { InstalledLock } from "../../src/domain/installed_lock.ts";

/**
 * A declaration in `preserve.yml` does more than beat `--force`. It takes the
 * path off every surface that reports drift: it never becomes a `customized`
 * preserve, so `upgrade_project.ts` never stages it and `reconcile --status`
 * cannot list it. The exclusion is deliberate — a freeze is not a pending
 * reconciliation — but nothing else said the frozen copy had fallen behind.
 *
 * What that costs is not abstract. Upstream adds a shared helper to a bundled
 * script; other bundled scripts begin calling it; a project that froze the
 * file holding the helper keeps a copy without it. Every path through the new
 * call site dies, paths that do not use it keep working, and no command
 * reports anything, because the file is off the surface they look at.
 *
 * The fix is not a second mechanism. `staleSince` already decides "behind" for
 * the customized population; the declared branch returned before it was ever
 * called. These assertions are on the STATE the plan names, not on the
 * presence of a line — a report that lists a path while calling it current is
 * the defect, not the fix.
 */

function lockOf(
  templatesVersion: string,
  entries: Record<string, { sha256: string; templatesVersion: string; installedAt?: string }>,
): InstalledLock {
  return {
    version: 2,
    harness: "claude",
    templatesVersion,
    entries: new Map(
      Object.entries(entries).map(([dest, e]) => [dest, {
        sha256: e.sha256,
        templatesVersion: e.templatesVersion,
        installedAt: e.installedAt ?? "2026-01-01T00:00:00.000Z",
      }]),
    ),
  } as unknown as InstalledLock;
}

const DEST = ".specnaut/scripts/backlog/_config.sh";

function planFor(
  lock: InstalledLock,
  newShas: Map<string, string>,
  diskShas: Map<string, string>,
) {
  return computeUpgradePlan(diskShas, lock, newShas, {
    isDeclaredPreserved: (d: string) => d === DEST,
  });
}

function declaredAction(plan: ReturnType<typeof planFor>, dest = DEST) {
  const a = plan.find((x) => x.dest === dest);
  assert(a, `no action for ${dest}`);
  assertEquals(a.kind, "preserve");
  assert(a.kind === "preserve");
  assertEquals(a.reason, "declared", "the declaration did not win");
  return a;
}

Deno.test("declared preserve: upstream moved since the freeze is reported as behind", async (t) => {
  // The lock froze at 3.2.0 while the project is now on 4.2.2, and the bundle
  // ships different content than the recorded SHA. Both conditions of
  // `staleSince` hold: an update was published, and it never landed.
  const lock = lockOf("4.2.2", {
    [DEST]: {
      sha256: "frozen-sha",
      templatesVersion: "3.2.0",
      installedAt: "2026-08-24T15:00:00.000Z",
    },
  });
  const a = declaredAction(
    planFor(lock, new Map([[DEST, "upstream-sha"]]), new Map([[DEST, "frozen-sha"]])),
  );

  assertEquals(a.declaredDrift, "behind", "a frozen path upstream had moved past read as current");

  await t.step("and it carries the freeze point, from the shared predicate", () => {
    // NOT `staleSince`: that field means "an accident, apply the update", and a
    // declared freeze is neither. `tests/domain/upgrade_stale_test.ts` pins
    // that distinction and stays green.
    assertEquals(a.staleSince, undefined);
    assert(a.declaredFrozenAt, "behind without a freeze point is not actionable");
    assertEquals(a.declaredFrozenAt.templatesVersion, "3.2.0");
  });
});

Deno.test("declared preserve: a locally edited frozen file is still behind", () => {
  // The disk SHA is irrelevant to the question. "Did upstream move since this
  // was last written?" is answered by the lock and the bundle; an edit the
  // maintainer made afterwards neither creates nor cures the gap.
  const lock = lockOf("4.2.2", {
    [DEST]: { sha256: "frozen-sha", templatesVersion: "3.2.0" },
  });
  const a = declaredAction(
    planFor(lock, new Map([[DEST, "upstream-sha"]]), new Map([[DEST, "hand-edited-sha"]])),
  );
  assertEquals(a.declaredDrift, "behind");
});

Deno.test("declared preserve: an unmoved upstream is level, not behind", () => {
  // The other half of the assertion. A predicate that answered "behind" for
  // everything declared would pass the test above and be useless.
  const lock = lockOf("4.2.2", {
    [DEST]: { sha256: "same-sha", templatesVersion: "3.2.0" },
  });
  const a = declaredAction(
    planFor(lock, new Map([[DEST, "same-sha"]]), new Map([[DEST, "same-sha"]])),
  );
  assertEquals(a.declaredDrift, "current");
  assertEquals(a.declaredFrozenAt, undefined);
});

Deno.test("declared preserve: a caught-up entry is level even when content differs", () => {
  // `staleSince` requires BOTH conditions, and this is the second one: the
  // entry is at the lock's own version, so no completed upgrade skipped it.
  // Reusing the predicate is what keeps this case consistent across the two
  // preserve reasons; reimplementing it here is how they would part company.
  const lock = lockOf("4.2.2", {
    [DEST]: { sha256: "frozen-sha", templatesVersion: "4.2.2" },
  });
  const a = declaredAction(
    planFor(lock, new Map([[DEST, "upstream-sha"]]), new Map([[DEST, "frozen-sha"]])),
  );
  assertEquals(a.declaredDrift, "current");
});

Deno.test("declared preserve: no lock entry is its own state, not 'current'", () => {
  // Nothing recorded to compare against. Calling that level with upstream is
  // a claim the data cannot support, and folding it into the clean bucket is
  // the same silence this ticket removes, one layer down.
  const lock = lockOf("4.2.2", {});
  const a = declaredAction(
    planFor(lock, new Map([[DEST, "upstream-sha"]]), new Map([[DEST, "on-disk-sha"]])),
  );
  assertEquals(a.declaredDrift, "no-lock-entry");
  assertEquals(a.declaredFrozenAt, undefined);
});

Deno.test("declared preserve: a path upstream dropped is neither level nor behind", () => {
  // The bundle no longer carries it, so "behind" is not a question with an
  // answer. The file is still kept — preservation wins over removal.
  const lock = lockOf("4.2.2", {
    [DEST]: { sha256: "frozen-sha", templatesVersion: "3.2.0" },
  });
  const a = declaredAction(planFor(lock, new Map(), new Map([[DEST, "frozen-sha"]])));
  assertEquals(a.declaredDrift, "dropped-upstream");
});

Deno.test("declared preserve: the declaration still wins, in every state", () => {
  // Out of scope for the ticket and asserted anyway: this change reports, it
  // does not decide. A regression that started auto-updating a behind path
  // would satisfy every assertion above.
  const lock = lockOf("4.2.2", {
    [DEST]: { sha256: "frozen-sha", templatesVersion: "3.2.0" },
  });
  for (
    const [newShas, disk] of [
      [new Map([[DEST, "upstream-sha"]]), new Map([[DEST, "frozen-sha"]])],
      [new Map([[DEST, "frozen-sha"]]), new Map([[DEST, "edited"]])],
      [new Map(), new Map([[DEST, "frozen-sha"]])],
    ] as const
  ) {
    const a = declaredAction(planFor(lock, newShas, disk));
    assertEquals(a.kind, "preserve");
    assertEquals(a.reason, "declared");
  }
});

Deno.test("customized preserves are untouched by the split", () => {
  // The repair extends to the missed population; it must not move the one it
  // already covered. A customized preserve carries no `declaredDrift`.
  const other = ".claude/agents/product-owner.md";
  const lock = lockOf("4.2.2", {
    [other]: { sha256: "lock-sha", templatesVersion: "3.2.0" },
  });
  const plan = computeUpgradePlan(
    new Map([[other, "edited-sha"]]),
    lock,
    new Map([[other, "upstream-sha"]]),
    { isDeclaredPreserved: () => false },
  );
  const a = plan.find((x) => x.dest === other);
  assert(a && a.kind === "preserve");
  assertEquals(a.reason, "customized");
  assertEquals(a.declaredDrift, undefined);
  assert(a.staleSince, "the customized bucket lost its own behind detection");
});
