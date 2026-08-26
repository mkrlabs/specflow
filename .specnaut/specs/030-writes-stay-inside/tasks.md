# Tasks: a write, a delete and a read all stay inside the project

**Feature dir**: `.specnaut/specs/030-writes-stay-inside/` ·
**Branch**: `fix/574-writes-stay-inside-the-project` ·
**Item**: [specnaut-cli#574 — "Specnaut writes, deletes and reads through symlinks that leave the project directory"](https://github.com/specnaut/specnaut-cli/issues/574)

Derived from the **amended** `plan.md` — the one whose § 3 was rewritten after
both plan-time audits. Anything derived from its first version is wrong in the
one way that matters: it would specify resolve-the-parent-append-the-leaf, which
does not refuse the plan's own shape B.

**Tests are mandatory here, not optional.** FR-012 requires every new assertion
to be observed **red** against the re-introduced defect before it is accepted,
and the commit body to name which defect each one witnessed. A task that adds an
assertion without a witnessed red is not done.

**The decision table is binding.** Where a task touches a rule, its home is
named in the task. A decision may not land anywhere else without amending
`plan.md` first.

---

## Phase 1 — Setup

- [ ] T001 Record the baseline: `deno task test` count and `deno fmt --check`
      clean, so a later "still green" claim has a number to be measured against.
      No file changes.

## Phase 2 — Foundational (blocks every story)

- [ ] T002 Add `isInside(root: string, target: string): boolean` to
      `src/domain/template.ts`, beside `assertSafeDestination`. Pure, no
      `Deno.*`. `relative()`-based, never a string prefix. **Home: decision
      table row 1.** (FR-002)
- [ ] T003 [P] Unit-test `isInside` in `tests/domain/` — inside, equal-to-root,
      one level out, sibling-with-shared-prefix (`/a/bc` vs `/a/b`), and a
      Windows-shaped path. The shared-prefix case is the one a `startsWith`
      implementation passes on POSIX and fails here.
- [ ] T004 Replace `pruneEmptyParents`' inline predicate with a call to
      `isInside`, and move `SEP` with it. **The walk still returns, it does not
      throw** — best-effort by construction. (FR-005, F-08/F6)
- [ ] T005 Assert the prune still runs under a `makeTempDir` root — i.e. that it
      **did** prune, never merely that it did not error. This is the witness for
      FR-004: resolving one side and not the other makes the walk silently stop
      on macOS, and a "no error" assertion cannot see that. Observe red by
      passing a `realPath`'d root against a lexical candidate.
- [ ] T006 Add `assertInsideProject(root, abs)` to
      `src/infrastructure/deno_fs_writer.ts`: `lstat`-first three-state
      resolution (absent → parent+leaf; symlink → resolve explicitly, refuse a
      dangling link; else `realPath`), both sides resolved, **throws**, message
      names dest + resolved target + resolved root. **Home: decision table rows
      2, 3, 5.** (FR-002, FR-003, FR-004, FR-006)
- [ ] T007 Refuse a resolved root of `/` or `$HOME`. (§ 9, F9)
- [ ] T008 [P] Tests for T006/T007: absent dest, in-project symlink (allowed),
      out-of-project leaf symlink, dangling symlink, symlinked ancestor,
      `makeTempDir` root (must be allowed — the macOS `/var` case), `/` as root.

## Phase 3 — US1: a hostile layout cannot reach outside the project (P1)

**Independent test**: build each of shapes A–E and assert the command refuses
and nothing outside the project changed.

- [ ] T009 [US1] Two-phase `writeBundle`: phase 1 checks containment for every
      dest **and then** `mkdir -p`; phase 2 writes. Removes the ordering that
      made `mkdir` an unguarded sink. (FR-001, FR-007)
- [ ] T010 [US1] Re-assert containment on the resolved path before `Deno.chmod`
      — it is a separate syscall on the same `abs` and it follows a leaf link.
- [ ] T011 [US1] Guard `backupAside`'s rename and `deletePaths`' remove/rename.
- [ ] T012 [US1] [P] Guard the seven `.specnaut/`-relative sinks:
      `FsLockStore.write`, `FsUpgradeMarkerStore.write`/`.delete`,
      `FsPreserveStore.write`, `SpecCacheWriter.write`/`.clear`,
      `initBacklogConfigStub` (`cli/handlers/init_handler.ts`),
      `writeCloudConfig` (`domain/cloud/cloud_config.ts`). `SpecCacheWriter.clear`
      is the recursive delete — guard it first. (FR-001)
- [ ] T013 [US1] `migrateLegacyConfigDir`: `lstat` in `isDir`, and refuse to
      migrate when `.specflow` or `.specnaut` is a symlink, naming the refusal.
      This is the entry point that manufactures the condition for T012. (FR-008)
- [ ] T014 [US1] Tests for shapes A, B, C, D, E — each observed red against the
      re-introduced defect, each asserting BOTH that the command refused AND
      that the file outside is byte-unchanged. Asserting only the refusal would
      pass against a guard that refuses after acting.

## Phase 4 — US2: nothing outside the project is read, printed or copied (P2)

**Independent test**: symlink a bundle dest to a file outside, run
`specnaut diff`, assert its contents do not appear on stdout.

- [ ] T015 [US2] Guard `DenoFsReader.readText` and `FsStagingStore.read`.
      (FR-009)
- [ ] T016 [US2] Replace `FsStagingStore.delete`'s `parent.startsWith(stagingDir)`
      with `isInside`, and add `assertSafeDestination` on its `relPath`. The
      prefix test is also wrong for a sibling named `upgrade-staging-old`, not
      only on Windows.
- [ ] T017 [US2] Test shape F end to end with the real binary: the outside
      file's contents must not appear in `specnaut diff` stdout. Observed red —
      it currently prints them line for line.
- [ ] T018 [US2] Correct `parseLock` or its caller so a lock **key** that is not
      a legal destination is rejected rather than fed to the reader. The lock is
      repo-controlled: it is committed and the scaffolded `.gitignore` does not
      exclude it.

## Phase 5 — US3: a deliberate in-project symlink keeps working (P3)

**Independent test**: `tests/infrastructure/write_bundle_symlink_test.ts` stays
green without modification.

- [ ] T019 [US3] Run that file first and unmodified — it is the regression
      surface and the first thing to go red on an over-correction into a blanket
      symlink refusal. If a case there needs changing, stop: that is a scope
      change, not a fix.
- [ ] T020 [US3] Unify the `skipIfExists` symlink branches: `backupExisting:
      true` must stop renaming a project's deliberate link and reporting the
      pointer as a content backup. **Home: decision table row 8.** (FR-010)
- [ ] T021 [US3] Test that an in-project symlinked dest is still followed and
      the managed-section merge still reaches the real file.

## Phase 6 — US4: the rule stays enforced as the code grows (P4)

- [ ] T022 [US4] `tests/infrastructure/containment_sweep_test.ts`: enumerate
      every module under `src/infrastructure/` — plus the two named sinks
      outside it — that calls a Deno filesystem-mutation API, and fail when one
      neither consults the predicate nor appears in the exclusions file. Assert
      a **floor** on the population, so a walk that finds nothing is a failure
      and not a pass. (FR-011)
- [ ] T023 [US4] `tests/infrastructure/containment-exclusions.txt`: two entries
      to start — `credential_store.ts` (writes the user's own config directory)
      and `github_api.ts` (writes beside the running binary during self-update).
      Each reason must be a fact about the file, not a date.
- [ ] T024 [US4] Verify the sweep by adding a throwaway mutating module and
      observing red, then deleting it. A sweep that has never failed has not
      been shown to be able to.

## Phase 7 — Polish

- [ ] T025 `deno task test` green, `deno fmt --check` clean, and the count
      compared against T001's baseline.
- [ ] T026 Commit bodies name, per assertion, which defect it was witnessed
      against. (FR-012)
- [ ] T027 `cd apps/specnaut-cli && deno run --allow-run scripts/check-adoption.ts
      --from main --to HEAD` — only if any commit is a `feat`. These are `fix`.

---

## Dependencies

```
Phase 2 (T002–T008)  ── blocks everything
      │
      ├── Phase 3 US1 (T009–T014)   ← the MVP
      │        └── T013 blocks T012's E-shape assertion
      ├── Phase 4 US2 (T015–T018)
      ├── Phase 5 US3 (T019–T021)
      └── Phase 6 US4 (T022–T024)
                   │
              Phase 7 (T025–T027)
```

`isInside` (T002) is the single blocking prerequisite: every other guard calls
it. T019 runs **before** any Phase 3 or 4 code change, as the pre-state.

## Parallel opportunities

- T003 ∥ T008 — different test files, both depend only on their subject.
- T012's seven sinks are seven independent files.
- Phases 4, 5 and 6 are independent of each other once Phase 2 lands.

## MVP

**Phase 2 + Phase 3.** That closes the write, mkdir, chmod, rename and delete
escapes — every shape the ticket originally described plus the two the audits
added. Phase 4 is the exfiltration path and is the reason the ticket is P1
rather than P2; it ships in the same branch, not later.
