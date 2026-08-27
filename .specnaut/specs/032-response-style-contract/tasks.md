# Tasks — Centralize the assistant response-style contract

**Feature:** `032-response-style-contract` · **Branch:** `feat/575-response-style-contract`
**Item:**
[#575 — Centralize the assistant response-style contract into one harness-agnostic source referenced by pointer](https://github.com/specnaut/specnaut-cli/issues/575)
**Derived from:** the approved `plan.md`, including the two decisions settled at the stop on
2026-08-27.

> **The 🔒 decision table is binding on every task below.** A task may not put a decision anywhere
> but its named home. Where a task touches a rule in the table, the home is named in the task text.

**Tests are not optional here.** #575's AC 4 and AC 11 make a mechanical gate part of the
deliverable, and AC 11 requires each new assertion to have been observed red.

---

## Phase 1 — Setup

- [x] T001 Create `templates/core/skills/response-style-contract/SKILL.md` with frontmatter only —
      `name`, `description`, `user-invocable: false` — matching the shape of
      `templates/core/skills/mobile-first-contract/SKILL.md` (FR-001).

## Phase 2 — Foundational (blocks every story below)

- [x] T002 Register the contract in `templates/manifest.json` under `category: "skill"`, source
      `core/skills/response-style-contract/SKILL.md` (FR-002). **Home:** the manifest is the
      authored home for registration; never hand-edit `src/templates_bundle.ts`.
- [x] T003 [P] Create the mirror `plugin/skills/response-style-contract/SKILL.md` and add its pair
      to `SYNC_PAIRS` in `tests/plugin/plugin_sync_test.ts`, in the `user-invocable: false` contract
      group (FR-003, FR-019). Do **not** add `.codex-plugin/` or `.cursor-plugin/` rows — they hold
      a `plugin.json` each.
- [x] T004 Run `deno task bundle` and confirm `src/templates_bundle.ts` regenerates with the new
      entry. Nothing downstream is measurable until this lands.

---

## Phase 3 — US1: the contract reaches every turn, on every harness (P1)

**Independent test criterion:** for each of the seven harnesses, `mapBundle` both writes the
contract file and carries a pointer on a surface that is in force without invocation.

- [x] T005 [US1] Write the contract's opening and its universal rules in
      `templates/core/skills/response-style-contract/SKILL.md`: be concise, no repetition; visually
      ordered output, a table where a table fits; step by step; explain technical topics as simply
      as possible unless the user asks for depth (FR-004). **Home:** this file, and nowhere else.
- [x] T006 [US1] Add to the same file the scope-limiting clause (FR-012), the value-free /
      framework-agnostic self-denying clause (FR-011), the **no illustrative example names
      anything** clause (FR-027), and the precedence clause — brevity removes restatement, never a
      finding, a required field, a constraint enumeration or a required block; where this contract
      and a block-defining contract disagree, the block-defining contract wins (FR-030).
- [x] T007 [US1] Add the sentence recording that a modified delivered copy is the project's, not
      Specnaut's, and that `upgrade` is its only repair path (FR-033).
- [x] T008 [P] [US1] Add the verbatim pointer line to the three always-on context files:
      `templates/harness-specific/claude/CLAUDE.md`, `templates/harness-specific/codex/AGENTS.md`,
      `templates/harness-specific/cursor/specify-rules.mdc` (FR-013). Use the established form; do
      not invent a second wording.
- [x] T009 [US1] Add the `response-style` managed section to `templates/core/root/AGENTS.md` —
      pointer only, never content — and declare the label alongside `chain-stops` and `ui-defaults`
      in `templates/manifest.json` (FR-014). **Home:** the manifest; the bundle is regenerated,
      never edited.
- [x] T010 [P] [US1] Add the pointer to `templates/core/skills/using-specnaut/SKILL.md` — the
      on-demand route for `copilot` and `opencode` (FR-015).
- [x] T011 [P] [US1] Add the pointer to `templates/core/skills/specnaut/SKILL.md` (FR-016). **Do
      not** add one to `templates/core/skills/board/SKILL.md` — withdrawn at the stop, Q1.
- [x] T012 [US1] Record the withdrawal of the secondary leg where the next person will read it, with
      the measurement that decided it — `skills:` discarded by `codex`/`copilot`/`opencode`, 50 of
      110 renders, zero main-session turns governed (FR-035).
- [x] T013 [US1] Create `tests/templates/response_style_reach_test.ts`. Assert **delivery** per
      harness, keyed on a sentence from the contract **body**, never its frontmatter —
      `copilot_harness.ts` substitutes `applyTo: "**"` and `codex`/`opencode` rebuild frontmatter
      (FR-020).
- [x] T014 [US1] In the same file, assert the always-on route **alone** — derived from the
      manifest's `alwaysOn` flag, with the membership oracle inverted so a harness shipping a
      context file that is not flagged fails (FR-021, FR-022).
- [x] T015 [US1] In the same file, assert the `AGENTS.md` fence route **alone**, reading the fenced
      body via `extractBlock(content, "response-style", "html")` — a pointer outside the fence
      reaches new projects only (FR-022).
- [x] T016 [US1] In the same file, assert the fence is **declared** on the entry that ships it.
      `managedSectionEntries` grafts only declared labels; an undeclared fence reaches no existing
      project, silently (FR-024).
- [x] T017 [US1] Create `tests/templates/response_style_contract_test.ts` with the derived surface
      enumeration: candidates from `CORE_BUNDLE` (always-on destination, documented anchor, or the
      root fence), an exclusions map where an entry with an empty reason is not an exclusion, a
      reverse check on members outside the derivation, and a staleness assertion that fails when an
      exclusion names a non-candidate (FR-034). All four oracles are inherited from
      `tests/templates/mobile_first_contract_test.ts`; do not re-derive them.
- [x] T018 [US1] Assert that no `AGENTS.md` template copy contains the contract's prose rather than
      a pointer to it (FR-023).

---

## Phase 4 — US2: a reader sees the outcome at a glance (P2)

**Independent test criterion:** the contract states the four-row vocabulary, the rule that selects a
row, the aggregation rule, and the carrier — and each is asserted.

- [x] T019 [US2] Add the badge table to the contract, exactly four rows: 🟢 success · 🔵 information
      · 🟠 warning, still open · 🔴 failure, actual and standing (FR-005). **Home:** this table; no
      per-seat mapping anywhere else.
- [x] T020 [US2] Add the selecting rule: **a badge describes the state at the time of reading, not
      the path taken to reach it.** Found-and-fixed is 🟢 or 🔵, never 🔴 (FR-006).
- [x] T021 [US2] Add the verdict binding so the glyph is not the author's judgement: `fail` → 🔴,
      `needs_followup` → 🟠, `pass` → 🟢, asking `workflow-contract`'s `STATE` and
      `review-findings-contract`'s `REVIEW_VERDICT` rather than re-deciding (FR-028).
- [x] T022 [US2] Add the aggregation rule: **a summary badge is the worst of what it summarises** —
      never the majority, never the last one written (FR-029).
- [x] T023 [US2] Add the requirement that a final report leads with its outcome, legible without
      parsing prose (FR-007).
- [x] T024 [US2] Add the carrier clause — an emoji glyph in Markdown, **never** an ANSI escape
      sequence — with the reason: the glyph is portable across all seven harnesses; terminal colour
      is the harness's business (FR-008).
- [x] T025 [US2] Add the exclusion: badges never enter the fenced machine-readable blocks defined by
      `workflow-contract`, `review-findings-contract`, `qa-report-contract`,
      `alert-triage-contract`, `handoff-protocol` and `status-audit`. A report may carry both
      (FR-010). Verify that list is exhaustive against the tree rather than taking it from
      `plan.md`.
- [x] T026 [US2] Add the portable degradation rule for colour — what the assistant does where even a
      glyph cannot render (FR-009, colour half).
- [x] T027 [US2] Assert T019–T026 by regex in `tests/templates/response_style_contract_test.ts`,
      using the sentence-assertion shape at `tests/templates/mobile_first_contract_test.ts`. The
      four-row table is asserted as four rows, not as "a table exists".

---

## Phase 5 — US3: an existing project receives the contract and keeps its own content (P3)

**Independent test criterion:** `upgrade` grafts the fence into a project installed before this
feature, and no malformed fence state destroys user content.

- [x] T028 [US3] Change `locateBlock` in `src/domain/merge_block.ts` to resolve the **end** fence
      first and walk **back** to the nearest start, stepping over an orphan marker instead of
      opening the span at it (FR-032). **Home:** `merge_block.ts`; never a per-caller guard in
      `upgrade_project.ts`. _Originally written as "reject and append" — non-idempotent, and it
      repairs nothing; see plan § 3, FR-032._ contains a second start fence for the same label,
      falling through to the append path already documented as safe for a malformed pair (FR-032).
      **Home:** `merge_block.ts`; never a per-caller guard in `upgrade_project.ts`.
- [x] T029 [US3] Cover all four fence states in `tests/domain/` — orphan START alone (appends),
      orphan END alone (appends), well-formed block (refreshes), **orphan START above a complete
      block** (must no longer delete the span between them). The fourth is the defect; the other
      three are the regression fence around the fix.
- [x] T030 [US3] Extend `tests/integration/upgrade_managed_section_test.ts` with a graft test for
      the `response-style` label, deriving the expected label set from `templates/manifest.json` so
      a fourth label is covered on arrival.
- [x] T031 [US3] Update `src/domain/merge_block.ts`'s header comment: it documents the orphan case's
      _append_ consequence and says nothing about the over-capture one. The comment is what made the
      defect look considered.

---

## Phase 6 — US4: the rule is stated once, and stays that way (P4)

**Independent test criterion:** a sweep for the selection rule's shape finds one authored statement
and five pointers.

- [x] T032 [US4] Add the selection rule to the contract — a simple selection with a marked default,
      and the portable fallback for harnesses with no native single-select question tool (FR-009,
      selection half). **Home:** the contract; this task creates the single source the next five
      replace.
- [x] T033 [US4] Replace the two restatements in `templates/core/skills/specnaut/phases/plan.md`
      (steps 1 and 8) with pointers (FR-037). Measure `specnaut-plan.md` after the edit — 253
      characters of worst-case headroom, and the swap is predicted near-neutral, not measured.
- [x] T034 [P] [US4] Replace the two restatements in `templates/core/skills/brainstorming/SKILL.md`
      (lines 10 and 83) with pointers (FR-037). Leave the frontmatter `description` alone — routing
      metadata, not a normative statement.
- [x] T035 [P] [US4] Replace the `brainstorming` row's restatement in
      `templates/core/skills/using-specnaut/SKILL.md` with a pointer (FR-037).
- [x] T036 [US4] Mirror every file T033–T035 touched — all three are `SYNC_PAIRS` rows (FR-019).
- [x] T037 [US4] Strengthen the single-source sweep: beyond the contract's own distinctive
      sentences, sweep for the rule's **shape** and require every authored occurrence outside the
      contract to sit within a pointer line (FR-038). As written, SC-002 would have gone green on
      six spellings.

---

## Phase 7 — Polish and cross-cutting

- [x] T038 Assert the contract carries no outward-pointing identifier, reusing the `OUTWARD_SHAPES`
      sweep — as the **second** layer behind FR-027's no-examples precondition, which is what makes
      it sufficient (FR-027, constitution § XI).
- [x] T039 [P] Assert the contract's frontmatter declares no `tools:` or `allowed-tools:` key
      (FR-031).
- [x] T040 Measure every emitted Windsurf workflow at its **worst case across all 32 bundle-option
      combinations** and confirm each is inside `WINDSURF_WORKFLOW_BUDGET_CHARS` (FR-026, FR-036).
      Confirm specifically that `specnaut-plan.md` (253) and `specnaut-using-specnaut.md` (256)
      survive their edits. A single-combination measurement is what hid a 60-character breach.
- [x] T041 Record in `plan.md` § 8 that the delivered contract file is user-writable and `upgrade`
      is its only repair path (FR-033, documentation half).
- [x] T042 **Observe every new assertion red** on the defect it guards — pointer removed, manifest
      entry dropped, mirror desynced, fence declaration deleted, guard reverted (FR-025, AC 11).
      Each mutant must leave a **building** tree: a mutation that fails the bundle validator leaves
      the previous bundle in place and the test then passes for the wrong reason. Restore only the
      mutated file; a blanket `git checkout -- templates/` destroys uncommitted work.
- [x] T043 Add smoke checks to `scripts/smoke/smoke-features.sh` for the contract's presence, its
      frontmatter, and the `response-style` fence in a scaffolded `AGENTS.md`.
- [x] T044 Run `deno task bundle && deno fmt && deno lint && deno task test` and confirm the tree is
      clean afterwards — `deno task test` is `bundle && test` and runs neither `fmt` nor `lint`, and
      `deno fmt` also formats Markdown. A `bundle`/`fmt` disagreement on any new emitted form is a
      red CI run, not a local one.
- [x] T045 Run `deno run --allow-run scripts/check-adoption.ts --from main --to HEAD` before
      landing.
- [x] T046 Run `bash scripts/smoke/audit.sh` before landing. **This task was missing and CI found
      it.** T043 and T044 ran the smoke suite, fmt, lint and the tests; none of them asks whether a
      changed user-visible file has _any_ smoke assertion naming it. `plan-template.md` was edited
      by T033's sweep and no check mentioned it, so `smoke` went red on `main` after the merge. The
      audit is a separate gate from the suite it audits, and running the suite is not running the
      audit.

---

## Dependencies

```
Phase 1 (T001)
  └─ Phase 2 (T002 → T003 → T004)          ← blocks everything
       ├─ Phase 3 · US1  (T005…T018)       ← the MVP
       ├─ Phase 4 · US2  (T019…T027)       depends on T005 (the file's body exists)
       ├─ Phase 5 · US3  (T028…T031)       independent of Phases 3–4 except T030
       └─ Phase 6 · US4  (T032…T037)       depends on T005
            └─ Phase 7   (T038…T046)
```

**US3 is genuinely independent.** T028/T029/T031 touch `merge_block.ts` and its tests only; they can
land while the contract's prose is still being written. Only T030 waits on T009's label declaration.

## Parallel opportunities

- **T008 · T010 · T011** — three different files, no shared state.
- **T034 · T035** — different files.
- **T038 · T039** — different assertions in the same test file; write both, run once.
- **Phase 5 entirely in parallel with Phase 4** — disjoint file sets.

## MVP

**Phases 1–3 (T001–T018).** That delivers the contract, its reach on all seven harnesses, and the
gate that proves it. Phase 4 makes the badges normative, Phase 5 protects existing projects, and
Phase 6 collapses the five spellings — each is a complete increment on top.
