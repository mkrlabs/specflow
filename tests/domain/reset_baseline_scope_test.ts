import { assertEquals } from "@std/assert";
import { computeUpgradePlan } from "../../src/domain/upgrade_plan.ts";
import type { InstalledLock } from "../../src/domain/installed_lock.ts";

/**
 * `--reset-baseline` must re-baseline exactly the files the report lists under
 * "customized, and behind" — the list its own hint offers to apply, "All N at
 * once". Anything looser makes that N a lie.
 *
 * It has been wrong in both directions. It first swept the entire `customized`
 * bucket, so a project with 2 behind and 111 merely customized lost all 113
 * (#519). The fix bounded it to `lockSha !== newSha` — upstream actually moved
 * — which is only the FIRST of the two conditions `staleSince` requires. On a
 * same-minor upgrade the two agree and the gap is invisible; across majors
 * upstream has moved for nearly everything, and a project audited going
 * 1.14.1 → 3.1.2 measured 53 auto-updates against the 2 its hint advertised.
 *
 * The two shapes below are what the second condition separates, and they are
 * indistinguishable by SHA alone.
 */

const NOW = "2026-08-24T00:00:00.000Z";

function lockWith(
  entries: Array<[dest: string, sha: string, templatesVersion: string]>,
  templatesVersion: string,
): InstalledLock {
  return {
    version: 2,
    harness: "claude",
    backlogBackend: "local",
    versionScheme: "semver",
    specBackend: "local",
    specAutogen: false,
    templatesVersion,
    entries: new Map(
      entries.map(([dest, sha256, tv]) => [
        dest,
        { sha256, installedAt: NOW, templatesVersion: tv },
      ]),
    ),
  } as InstalledLock;
}

/**
 * Two customized files. Upstream has moved for BOTH — so both pass the old
 * `lockSha !== newSha` bound. They differ only in whether their lock entry ever
 * fell behind the lock's own version:
 *
 *  - `behind.md`  — entry frozen at an older version: an update was published
 *                   AND a completed upgrade skipped it. This is the bucket.
 *  - `settled.md` — entry level with the lock: the user edited it, and the very
 *                   upgrade now running is the first one that would touch it.
 *                   Nothing was ever missed, so nothing is owed.
 */
function fixture() {
  const lock = lockWith(
    [
      ["behind.md", "lock-behind", "1.12.0"],
      ["settled.md", "lock-settled", "1.14.1"],
    ],
    "1.14.1",
  );
  const diskShas = new Map([
    ["behind.md", "disk-behind"],
    ["settled.md", "disk-settled"],
  ]);
  const newShas = new Map([
    ["behind.md", "new-behind"],
    ["settled.md", "new-settled"],
  ]);
  return { lock, diskShas, newShas };
}

function kinds(plan: ReturnType<typeof computeUpgradePlan>) {
  return Object.fromEntries(plan.map((a) => [a.dest, a.kind]));
}

Deno.test("without the flag, both customized files are preserved", () => {
  const { lock, diskShas, newShas } = fixture();
  assertEquals(kinds(computeUpgradePlan(diskShas, lock, newShas, {})), {
    "behind.md": "preserve",
    "settled.md": "preserve",
  });
});

Deno.test("--reset-baseline takes upstream for the behind file only", () => {
  const { lock, diskShas, newShas } = fixture();
  assertEquals(
    kinds(computeUpgradePlan(diskShas, lock, newShas, { resetBaseline: true })),
    {
      // The one the report named, and the one the hint promised to apply.
      "behind.md": "auto-update",
      // Edited deliberately, nothing missed. The flag has no business here —
      // under the previous bound this said "auto-update" and the file was
      // overwritten from the bundle.
      "settled.md": "preserve",
    },
  );
});

Deno.test("the #163 stale-lock migration still passes through the bound", () => {
  // A pre-v1.0 binary recorded a SHA matching neither disk nor bundle. Once the
  // file is preserved its entry stops advancing, so it lags the lock's own
  // version and `staleSince` fires — which is what keeps the healing path open.
  const lock = lockWith([["stale.md", "garbage-sha", "0.9.0"]], "1.14.1");
  const plan = computeUpgradePlan(
    new Map([["stale.md", "disk"]]),
    lock,
    new Map([["stale.md", "new"]]),
    { resetBaseline: true },
  );
  assertEquals(kinds(plan), { "stale.md": "auto-update" });
});

Deno.test("a file upstream never moved for is untouched even when behind-shaped", () => {
  // `lockSha === newSha`: the template has not changed since this file was
  // written. Both conditions fail, and the flag must not reach it.
  const lock = lockWith([["frozen.md", "same", "1.12.0"]], "1.14.1");
  const plan = computeUpgradePlan(
    new Map([["frozen.md", "disk"]]),
    lock,
    new Map([["frozen.md", "same"]]),
    { resetBaseline: true },
  );
  assertEquals(kinds(plan), { "frozen.md": "preserve" });
});
