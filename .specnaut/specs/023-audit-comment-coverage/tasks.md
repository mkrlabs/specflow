# Tasks — 023 · A comment is not an assertion

**Plan:** `plan.md` · **Issue:**
[#545 — audit.sh counts a mention in a comment as coverage](https://github.com/specnaut/specnaut-cli/issues/545)
**Branch:** `023-audit-comment-coverage`

Every task naming a rule cites its home from the plan's §5 table (`023-Rn`). A decision may not be
spelled outside its named home.

**Phases are in EXECUTION order, not priority order.** US4 (the boundary guard's self-match) must
land before US2 (migrating `run-all.sh`), because the migration is what makes the self-match fire.
Assembling the pattern first is behaviour-neutral under today's naive strip, so it is safe to land
early; doing it after would mean knowingly pushing a red suite. The Dependencies section records
this.

---

## Phase 1 — Setup

- [ ] T001 Confirm the tree is clean and on `023-audit-comment-coverage`, and that
      `.specnaut/feature.json` names this feature directory
- [ ] T002 Record the pre-change baseline to the scratchpad — `bash scripts/smoke/audit.sh` exit
      code + `## Summary` block, and `bash scripts/smoke/run-all.sh` result with wall-clock. This is
      the evidence SC-001 and SC-003 compare against
- [ ] T003 Re-derive and record the three counts the README will cite — genuine comments, lines
      altered by the naive expression, and lines of real code it destroys — across
      `scripts/smoke/*.sh`

## Phase 2 — Foundational (blocks every story)

- [ ] T004 Add `smoke_code_lines()` to `scripts/smoke/_common.sh` (**023-R1**): `awk`, per-line
      quote state for `'` and `"`, cut at the first **unquoted** `#` that is at line start or
      preceded by whitespace. Bash 3.2 and BSD `awk` only — no `\s`, no GNU extensions
- [ ] T005 [P] Verify **023-R2** part one: line count is identical before and after, for all 19
      scripts in `scripts/smoke/`
- [ ] T006 [P] Verify **023-R2** part two — the invariant the security audit named: every output
      line is a **prefix** of its input line, across all 19 scripts. This is what makes the change
      provably fail-closed, so it is asserted, not assumed
- [ ] T007 [P] Verify **023-R3** on the corpus: the 16 `${var#…}` parameter expansions and the 82
      `echo "═══ #180  add.sh …"` banners survive intact

## Phase 3 — US1 (P1): a smoke that only mentions a file cannot vouch for it

**Independent test:** a planted file whose basename appears only inside a comment is reported as a
coverage gap, and the exit code says so.

- [ ] T008 [US1] Add the comment-only scenario to `scripts/smoke/smoke-audit.sh` **before** touching
      `audit.sh`: plant a bundled file, and a synthetic smoke whose sole mention of that basename
      sits in a comment
- [ ] T009 [US1] **Run it against the unmodified `audit.sh` and record it FAILING**, output pasted
      into this task (**023-R5**, SC-002). A guard never seen red on the defect is untested
- [ ] T010 [US1] Migrate the coverage match at `scripts/smoke/audit.sh:240` to `smoke_code_lines`
      (FR-001, FR-002 — `audit.sh` is asker one of two)
- [ ] T011 [US1] Re-run the scenario; it must now pass, and the pass must be attributable to T010
      and nothing else
- [ ] T012 [US1] Assert on the **report content**, not only the exit code: the planted file appears
      by name in the coverage-gap list. #546 exists because this file asserts on exit codes and
      reads its own report nowhere — do not add a ninth instance of that habit
- [ ] T013 [US1] SC-001: `bash scripts/smoke/audit.sh` on the real tree still exits 0 with 0
      coverage gaps. Diff the `## Summary` block against T002
- [ ] T014 [US1] SC-004: temporarily restore the raw `grep -qF` in `audit.sh`, confirm
      `smoke-audit.sh` goes red, revert. Verified by doing it

## Phase 4 — US4 (P4): the boundary guard can see itself without failing

**Independent test:** `run-all.sh`'s FR-001 check passes on the suite and still catches a planted
violation. Landing this before US2 is deliberate.

- [ ] T015 [US4] Assemble `run-all.sh:69`'s boundary pattern from fragments so the line no longer
      contains the tokens it searches for (**FR-006**, **023-R4**). Follow
      `scripts/smoke/smoke-toolbox.sh:38`'s `up=".."` — the in-repo template from #544. **Do not
      exempt the file from its own guard**
- [ ] T016 [US4] Confirm behaviour is unchanged today: `boundary_hits` is still 0 under the existing
      naive expression
- [ ] T017 [US4] **SC-006**: plant a boundary violation in a scratch copy of a smoke script, confirm
      `run-all.sh` still reports it, remove it. An assembled pattern that stops matching is a dead
      guard that looks green

## Phase 5 — US2 (P2): the rule has one spelling, in the scripts that ask it

**Independent test:** neither `audit.sh` nor `run-all.sh` carries its own comment expression, and
the suite is green.

- [ ] T018 [US2] Migrate `run-all.sh:69` to `smoke_code_lines` (FR-002 — asker two of two). Depends
      on T015
- [ ] T019 [US2] Confirm the self-match predicted by both audits does **not** occur: `boundary_hits`
      is 0 and `run-all.sh` does not exit 1 before running a smoke
- [ ] T020 [US2] **SC-003**: `bash scripts/smoke/run-all.sh` green end to end, all 10 suite members,
      wall-clock compared against T002
- [ ] T021 [US2] Confirm zero inline comment expressions remain in `audit.sh` and `run-all.sh` — by
      reading the two files, not by a repo-wide grep. The plan's first draft proposed a search that
      returned 755 hits, which is a gesture and not a gate
- [ ] T022 [US2] Confirm `scripts/smoke/smoke-toolbox.sh` is **untouched** and still green. Its
      exclusion is a decision recorded in §8, not an oversight

## Phase 6 — US3 (P3): real code is not mistaken for a comment

**Independent test:** the accuracy of the strip has a witness that fails if the strip regresses to
the naive expression.

- [ ] T023 [US3] Add assertions to `scripts/smoke/smoke-toolbox.sh` — the toolbox's own meta-test,
      whose `rm -rf` sweep is _not_ migrating but which is the right home for testing a `_common.sh`
      helper: a line carrying `${var#prefix}` and a line carrying `echo "═══ #180  add.sh …"` both
      survive `smoke_code_lines` intact (**SC-005**)
- [ ] T024 [US3] Add the negative half: a whole-line comment, an indented comment and a trailing
      comment are all removed
- [ ] T025 [US3] **Prove SC-005 is a real witness**: swap `smoke_code_lines` to the naive
      `sed 's/#.*$//'`, confirm T023 goes red, revert. Without this the accuracy requirement ships
      with zero coverage — SC-001 and the US1 scenario both pass under the naive expression

## Phase 7 — Polish & cross-cutting

- [ ] T026 [P] Write the heuristic into `scripts/smoke/README.md` § "Audit heuristics" (**FR-007**,
      **023-R6**): what counts as a comment, that the strip removes a suffix and never an interior
      span, and that heredoc bodies are not analysed. Constitution §VIII binds this edit — no
      version numbers, no dates, no counts
- [ ] T027 [P] Same edit: fix `README.md:50`, which still describes the stale scan as walking
      `SCAN_FILES` — a variable 022 deleted
- [ ] T028 [P] Confirm `audit.sh`'s header still _points at_ the README rather than restating the
      rule (**023-R6**)
- [ ] T029 [P] Security audit LOW: add `--` before the path argument in `smoke_code_lines`
- [ ] T030 Confirm the five non-migrating sites are unchanged: `audit.sh:362`, `:363`, `:370`
      (raw-byte stale scan) and `:172`, `:406` (allowlist data file). §8 names them; a silent
      migration of the `total`/`negated` pair would make `[ "$total" = "$negated" ]` suppress real
      stale findings
- [ ] T031 Run `shellcheck` over every file touched, and confirm no new SC2155-class warning
- [ ] T032 Final gate: `bash scripts/smoke/audit.sh` exits 0, `bash scripts/smoke/run-all.sh` green,
      `deno task test` green
- [ ] T033 Commit by scope, then land with `scripts/land.sh cli 023-audit-comment-coverage` from the
      monorepo root — never raw git. The reconcile of the board is inside that script on purpose
- [ ] T034 Bump the submodule pointer in `specnaut-monorepo` **after** the CLI commits are pushed,
      never before (constitution §IV)

---

## Dependencies

```
Phase 1 ──► Phase 2 ──► Phase 3 (US1)  ──┐
                    │                     ├──► Phase 7
                    ├──► Phase 4 (US4) ──► Phase 5 (US2) ──┤
                    └──► Phase 6 (US3) ───────────────────┘
```

- **T015 (US4) blocks T018 (US2).** This is the whole reason the phase order deviates from priority
  order. Migrating `run-all.sh` to an accurate strip makes its own line match its own grep pattern;
  without the assembled pattern, the suite exits 1 before running a single smoke.
- **T009 blocks T010.** The scenario must be observed failing on the defect before the fix exists,
  not after (**023-R5**).
- **T004 blocks everything in Phases 3–6.**
- Phase 6 (US3) depends only on Phase 2 and may run alongside Phases 3–5.

## Parallel opportunities

- T005, T006, T007 — three independent verifications of one new function.
- T026, T027, T028, T029 — different files, no shared state.
- Phase 6 runs concurrently with Phases 3–5 once T004 lands.

## MVP

**Phase 1 + Phase 2 + Phase 3 (US1).** That is #545's literal ask: a comment stops counting as
coverage, pinned by a test observed failing first. Phases 4–6 are what stop it being a fix that
leaves the same rule spelled twice and its accuracy untested.

## Format validation

34 tasks, all with checkbox, sequential ID in execution order, `[P]` only where files are disjoint,
`[US*]` on story phases only and never on Setup, Foundational or Polish, and a file path or an
explicit command in every description.
