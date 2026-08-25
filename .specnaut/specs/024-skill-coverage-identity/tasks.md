# Tasks — 024 · A basename that names 22 files identifies none of them

**Plan:** `plan.md` · **Issue:**
[#547 — audit.sh's coverage test is constant-true for the whole skills surface](https://github.com/specnaut/specnaut-cli/issues/547)
**Branch:** `024-skill-coverage-identity`

Rules carried forward: **022-R5** (the exit code is the verdict), **022-R13** (an allow-list entry
with no reason is not an entry), **023-R1** (a comment is not an assertion), **023-R5** (a guard is
proven by being observed red), **023-R6** (heuristics live in `README.md`). New rows this feature:
**024-R1**–**024-R4**.

## Phase 1 — Setup

- [ ] T001 Record the baseline: `audit.sh` exit code and `## Summary`, and `run-all.sh` result with
      wall-clock
- [ ] T002 Record the token measurement that settled 024-R1 — uncovered counts for the bare name,
      `skills/<n>/` and `skills/<n>/SKILL.md` — so the choice is auditable later

## Phase 2 — Foundational (blocks both stories)

- [ ] T003 Add the token function to `scripts/smoke/audit.sh` (**024-R1**): `skills/<name>/SKILL.md`
      for the skills glob, basename everywhere else. One function, one call site — the coverage loop
- [ ] T004 **FR-007**: derive the skill name as exactly ONE path segment. `case` globs match `/`, so
      `templates/core/skills/a/b/SKILL.md` matches the glob; it must not yield the name `a/b`
- [ ] T005 Leave `SURFACES` at three fields. `${rest##*|}` takes the LAST field, so a fourth would
      silently become `kind` for all 11 entries — verify by reading `audit.sh`'s parse, not by
      assuming

## Phase 3 — US1 (P1): a skill nothing asserts on is reported

- [ ] T006 [US1] Add the scenario to `scripts/smoke/smoke-audit.sh`: plant a skill whose name no
      synthetic smoke mentions, **and** a second skill named only inside an assertion about a
      different file — the `smoke-features.sh:591` shape both audits found
- [ ] T007 [US1] **Observe it RED against the unfixed `audit.sh`** and paste the output here
      (**023-R5**)
- [ ] T008 [US1] Wire the coverage loop to the token function
- [ ] T009 [US1] Re-run; green. Assert on the **report**, not only the exit code — the gap count and
      the planted names
- [ ] T010 [US1] **SC-004**: reintroduce the basename for the skills glob, confirm `smoke-audit.sh`
      goes red, revert
- [ ] T011 [US1] **SC-003**: replay every mapped surface change at `v1.0.0`, `v2.0.0`, `v3.0.0`,
      `v3.1.0`, `v4.0.0`. Hand-check every new gap. A false gap is a defect, not a finding

## Phase 4 — US2 (P2): the 13 skills are actually asserted on

**R-2 is binding here** (Kevin's answer at the stop): each assertion names what the skill
_promises_. A presence check for all 13 would satisfy the audit and close nothing — the defect this
feature removes, arriving through the door marked done.

- [ ] T012 [US2] The five per-axis audit skills — `a11y-audit`, `arch-audit`, `dep-audit`,
      `perf-audit`, `sec-audit`: scaffolded, `name:` correct, all three scope flags (`--path`,
      `--range`, `--diff`) declared, plus one axis-distinctive promise each (`WCAG 2.1 AA`,
      `hex-layer` / `god files`, `typosquats` / `license`, `N+1`, `SSRF` / `path traversal`)
- [ ] T013 [US2] The five output contracts — `workflow-contract`, `review-findings-contract`,
      `qa-report-contract`, `handoff-protocol`, `backlog-reference-contract`:
      `user-invocable: false`, plus the named block and two of its required keys
      (`WORKFLOW STATUS`/`DONE_CRITERIA_MET:`, `REVIEW_VERDICT:`/`CRITICAL_COUNT:`,
      `QA_VERDICT:`/`BUGS_FOUND:`, `HANDOFF`/`PAYLOAD:`, and for the last the number-plus-title rule
      and its ban on a bare `#N`)
- [ ] T014 [US2] `code-audit` (multi-seat, `--last`), `status-audit` (reads
      `.specnaut/logs/agents.jsonl`), `alias-example` (`alias_of:` + `overlays`)
- [ ] T015 [US2] **SC-005**: `audit.sh --since v1.0.0` reports zero un-allow-listed skill gaps. That
      is the widest window the repository has and the only one exercising all 13
- [ ] T016 [US2] Confirm each new assertion fails when its target is removed — spot-check three,
      chosen across the three groups. An assertion never seen red is a presence check wearing a
      promise's clothes

## Phase 5 — Polish

- [ ] T017 [P] `scripts/smoke/README.md`: the identifier rule, **024-R4** (the audit measures a
      mention, not an assertion), and why runtime-path matching is rejected — with the loop-list
      evidence, so it is not re-proposed. Constitution §VIII: no counts, versions or dates
- [ ] T018 [P] Security LOW: add `--` before the operand at `audit.sh:262`
- [ ] T019 [P] Security LOW: reject `entry=""` in the allowlist scan, so a leading-whitespace line
      is diagnosed rather than silently inert
- [ ] T020 Not fixed here, recorded: `ci.yml` has no `permissions:` block. Pre-existing, unrelated
      to this change, and outside a coverage ticket's scope
- [ ] T021 `shellcheck`, `deno fmt --check`, `deno lint`, `deno task test`, `audit.sh`, `run-all.sh`
      — all green
- [ ] T022 Land with `scripts/land.sh cli 024-skill-coverage-identity`, then bump the submodule
      pointer **after** the push (constitution §IV)

## Dependencies

- T003/T004 block Phases 3 and 4.
- T007 blocks T008 — red before the fix exists (**023-R5**).
- T012–T014 block T015: the SC cannot pass until the assertions exist.
- Phase 5 last.

## MVP

Phases 1–3. That is the mechanism and its guard. Phase 4 is what makes the mechanism find something,
and Kevin chose it into this branch rather than behind an allow-list.
