# Tasks: Wire the smoke suite to CI

**Input**: `.specnaut/specs/022-smoke-suite-ci/plan.md` (the feature's one planning document)
**Backlog item**:
[#544 — Wire the smoke suite to CI — three checks were red across two majors](https://github.com/specnaut/specnaut-cli/issues/544)

**Tests**: the scripts under `scripts/smoke/` **are** the tests. No separate test tasks are
generated; `smoke-audit.sh` is the meta-test and gains an assertion of its own (T024).

**Two repositories.** Tasks marked **[MONO]** touch `specnaut/specnaut-monorepo`; everything else
touches `specnaut/specnaut-cli`. Per constitution § IV the CLI commit is pushed **first** and the
pointer commit second, and per plan.md A13 the `Closes #544` keyword goes in the **monorepo**
commit, never the CLI one.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelisable — different files, no dependency on an incomplete task
- **[Story]**: US1 / US2 / US3 / US4 (plan.md § 2)

## Decision-table discipline (binding)

Every task below that touches a rule names its home from plan.md § 5. **A decision may not be
spelled outside its home.** If implementation makes a home look wrong, amend plan.md § 5 first — a
second spelling discovered at review is a plan violation, not a style note.

---

## Phase 1: Setup

**Purpose**: create the destination and move the unit. The 16 scripts move together — every
asserting script reaches `bootstrap-*.sh` and `clean.sh` through `$SCRIPT_DIR`, so a partial move is
not available (plan.md § 6, invariant).

- [x] T001 Create `apps/specnaut-cli/scripts/smoke/` and copy all 16 `.sh` files from
      `/Users/kevin/Sites/specnaut-monorepo/.claude/skills/test-sandbox/scripts/` into it,
      preserving the executable bit
- [x] T002 Verify the copy is byte-identical for all 16 files (`diff -r` against the source
      directory) and record the count in the commit body — a silent 15-of-16 is the failure this
      task exists to exclude
- [x] T003 [P] Confirm `sandbox/` is already gitignored in `apps/specnaut-cli/.gitignore` (it is,
      line 9) so no scenario tree can be committed from the new location

**Checkpoint**: the scripts exist in their new home and still resolve nothing correctly yet.

---

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work can begin until this phase is complete.** Everything below depends on path
resolution having exactly one home.

- [x] T004 Create `apps/specnaut-cli/scripts/smoke/_common.sh` exporting `CLI`, `SRC_ROOT`,
      `SMOKE_DIR` — **home of decision R1**. Derive `CLI` from the script's own location two levels
      up; never from the caller's cwd, and never with a `../../../..` climb
- [x] T005 Add the `SUITE_FILES` list to `_common.sh` — **home of decision R3**, the single answer
      to "which scripts constitute the suite". Consumed by `run-all.sh` (T013) and by both of
      `audit.sh`'s scans (T019)
- [x] T006 Add `pass()` / `fail()` / the failure counter / the end banner to `_common.sh` — **home
      of decision R4**. One format, so `run-all.sh` has one thing to read and FR-013 has one shape
      to satisfy
- [x] T007 Add the scenario-name allowlist to `_common.sh` — **home of decision R11**.
      `case "$NAME" in *[!A-Za-z0-9._-]*|""|.|..) die ;; esac`. This is finding S4: `clean.sh:15` is
      `rm -rf "$CLI/sandbox/$1"` and T013 adds the first programmatic caller
- [x] T008 Constrain `_common.sh` to **bash 3.2** — no `declare -A`, no `mapfile`, no `${var,,}`
      (plan.md § 6, finding A11). `smoke-all-harnesses.sh:19-21` already pays this cost
      deliberately; a `_common.sh` written to bash 4 passes CI and breaks US2/US4 on macOS
- [x] T009 Rewire all 15 scripts carrying `ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"` +
      `CLI="$ROOT/apps/specnaut-cli"` to source `_common.sh` instead, in
      `apps/specnaut-cli/scripts/smoke/`
- [x] T010 Replace the two `cd "$ROOT"` calls in
      `apps/specnaut-cli/scripts/smoke/smoke-tag-release.sh:92,110` with `cd "$CLI"` — their only
      purpose is leaving the sandbox directory
- [x] T011 Replace the nine private `pass`/`fail`/counter blocks with the `_common.sh` harness from
      T006, one script at a time, in `apps/specnaut-cli/scripts/smoke/smoke-*.sh`
- [x] T012 Prove FR-001 mechanically:
      `grep -n '\.\./\.\./\.\./\.\.\|apps/specnaut-cli' apps/specnaut-cli/scripts/smoke/*.sh`
      returns nothing

**Checkpoint**: every script resolves its own paths from one home, in bash 3.2, with one reporting
format. User stories can now proceed.

---

## Phase 3: User Story 1 — a change breaks an assertion, CI goes red (Priority: P1) 🎯 MVP

**Goal**: a commit that breaks a shipped-template assertion turns a CI check red **while still on a
feature branch**, and the assertion is made against that commit's tree rather than the committed
bundle.

**Independent test**: break one assertion on a throwaway commit, push the branch, watch the check go
red and name it (T017). Then append a marker to a `templates/core/` file and confirm the suite sees
it — the check that R7 actually holds.

- [x] T013 [US1] Create `apps/specnaut-cli/scripts/smoke/run-all.sh` — **home of decisions R7 and
      R9**. It runs `deno task bundle` **before the first script**, assigns each scenario its name,
      runs the suite serially, and exits non-zero if any script does (FR-002, FR-003)
- [x] T014 [US1] Make `run-all.sh` restore `src/templates_bundle.ts` to its prior state on exit
      (trap), so a local run cannot leave the tree dirty and abort `preflight.sh:13` for an
      unrelated reason (plan.md A3, second half)
- [x] T015 [US1] Add the FR-001 grep from T012 as a check **inside** `run-all.sh` (finding S6) — a
      green run becomes the evidence, instead of a person remembering to look
- [x] T016 [US1] Create `apps/specnaut-cli/.github/workflows/smoke.yml`: `on: push` (**all
      branches**) `+ pull_request`; `permissions: contents: read` (S2); `timeout-minutes: 10` and
      `concurrency: {group: smoke-${{ github.ref }}, cancel-in-progress: true}` (S5);
      `actions/checkout@v6` with `fetch-depth: 0` (FR-008); one step calling `run-all.sh`
- [x] T017 [US1] Write the header comment in `smoke.yml` owning **decision R10** — zero secrets,
      `pull_request` and never `pull_request_target`, read-only token, and _why_. Register:
      `adoption_lint.yml:61-66`. This is finding S3: the invariant the whole design rests on is
      currently recorded nowhere
- [x] T018 [US1] Add a second comment in `smoke.yml` explaining why this workflow's trigger differs
      from every other one in the repository (Q2) — features land by local `--ff-only`, so the
      branch push is the last moment a gate can prevent rather than report

**Checkpoint**: the gate exists and fires. It is not yet honest — Phase 5 makes it so.

---

## Phase 4: User Story 2 — the guard runs from a bare clone (Priority: P2)

**Goal**: someone holding only `specnaut/specnaut-cli` runs the whole guard with one command and
nothing reports itself skipped.

**Independent test**: `git clone` the CLI alone into a tmpdir, run `bash scripts/smoke/run-all.sh`,
confirm zero "skipped" lines and a real audit verdict.

- [x] T019 [US2] Change `apps/specnaut-cli/scripts/smoke/audit.sh` to take `--src-root <dir>`,
      defaulting to `_common.sh`'s value — **home of decision R2**, finding A1. Delete the
      cwd-derived `git rev-parse --show-toplevel` at `:52` and the now-dead
      `apps/specnaut-cli/templates` branch at `:56-59`
- [x] T020 [US2] Point `audit.sh`'s two scans at `SUITE_FILES` (T005) instead of the `smoke-*.sh`
      glob at `:230` and the script names hardcoded in the SURFACES map at `:91-103` — finding A5,
      otherwise an assertion hoisted into `_common.sh` silently stops covering its surface and
      reports a false gap
- [x] T021 [US2] Make `audit.sh`'s exit code its verdict — **home of decision R5**, FR-004. Non-zero
      on a stale assertion always; on a coverage gap unless allow-listed (T026)
- [x] T022 [US2] Rewrite `apps/specnaut-cli/scripts/smoke/smoke-audit.sh` to stop copying `audit.sh`
      into the synthetic tree at `:58` — invoke the real one in place with `--src-root "$SANDBOX"`
      (finding A2). This deletes the "is the copy the same as the original" question and unblocks
      T019
- [x] T023 [US2] Update `smoke-audit.sh`'s 8 synthetic-tree path references
      (`:36,47,54,58,59,77,82,88`) to the new layout — finding A10: they **move**, they do not
      vanish with the deleted directory, and FR-010's grep will return them
- [x] T024 [US2] Add the exit-code assertion to `smoke-audit.sh` (FR-005, finding A4): capture
      status separately (`set +e; out=$(…); rc=$?; set -e`) and assert `rc` non-zero with findings,
      zero without. Today `:88`'s `|| true` swallows exactly the property T021 introduces
- [x] T025 [US2] Update `apps/specnaut-cli/.specnaut/release/preflight.sh`:
      `audit_sh="scripts/smoke/audit.sh"`, **delete** the standalone-clone skip at `:44-46` (FR-009)
      and the output parse at `:49-52` (FR-004) — but keep a named `❌` message so a finding does
      not abort silently under `set -euo pipefail`

**Checkpoint**: the audit answers the same way everywhere, and its meta-test can prove it.

---

## Phase 5: User Story 3 — a gap is named, and an unmapped surface is not silence (Priority: P2)

**Goal**: a shipped file with no assertion is named with the script expected to assert it; a file
under **no** mapped surface is named as unmapped rather than passing silently.

**Independent test**: add a file under a mapped surface with no assertion → named as a gap. Add one
under an unmapped path (e.g. `templates/core/statusline/`) → named under `## Unmapped surface`.

- [x] T026 [US3] Add the coverage-gap allowlist beside `audit.sh` — **home of decision R13**, Q4.
      One entry per deliberately-deferred assertion, each carrying a written reason
- [x] T027 [US3] Make `audit.sh` report an allowlist entry whose file no longer exists as a **stale
      allowlist entry**, in the same register as a stale assertion (plan.md § 9) — otherwise the
      allowlist becomes the new hiding place and rots exactly as the assertions did
- [x] T028 [US3] Add the `## Unmapped surface` section to `audit.sh` — **home of decision R6**,
      finding A6. Replace the silent `continue` at `:134-136` with a report, and count it in the
      summary. `:223-225`'s `return 0` in `resolves()` stays (it is the resolver's correct default),
      but unmapped **coverage** must be visible
- [x] T029 [US3] Verify T028 against a real case: `templates/core/statusline/` or any path outside
      the eleven globs at `:91-103` must appear in the report instead of producing
      `✓ every surface change has a matching smoke assertion`

**Checkpoint**: the gate reports what it does not cover. It is now honest about its own reach.

---

## Phase 6: User Story 4 — the interactive toolbox still works (Priority: P3)

**Goal**: the root `test-sandbox` skill bootstraps, inits and inspects exactly as before, and
`qa-tester` keeps a true Vite scaffold when it asks for one.

**Independent test**: run the skill's documented entry point from a monorepo session and complete a
brownfield scenario end to end.

- [x] T030 [US4] Rewrite `apps/specnaut-cli/scripts/smoke/bootstrap-vite.sh` to write the brownfield
      tree itself by default — offline, deterministic, no registry call (Q3, finding S1, FR-012).
      Reproduce Vite's `.gitignore` faithfully: it is what the brownfield `.gitignore`-merge
      scenario asserts against
- [x] T031 [US4] Add the `--real` opt-in to `bootstrap-vite.sh`, pinned to an exact `create-vite`
      version — never `@latest` (FR-012). No smoke script passes it; only the `qa-tester` fidelity
      path does
- [x] T032 [P] [US4] [MONO] Rewrite
      `/Users/kevin/Sites/specnaut-monorepo/.claude/skills/test-sandbox/SKILL.md` as a facade:
      **one** entry point (`cd apps/specnaut-cli && bash scripts/smoke/run-all.sh`) plus
      `run-all.sh --list`, replacing all 28 path references (finding A9). Per constitution § VIII,
      do not restate a harness count or a script count
- [x] T033 [P] [US4] [MONO] Update the 2 invocation paths in
      `/Users/kevin/Sites/specnaut-monorepo/.claude/agents/qa-tester.md` (`:172`, `:315`) and
      document `--real` as the fidelity option
- [x] T034 [P] [US4] [MONO] Update
      `/Users/kevin/Sites/specnaut-monorepo/.claude/skills/writing-plans/SKILL.md:208` and
      `/Users/kevin/Sites/specnaut-monorepo/.claude/skills/verification-before-completion/SKILL.md:87`

**Checkpoint**: nothing a maintainer or an agent invokes by name is broken.

---

## Phase 7: Polish & cross-cutting concerns

- [x] T035 Fix `apps/specnaut-cli/scripts/smoke/smoke-picker.sh` cause 1 (FR-011): add the missing
      keystroke for the spec-backend picker added between the versioning-scheme step and the URL
      prompt — the 8-entry `SCRIPT` at `:45-54` is one short, which is why `init` hangs to the `:62`
      deadline and 3 assertions fail on a `.specnaut/` never written
- [x] T036 Fix `smoke-picker.sh` cause 2: `:112` asserts `hosted online Kanban`; the note now reads
      `real-time API — browser login`
- [x] T037 Give `smoke-picker.sh` a hard per-script timeout so a future flow change fails fast and
      named rather than consuming the job budget (plan.md § 9) — this is a different guarantee from
      T016's `timeout-minutes`, and both are kept
- [x] T038 Strip ANSI escapes and cap the failure detail in `smoke-picker.sh:96-122` before it
      reaches a world-readable public log (finding S7), following `smoke-hooks.sh:108`'s existing
      `head -1` instinct
- [x] T039 Update the path in
      `apps/specnaut-cli/templates/core/skills/verification-before-completion/SKILL.md:105` — **path
      only**. The section is already correctly self-gating at `:92-97`; do not "fix" the gating
      (plan.md § 7)
- [x] T040 Mirror T039 byte-identically into
      `apps/specnaut-cli/plugin/skills/verification-before-completion/SKILL.md`, then run
      `deno task bundle` to regenerate `src/templates_bundle.ts`
- [x] T041 Run the full suite green: `bash apps/specnaut-cli/scripts/smoke/run-all.sh` — all 9
      scripts, zero red checks (FR-011). Eight are green today; `smoke-picker` is the ninth
- [x] T042 Run `deno task fmt:check`, `deno task lint`, `deno task check`, `deno task test` — 1413
      tests must stay green, and `ci.yml:22-35` must not find a stale bundle
- [ ] T043 **The reproduction FR-013 requires**: on a throwaway commit, break one assertion, push
      the branch, confirm CI goes red and the log names it. Then revert. Record the run URL in
      plan.md § 4 under SC-006
- [ ] T044 Measure SC-004 on the first green CI run — the cold-runner wall-clock — and record it in
      plan.md § 4. The 7 s figure in § 1 is warm-cache and is explicitly not the baseline
- [x] T045 [MONO] Delete `/Users/kevin/Sites/specnaut-monorepo/.claude/skills/test-sandbox/scripts/`
      entirely
- [x] T046 [MONO] Rewrite
      `/Users/kevin/Sites/specnaut-monorepo/.claude/agents/product-owner/memory/reference_submodule_has_no_dotclaude.md`
      — finding A10. It is `type: reference`, read by agents as **current fact**, and `:17`
      hardcodes an absolute workspace path that this change falsifies. It is not a dated record
- [x] T047 [MONO] Add a closing line to
      `/Users/kevin/Sites/specnaut-monorepo/.claude/agents/product-owner/memory/pattern_a_guard_belongs_on_the_repo_it_guards.md`
      recording that the pattern it describes was acted on. Leave the two `architect-advisor`
      memories alone — they are dated notes
- [x] T048 Prove FR-010: `grep -rn "test-sandbox/scripts" /Users/kevin/Sites/specnaut-monorepo/`
      returns only intentional historical mentions (the 2 `architect-advisor` memories and the 2
      `docs/superpowers/` design records). All 56 other lines across 16 files are accounted for
- [ ] T049 Land the CLI half:
      `cd apps/specnaut-cli && deno run --allow-run scripts/check-adoption.ts --from main --to HEAD`,
      then `scripts/land.sh cli 022-smoke-suite-ci`. The commit body references `#544` and **must
      not** carry a closing keyword (finding A13)
- [ ] T050 [MONO] Land the monorepo half **after** the CLI push has landed (§ IV): the script
      deletion, the four document rewrites, the two memory edits, and the submodule pointer bump —
      in one commit carrying `Closes #544`, so the board cannot report done before both halves exist

---

## Dependencies

```
Phase 1 (T001-T003)
   └─> Phase 2 (T004-T012)  ⚠️ blocks everything
          ├─> Phase 3  US1 (T013-T018)
          ├─> Phase 4  US2 (T019-T025)   [T019 needs T022 landed first]
          │      └─> Phase 5  US3 (T026-T029)
          └─> Phase 6  US4 (T030-T034)
                 └─> Phase 7  Polish (T035-T050)
```

**Story independence**: US1, US2 and US4 are independent once Phase 2 lands. US3 depends on US2
(T026-T028 all edit `audit.sh`, which T019-T021 restructure first). US4 is the only story that
touches the monorepo before Phase 7.

**One ordering trap, named**: T019 (`--src-root`) and T022 (`smoke-audit.sh` stops copying) must
land **together**. T019 alone breaks the meta-test — that is finding A1, and doing them in separate
commits reproduces the defect the plan exists to avoid.

## Parallel execution

- **Phase 2**: T004-T008 build one file and are serial. T009/T010/T011 are per-script sweeps and can
  be split across scripts, but all three touch the same 15 files — do them as one pass, not three.
- **Phase 6**: T032, T033, T034 are `[P]` — three different documents in the monorepo, no overlap.
- **Phase 7**: T035-T038 all edit `smoke-picker.sh`; serial. T039/T040 are a pair. T045-T047 are
  monorepo-side and independent of each other.

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US1).** That delivers the thing #544 asks for: a gate that goes
red before a break reaches `main`. It is shippable on its own — the audit still runs from
`preflight.sh` the way it does today.

**Phases 4-5 are what make it honest.** Without US2 the audit answers differently depending on where
it is called from; without US3 it reports green on surfaces it does not cover. Both are the ticket's
own failure mode relocated, so neither is optional in the end — but the gate is useful before them.

**Phase 6 is the compatibility surface**, and Phase 7 is where the two repositories are reconciled.
Nothing in Phase 7 may be skipped: T043 is the only task that proves the gate works, T048 is the
only one that proves nothing was left pointing at a deleted directory, and T050 is what stops the
board reporting done on half a change.

## Summary

|                        |                      |
| :--------------------- | -------------------: |
| Total tasks            |                   50 |
| Setup                  |                    3 |
| Foundational           |                    9 |
| US1 (P1, MVP)          |                    6 |
| US2 (P2)               |                    7 |
| US3 (P2)               |                    4 |
| US4 (P3)               |                    5 |
| Polish                 |                   16 |
| Monorepo-side tasks    |                    8 |
| Parallel opportunities | 4 tasks marked `[P]` |
