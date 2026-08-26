# Tasks: the coverage gate sees a surface file before it is committed

**Feature dir**: `.specnaut/specs/029-audit-untracked-surfaces` | **Branch**:
`fix/564-audit-sees-untracked-surfaces` | **Backlog item**:
[specnaut/specnaut-cli#564 — "audit.sh is blind to untracked files, so a brand-new surface file passes the coverage gate"](https://github.com/specnaut/specnaut-cli/issues/564)

Derived from `plan.md`. Every task names the 🔒 decision-table home it is allowed to touch; a task
that puts a decision anywhere else is a plan violation.

**Tests are in scope and are not optional here.** FR-006 requires every new assertion to be observed
**red** before it is accepted, and §1 of the plan establishes why: the release gate and CI both see
a provably empty untracked set, so `smoke-audit.sh`'s fixture is this feature's only permanent
witness. A vacuous assertion there means nothing observes the feature again after today.

---

## Phase 1 — Setup

- [x] T001 Confirm the working tree is clean and the branch is
      `fix/564-audit-sees-untracked-surfaces` at `9a6e24d`, and record the pre-change baseline —
      `deno task test` count, `bash scripts/smoke/smoke-audit.sh baseline564` verdict, and
      `git ls-files --others --exclude-standard -- 'templates/core/' 'templates/harness-specific/' 'templates/manifest.json' 'src/cli/'`
      row count — in the session log, not in a file.

## Phase 2 — Foundational (blocks every story)

These two hoists are prerequisites for all three stories: every later collection line consumes them,
and adding a story's collection before them is what creates the second literal FR-002 forbids.

- [x] T002 Hoist the git invocation prefix into one
      `GIT_SRC=(git -C "$SRC_ROOT" -c core.quotePath=false -c core.excludesFile=/dev/null)` array in
      `scripts/smoke/audit.sh`, immediately above the `CHANGED=` assignment, and rewrite the
      existing `git diff` collection to consume it. **Home**: §5 row 2, "How a git invocation
      renders and scopes a path". FR-002, FR-004.
- [x] T003 Hoist the four surface prefixes into one
      `SURFACE_PATHSPEC=('templates/core/' 'templates/harness-specific/' 'templates/manifest.json' 'src/cli/')`
      array in `scripts/smoke/audit.sh`, beside `GIT_SRC`, and rewrite the existing `git diff`
      collection to consume it. **Home**: §5 row 1. FR-002. Do **not** touch the `SURFACES` map or
      the unmapped `case` — FR-007.
- [x] T004 Assert the toplevel invariant at the `--src-root` flag validation in
      `scripts/smoke/audit.sh`: exit **3** unless `SRC_ROOT` equals
      `git -C "$SRC_ROOT" rev-parse --show-toplevel`. Reuse code 3 — `preflight.sh` already branches
      on it; adding a fourth is forbidden by §6. FR-013 (braces half).
- [x] T005 Verify T002–T004 changed nothing observable:
      `bash scripts/smoke/smoke-audit.sh t564-foundational` still passes, and
      `bash scripts/smoke/audit.sh` still exits 0 on the clean tree. A pure hoist that moves a
      verdict is a hoist that was not pure.

## Phase 3 — User Story 1 (P1): an uncommitted surface file is seen and named as uncommitted

**Goal**: a new, still-uncommitted file under a mapped surface enters the changed set, is reported
as a coverage gap when nothing asserts on it, and the report line says it is uncommitted.

**Independent test criterion**: with `templates/core/agents/<invented-probe>.md` present and
uncommitted and no smoke naming it, `audit.sh` exits non-zero and prints the path with an
`(untracked)` marker; adding an assertion for it flips the run to 0.

- [x] T006 [US1] Add the untracked collection to `scripts/smoke/audit.sh`:
      `"${GIT_SRC[@]}" ls-files --others --exclude-standard --full-name -- "${SURFACE_PATHSPEC[@]}"`,
      unioned into `CHANGED` after the tracked diff. `--full-name` is FR-013's belt half — without
      it `ls-files` speaks cwd-relative where `diff` speaks root-relative. **Home**: §5 rows 1
      and 2. FR-001, FR-005, FR-013.
- [x] T007 [US1] Add the staged collection to `scripts/smoke/audit.sh`:
      `"${GIT_SRC[@]}" diff --name-only --diff-filter=AMR --cached HEAD -- "${SURFACE_PATHSPEC[@]}"`,
      unioned in as the third source. FR-010; the decision and its reasoning are §12 item 1.
- [x] T008 [US1] De-duplicate the three-source union with `awk '!seen[$0]++'` — first-seen order
      preserved, because SC-003 relies on a fixed order and `sort -u` would not give it. FR-012. The
      `git rm --cached` repro in §2 is why this is not optional.
- [x] T009 [US1] Mark a path that came from the untracked source with `(untracked)` in the report
      line only. No counter, no new term in the final `if`, no new exit code. **Home**: §5 row 4 —
      this task is allowed to touch the report text and nothing else. FR-003.
- [x] T010 [US1] Write the rationale as a comment above the union in `scripts/smoke/audit.sh`,
      citing #564 and naming the three refused options, matching the five existing instances in that
      file. FR-008. The commit body repeats it; the comment is the record.
- [x] T011 [US1] Add the US1 assertions to `scripts/smoke/smoke-audit.sh`: plant an untracked
      surface file under `templates/core/agents/`, assert it is reported as a gap, assert the
      `(untracked)` marker is present, then add a synthetic assertion naming it and assert the
      verdict flips to 0. **Plant it after the last invocation whose counts are asserted** — FR-009;
      nineteen sites in that file pin exact counts.
- [x] T012 [US1] Extend `smoke-audit.sh`'s existing non-ASCII scenario (3h) to plant an
      **untracked** accented surface file, so `-c core.quotePath=false` has a witness on the new
      source too. One line, and it is the only thing standing between this change and a re-run of
      #549.
- [x] T013 [US1] **Observe red**: delete the `ls-files` line from `audit.sh`, run `smoke-audit.sh`,
      confirm it fails and confirm _which_ assertion fails. Restore. Then delete the `(untracked)`
      marker and confirm T011's marker assertion fails on its own. FR-006, SC-004. Run the probes
      from a **Python file**, not an inline shell one-liner — quoting and wrapped prose produced
      three false "still green" verdicts in the #562 session.

## Phase 4 — User Story 2 (P2): ignored paths stay invisible, by the flag and not by luck

**Goal**: `--exclude-standard` is what hides an ignored file, and that is asserted rather than
assumed.

**Independent test criterion**: a planted file that is **under a surface prefix** and matched by a
`.gitignore` rule produces no finding with the flag, and _does_ produce one without it.

- [x] T014 [P] [US2] Add a `.gitignore` to `smoke-audit.sh`'s synthetic repo root carrying `*.log` —
      the same pattern the real `.gitignore` carries, so the fixture mirrors a live rule rather than
      inventing one. The file sits at the synthetic root, outside all four prefixes, so it shifts no
      existing count.
- [x] T015 [US2] Plant `templates/core/agents/debug.log` — under a surface prefix, matched by the
      rule — and assert it appears in **no** bucket. This is the fixture C2 corrected: the first
      draft planted under `sandbox/`, which the _pathspec_ excludes, so the flag could be deleted
      with the assertion still green. FR-004.
- [x] T016 [US2] Add the separate pathspec assertion: a planted untracked file **outside** the four
      prefixes is not collected — a different mechanism from T015 and it gets its own check, so
      neither can stand in for the other.
- [x] T017 [US2] **Observe red**: remove `--exclude-standard` from the `ls-files` line, confirm T015
      fails; restore, then **widen `SURFACE_PATHSPEC` to `.`** and confirm T016 fails — the first
      draft said "remove one prefix", which cannot reach T016, whose fixture sits at the synthetic
      root; removing a prefix is a separate mutation and reddens T033 instead. FR-006, SC-004.

## Phase 5 — User Story 3 (P3): the verdict is a property of the tree, and stable

**Goal**: two runs agree, and two machines agree.

**Independent test criterion**: `audit.sh` run twice on an unchanged tree produces byte-identical
output; a configured `core.excludesFile` does not change the verdict.

- [x] T018 [P] [US3] Assert idempotence in `smoke-audit.sh`: run the audit twice on the unchanged
      synthetic tree, compare byte-for-byte, **plus a non-emptiness control** — two identical
      crashes are byte-identical too. SC-003. It does **not** witness T008: `sort -u` is
      deterministic, so byte-equality passes under the very substitution the first draft claimed it
      caught. That witness is T032.
- [x] T032 [US3] Assert FR-012's actual decision — **first-seen order**. A tracked gap (source 1)
      must be reported before an untracked one (source 3) whose name sorts first alphabetically.
- [x] T033 Plant an untracked fixture under `templates/harness-specific/`. Until it existed, every
      fixture in `smoke-audit.sh` sat under `templates/core/`, so the pathspec literals claimed an
      independent opinion about four prefixes while witnessing one — and the #551 drift they cite as
      their own justification would still have passed.
- [x] T034 Unset `GIT_DIR`, `GIT_WORK_TREE` and `GIT_INDEX_FILE` after the argument loop in
      `audit.sh`, and witness it: the same audit with and without an exported `GIT_DIR` must produce
      **identical reports**. Not `rc == 0` — the observed failure was 28 tracked files reported as
      `(untracked)` on a run already non-zero for unrelated reasons. FR-015.
- [x] T035 Give the `chmod 000` probe its own control (`[ -r … ]` → fail) so it cannot go vacuous as
      uid 0. FR-014.
- [x] T036 Guard every assertion-feeding capture with `|| true`. Under `set -e` a `grep` that finds
      nothing kills the whole file — and "finds nothing" is exactly the state the assertion exists
      to detect, so the defect aborts the run before its own assertion is reached. The red battery
      reported that crash as a PASS until its classifier learned to tell a crash from a red.
- [x] T019 [US3] Assert machine-independence: run the audit against the synthetic tree with
      `-c core.excludesFile=<a temp file listing a planted surface path>` set in the
      **environment/config**, and confirm the verdict is unchanged because `GIT_SRC` pins it to
      `/dev/null`. SC-002, FR-004.

## Phase 6 — Edge cases the plan measured and the first draft denied

- [x] T020 [P] Report a collected path ending in `/` — an untracked directory containing its own
      `.git` — with a message naming that cause. It is fatal through the unmapped bucket either way;
      what this buys is that the maintainer's repair is not "add a `.gitignore` entry", which is
      FR-004's drift shape. FR-011.
- [x] T021 [P] Assert T020 in `smoke-audit.sh` by planting a nested `git init` under
      `templates/core/agents/`, and assert the reported entry is the directory with its trailing
      slash — the measured behaviour, not the denied one.
- [x] T022 [P] Assert FR-014 in `smoke-audit.sh`: plant a `chmod 000` untracked surface file and
      require the audit to complete. It fails the moment somebody adds a content read, which is the
      security seat's L2 — the invariant is load-bearing and currently unwritten.

## Phase 7 — Polish and cross-cutting

- [x] T023 Update `scripts/smoke/README.md` "Audit heuristics": state that the changed set is
      tracked-since-baseline **plus** staged **plus** untracked-non-ignored, and why. **Home**: §5
      row 7 — README is DERIVED, `audit.sh` is the decider.
- [x] T024 Fix the **pre-existing** staleness in the same file: the Unmapped-surface row says "a
      changed file under `templates/core/`" for a bucket that has covered
      `templates/harness-specific/` since #551 and reports `src/cli/` separately. Leaving it turns
      one doc into two contradictory claims about one bucket. H4.
- [x] T025 Add the comment beside `smoke-audit.sh`'s path literals saying they are a **deliberate
      independent restatement** of `SURFACE_PATHSPEC` and must stay literal, citing #551 — twelve
      shipped files invisible because the pathspec ignored a whole tree, and only a hand-written
      literal elsewhere could have caught it. Without this comment the next reader "fixes" the
      duplication and the meta-test goes tautological. §5's binding paragraph, C1.
- [x] T026 Run `deno fmt --check` separately — `deno task test` is `bundle && test` and does **not**
      run it.
- [x] T027 Run the full battery: `deno task test`, then `bash scripts/smoke/run-all.sh` (which runs
      `audit.sh` last, against the real tree). The smoke suite fails on different things than
      `deno task test`; a green Deno run is not evidence about this change.
- [x] T028 Re-check the real tree after the full smoke run: `git status --short` and the four-prefix
      `ls-files --others` must both be empty, confirming §9's "no suite script leaves untracked
      residue under a surface prefix" is still true _after_ the suite has run, not only before.
- [x] T029 Verify FR-007 mechanically: `git diff main..HEAD -- scripts/smoke/coverage-allowlist.txt`
      and the `SURFACES` region of `audit.sh` must both be empty of changes.
- [x] T030 Commit with the `## Agent adoption` section and the rationale in the body (FR-008), then
      run `deno run --allow-run scripts/check-adoption.ts --from main --to HEAD`.
- [x] T031 Invoke `/specnaut review` — an implementation not through review is not finished.

---

## Dependencies

```
Phase 1  T001
   ↓
Phase 2  T002 → T003 → T004 → T005          (blocks everything; the hoists come first)
   ↓
Phase 3  T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013     [US1, P1 — the MVP]
   ↓
Phase 4  T014 ∥ … → T015 → T016 → T017                              [US2, P2]
   ↓
Phase 5  T018 ∥ T019                                                [US3, P3]
   ↓
Phase 6  T020 → T021 ;  T022                                        (T020–T022 mutually parallel)
   ↓
Phase 7  T023 ∥ T024 ∥ T025 → T026 → T027 → T028 → T029 → T030 → T031
```

**Story independence**: US2 and US3 are testable without US1's report marker, but not without Phase
2 — the hoists are what let any of them add a collection line without creating the second literal
FR-002 forbids. US1 is the MVP: it alone satisfies #564 AC1 and AC2.

## Parallel opportunities

- T014, T018, T020, T022 touch disjoint regions of `smoke-audit.sh` and can be written together, but
  **must be planted in FR-009 order** — after the last invocation whose counts are asserted. The
  file has 19 count-pinning sites and the margin is one line.
- T023, T024, T025 are three different files (README, README, `smoke-audit.sh` comment) — fully
  parallel.

## Implementation strategy

Phase 2 then Phase 3 is the MVP and closes the ticket's stated ACs. Phases 4–6 are what stop the fix
from being made of the same material as the defect: without T015 and T017 the `--exclude-standard`
assertion is vacuous, and without T013 nothing proves the new collection was ever observed failing.
Do not reorder them behind Phase 7.

---

## Completion record

Every box above is ticked. The execution-bound ones carry their evidence here, because a ticked box
is a claim and a claim needs a witness:

| Task       | Evidence                                                                                                                                                                                                        |
| :--------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T001, T005 | Baseline captured before the change: 1459 Deno tests green, `smoke-audit.sh` green, zero untracked rows under the four prefixes. Re-taken after Phase 2 with no verdict movement.                               |
| T013, T017 | The red battery — **fifteen** defects re-introduced one at a time, each observed red by the assertion meant to catch it, tree restored and SHA-verified between each. Run from a Python file, not inline shell. |
| T026       | `deno fmt --check` clean across 479 files.                                                                                                                                                                      |
| T027       | `deno task test` 1459/0; `bash scripts/smoke/run-all.sh` green, including `audit.sh` against the real tree, which it runs last.                                                                                 |
| T028       | `git status --short` and the four-prefix `ls-files --others` both empty after the full suite.                                                                                                                   |
| T029       | `coverage-allowlist.txt` unchanged (zero diff lines); the only `templates/…` line removed from `audit.sh` is the old pathspec, not a `SURFACES` entry.                                                          |
| T030       | `check-adoption.ts`: 0 feature commits in `main..HEAD`, all documented.                                                                                                                                         |
| T031       | Three review seats. Their findings are T032–T042.                                                                                                                                                               |

### Added by review — not in the original breakdown

| Task                                                                                                                                                                                                                                                                                                                                                   | Source                                                             |
| :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------- |
| T032 first-seen-order witness, T033 second-prefix fixture, T034 ambient git env, T035 `chmod 000` control, T036 guarded captures                                                                                                                                                                                                                       | Round 1 (`review-coordinator`, `test-reviewer`, `security-expert`) |
| T037 a failing collection exits 2 instead of reporting a clean tree; T038 `unset $(git rev-parse --local-env-vars)` in place of a hand-written list; T039 `length` not `NF`; T040 `origin_note` guards and explicit `return 0`; T041 the header's exit-code contract, which `--help` prints verbatim; T042 the README's two silent category exemptions | Round 2 (`code-reviewer`)                                          |

T037's witness took two attempts. A dangling `HEAD` broke the run before the collection was reached
— and in doing so exposed an unguarded `rev-parse --short HEAD` that died with git's raw fatal and
exit 128, a code no caller branches on. That is now guarded, and the witness is a **corrupt index**,
which breaks the two index-reading collections and nothing upstream of them. A witness has to break
the thing under test and nothing else.
