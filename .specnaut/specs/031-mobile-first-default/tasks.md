# Tasks — Make mobile-first the assumed default for UI work

- **Plan:** `plan.md` (same directory). Read it whole before starting; the 🔒 decision table in § 5 is binding.
- **Item:** specnaut-cli#576 · **Branch:** `031-mobile-first-default`
- **Depends on:** cli#575. If it has not landed, land the identical wiring shape so the two converge.

## The decision table, carried forward

A task may not put a decision anywhere but its named home. Each task below names
the home when it touches a rule. Repeated here so nobody has to hold two files open:

| Decision | Home |
| :--- | :--- |
| What mobile-first obliges | `templates/core/skills/mobile-first-contract/SKILL.md` |
| Whether the default applies to a project | the project's `.specnaut/memory/constitution.md`; its **form** in the contract |
| The tunable values | the project's `DESIGN.md` if present, else its constitution `Front-end patterns` |
| Which surfaces carry the pointer | the derived candidate set in the test, minus a justified exclusion list |
| Framework-agnosticism | the deny-list assertion, scoped to the contract file |
| Which harnesses are always-on | `alwaysOn: true` data on `harness_static`, joined against `HARNESSES` |
| Whether a template is visible at all | `templates/manifest.json` |
| Where the opt-out convention is documented | both constitution files |
| Whether an assertion is accepted | the commit body (FR-012) |

---

## Phase 1 — Setup

- [ ] T001 Read `plan.md` § 5 and § 6 whole, and confirm cli#575's wiring shape has landed or is absent, in `apps/specnaut-cli/.specnaut/specs/031-mobile-first-default/plan.md`
- [ ] T002 Re-verify the AC-6 surface floor against the current tree rather than trusting the plan's list, in `apps/specnaut-cli/templates/`

## Phase 2 — Foundational (blocks every story)

**Nothing in Phase 3+ can reach a user until these land.**

- [ ] T003 Widen `CoreEntry.managedSection` from a single optional string to a list in `apps/specnaut-cli/src/domain/core_bundle.ts` — FR-018. Home: this file owns the shape; no consumer may re-declare it.
- [ ] T004 Iterate the widened field in `managedSectionEntries` in `apps/specnaut-cli/src/application/upgrade_project.ts` — FR-018
- [ ] T005 Validate every declared label in the fence validator in `apps/specnaut-cli/scripts/bundle-templates.ts` — FR-018. It fails the build on a declared-but-unfenced label; two labels must both be checked.
- [ ] T006 Author the contract — the eight rules as obligations over concepts, the default-with-opt-out statement, the opt-out's literal form, the non-matching-means-absent rule, the scope-limiting sentence, `user-invocable: false` — in `apps/specnaut-cli/templates/core/skills/mobile-first-contract/SKILL.md` — FR-001…FR-005, FR-013, FR-014, FR-016. Home: this file is the ONLY home of the rule set.
- [ ] T007 Register the contract as a `skill` entry in `apps/specnaut-cli/templates/manifest.json` — FR-001. Home: an authored template unregistered here is invisible to every user.
- [ ] T008 Add the single new `SYNC_PAIRS` row for the contract in `apps/specnaut-cli/tests/plugin/plugin_sync_test.ts` — the delta is +1; both agents already have rows
- [ ] T009 Mirror the contract byte-identically to `apps/specnaut-cli/plugin/skills/mobile-first-contract/SKILL.md`
- [ ] T010 Regenerate the bundle with `deno task bundle` into `apps/specnaut-cli/src/templates_bundle.ts`

## Phase 3 — US1: the main-session turn (P1)

**Goal.** A UI request in an ordinary turn — no phase, no agent, no plan — produces
mobile-first output, on all seven harnesses, in projects scaffolded before this shipped.

**Independent test.** Render a project per harness; assert the contract is reachable
from a surface that harness loads without invocation. No harness may be exempt.

- [ ] T011 [US1] Add the `ui-defaults` fenced block carrying the pointer and nothing else to `apps/specnaut-cli/templates/core/root/AGENTS.md` — FR-019. One fence, one subject: do not extend `chain-stops`.
- [ ] T012 [US1] Declare the second `managedSection` label on the `project-root` entry in `apps/specnaut-cli/templates/manifest.json` — FR-019
- [ ] T013 [P] [US1] Add the prose pointer (Channel B) to `apps/specnaut-cli/templates/harness-specific/claude/CLAUDE.md`
- [ ] T014 [P] [US1] Add the prose pointer to `apps/specnaut-cli/templates/harness-specific/codex/AGENTS.md`
- [ ] T015 [P] [US1] Add the prose pointer to `apps/specnaut-cli/templates/harness-specific/cursor/specify-rules.mdc`
- [ ] T016 [US1] Add `alwaysOn: true` as data to the three always-on `harness_static` entries in `apps/specnaut-cli/templates/manifest.json` — FR-011. Home: this flag is the decision; no test may re-classify the other 14 entries by hand.
- [ ] T017 [US1] Derive the per-harness table as `HARNESSES × harness_static.filter(alwaysOn)`, taking `HARNESSES` from `apps/specnaut-cli/src/domain/installed_lock.ts` — FR-011. `harness_static` alone cannot name `windsurf` or `antigravity`; they have zero entries.
- [ ] T018 [US1] Write the reach assertion — render per harness, assert reachability per harness, no declared-uncovered escape — in `apps/specnaut-cli/tests/templates/mobile_first_reach_test.ts` — FR-015. **This is the only assertion in the set about reach rather than shape.**
- [ ] T019 [US1] Observe T018 red by removing the `ui-defaults` fence from `apps/specnaut-cli/templates/core/root/AGENTS.md`, then restore and confirm green, running `apps/specnaut-cli/tests/templates/mobile_first_reach_test.ts` — FR-012

## Phase 4 — US2: the planned feature (P2)

**Goal.** `/specnaut plan` on a UI feature carries adaptive behaviour into its requirements unasked.
**Independent test.** The FE-gated branch of the phase doc points at the contract.

- [ ] T020 [US2] Add the pointer to the existing FE-gated branch (`## Visual Prototyping…`) in `apps/specnaut-cli/templates/core/skills/specnaut/phases/plan.md` — one line; the file has 355 chars of Windsurf headroom, so budget it
- [ ] T021 [US2] Mirror to `apps/specnaut-cli/plugin/skills/specnaut/phases/plan.md`

## Phase 5 — US3: the design system (P3)

**Goal.** `DESIGN.md` declares breakpoint tokens, a touch-target minimum and an adapting scale.
**Independent test.** The canonical template contains a breakpoint concept and exactly one touch number.

- [ ] T022 [US3] Add the responsive/adaptive section — declared breakpoint tokens, declared touch-target minimum, adapting type/spacing scale — to the canonical `DESIGN.md` template in `apps/specnaut-cli/templates/core/agents/ui-ux-designer.md` — FR-009
- [ ] T023 [US3] Replace the `Min height 40px (touch-friendly)` literal with a reference to the declared token in `apps/specnaut-cli/templates/core/agents/ui-ux-designer.md` — FR-009. Home: the value lives in the project's `DESIGN.md`; this file must stop deciding it. 40 is also below both platform minimums.
- [ ] T024 [US3] Make discovery mode assume mobile-first without asking, and ask about the exception only on a desktop-only signal, in `apps/specnaut-cli/templates/core/agents/ui-ux-designer.md` — FR-009
- [ ] T025 [P] [US3] Add the `skills:` frontmatter pointer (Channel A) to `apps/specnaut-cli/templates/core/agents/ui-ux-designer.md` — FR-017
- [ ] T026 [P] [US3] Add the `skills:` frontmatter pointer to `apps/specnaut-cli/templates/core/agents/developer.md` — FR-017
- [ ] T027 [US3] Mirror both agents byte-identically to `apps/specnaut-cli/plugin/agents/ui-ux-designer.md` and `apps/specnaut-cli/plugin/agents/developer.md`

## Phase 6 — US4: the exception (P4)

**Goal.** A desktop-only project declares that once, in one place, and is not asked again.
**Independent test.** The named home has a heading to declare under, in a project fresh from `init`.

- [ ] T028 [US4] Add § `Front-end patterns` carrying the default bullet and opt-out convention by pointer to the **seed** `apps/specnaut-cli/templates/core/specnaut/memory/constitution.md` — FR-006. It has two headings today and no such section; `developer.md` already reads one that has never existed.
- [ ] T029 [US4] Add the same to `apps/specnaut-cli/templates/core/specnaut/templates/constitution-template.md` — FR-006. Editing only this one leaves the opt-out's home with nowhere to declare.
- [ ] T030 [US4] Add the fallback binding site — the constitution's `Front-end patterns` when no `DESIGN.md` exists — to `apps/specnaut-cli/templates/core/skills/mobile-first-contract/SKILL.md`. Home: two sites in priority order, never "the code".

## Final Phase — Polish and cross-cutting

- [ ] T031 Write the derived-candidate-minus-justified-exclusions enumeration, never a positive list, in `apps/specnaut-cli/tests/templates/mobile_first_contract_test.ts` — FR-008. The precedent's positive list still carves out `specify.md`, deleted two releases ago.
- [ ] T032 Assert the contract is manifest-registered, mirror-identical, pointed at through both channels, restated by none, framework-name-free (scoped to the contract file), and tunable-free by named tunable rather than by digit, in `apps/specnaut-cli/tests/templates/mobile_first_contract_test.ts` — FR-003, FR-004, FR-010, FR-017
- [ ] T033 Assert `user-invocable: false` and the literal marker sentence in `apps/specnaut-cli/tests/templates/mobile_first_contract_test.ts` — FR-016
- [ ] T034 Observe every assertion in `apps/specnaut-cli/tests/templates/mobile_first_contract_test.ts` red on the defect it guards — pointer removed from a surface, manifest entry dropped, mirror desynced, framework name introduced, tunable introduced — then green, and record each observation in the commit body — FR-012
- [ ] T035 [P] Run `deno fmt`, `deno lint`, `deno check` and `deno task test` from `apps/specnaut-cli` — `deno task test` is `bundle && test` and does NOT run fmt or lint
- [ ] T036 [P] Verify Windsurf headroom held with `WINDSURF_WORKFLOW_BUDGET_CHARS` in `apps/specnaut-cli/src/infrastructure/harness/windsurf_harness.ts` — four workflows sit under 200 chars of slack
- [ ] T037 Run the adoption gate: `deno run --allow-run scripts/check-adoption.ts --from main --to HEAD` from `apps/specnaut-cli`
- [ ] T038 Land with `scripts/land.sh cli 031-mobile-first-default`, run from the monorepo root `/Users/kevin/Sites/specnaut-monorepo/scripts/land.sh` — never raw git; the reconcile is inside the tool that pushes

## Dependencies

```
Phase 1 → Phase 2 (blocking) → Phase 3 (US1) ─┐
                             → Phase 4 (US2) ─┤
                             → Phase 5 (US3) ─┼→ Final
                             → Phase 6 (US4) ─┘
```

Phase 2 blocks everything: no story reaches a user before the contract exists,
is registered, and `managedSection` accepts a second label. US1–US4 are mutually
independent once it lands.

**Within Phase 3, T011→T012 is ordered** (the fence must exist before its label is
declared, or T005's validator fails the build). T013–T015 are parallel.
**T016→T017 is ordered** (data before derivation). **T018→T019 is ordered** by
definition — an assertion is observed red after it is written.

## Parallel opportunities

- T013 · T014 · T015 — three different harness files, no shared state
- T025 · T026 — two different agent files
- T035 · T036 — independent verification runs
- **Across stories:** US2, US3 and US4 can run concurrently once Phase 2 lands. US1 should go first regardless: it carries the reach assertion, and a green suite without it is the inert-but-green outcome the plan's audit named.

## MVP

**Phase 2 + Phase 3 (US1).** That is the reported failure — a UI request in an
ordinary turn — served on all seven harnesses. US2, US3 and US4 each improve a
narrower path. US3 is the one to take next: the shipped `DESIGN.md` template
currently instructs the opposite of this contract, so until T022–T024 land, one
surface actively contradicts the default.
