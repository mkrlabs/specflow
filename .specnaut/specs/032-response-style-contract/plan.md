# Plan — Centralize the assistant response-style contract

**Feature:** `032-response-style-contract` **Branch:** `feat/575-response-style-contract` **Backlog
item:**
[#575 — Centralize the assistant response-style contract into one harness-agnostic source referenced by pointer](https://github.com/specnaut/specnaut-cli/issues/575)
**Date:** 2026-08-27

---

## 1. Why this exists

Specnaut ships ~242 files telling the assistant **what to do**. Not one of them says **how to
answer**. Response style is therefore decided by whichever harness and model happen to be driving,
and the observed failure is verbose, repetitive output — long tirades where a table and three lines
would do.

Two measurements frame the work.

**Nothing occupies this ground today.** A sweep of `templates/` for
`concise|be brief|no preamble|verbose` returns eight hits, all of them either security
knowledge-base prose about verbose _error output_ or the two harness loop/goal files saying
"summarize it concisely" about a grooming pass. There is no response-style contract to collide with.
The contract **establishes** this vocabulary rather than reconciling two.

**One rule is already spelled five times.** "Ask one question at a time, with real options" appears
in `templates/core/skills/specnaut/phases/plan.md` twice (steps 1 and 8), in
`templates/core/skills/brainstorming/SKILL.md` **twice** (line 10 and line 83), and as a row in the
`templates/core/skills/using-specnaut/SKILL.md` table — plus a sixth occurrence in `brainstorming`'s
own frontmatter `description`. Five authored normative spellings of one rule, none pointing at
another, which is the defect this feature exists to stop reproducing, and it is already here.

_An earlier revision of this paragraph said four. The architecture audit counted five and the count
was re-measured: it is five. The number matters, because § 12's Q2 is a decision about exactly this
set._

The second measurement is the reason the decision table in § 5 is not ceremony.

---

## 2. User scenarios

### P1 — A user gets the same interaction quality from any harness

**Given** a project scaffolded with `specnaut init --ai <any of the seven>`, **when** the assistant
answers any turn — including one where no skill fires and no agent is dispatched — **then** the
response-style contract is in force for that turn.

**Given** the same project on Copilot or OpenCode, which ship no always-on context file, **when**
the assistant reads `AGENTS.md`, **then** it reaches the contract through the managed
`response-style` fence.

### P2 — A reader sees the outcome of a report at a glance

**Given** a piece of work that found three defects and fixed all three, **when** the final report is
rendered, **then** the badges read 🟢/🔵 and the report leads with its outcome — not 🔴 three times,
which is what happens today and which reads at a glance as three standing failures.

### P3 — An existing project receives a revision to the contract

**Given** a project installed before this feature, **when** it runs `specnaut upgrade`, **then** the
contract file and the `response-style` fence are grafted — the fence through
`managedSectionEntries`, which writes with `{ overwrite: true }` independently of `AGENTS.md`'s
`skipIfExists` guard.

### P4 — A maintainer revises the contract

**Given** the contract is authored in one file, **when** a rule changes, **then** exactly one file
is edited and every surface follows, because every surface points rather than restates.

### Edge cases

- **A harness strips `skills:` frontmatter.** Copilot, Codex and OpenCode rebuild agent frontmatter.
  The secondary leg silently vanishes there; the primary leg must not depend on it.
- **A surface points at a contract the project never received.** A pointer that resolves to nothing
  is worse than no pointer — it reads as wired.
- **The narrowest Windsurf workflow has 22 characters of headroom.** See § 6.
- **A badge inside a fenced machine-readable block.** `WORKFLOW STATUS`, `REVIEW SUMMARY`,
  `QA SUMMARY`, `HANDOFF` and the alert-triage block are parsed on fixed keys. A glyph there is a
  parse hazard, not a legibility win.

---

## 3. Requirements

### The contract file

- **FR-001** — The contract is exactly ONE authored file:
  `templates/core/skills/response-style-contract/SKILL.md`, frontmatter `user-invocable: false`,
  matching the shape of `backlog-reference-contract` and `mobile-first-contract`.
- **FR-002** — It is registered in `templates/manifest.json` under `category: "skill"`.
- **FR-003** — It is mirrored to `plugin/skills/response-style-contract/SKILL.md` and that pair is
  added to `SYNC_PAIRS` in `tests/plugin/plugin_sync_test.ts`. It is **not** mirrored to
  `.codex-plugin/` or `.cursor-plugin/` — verified at `2a28455`, those hold a `plugin.json` each and
  no skills tree.
- **FR-004** — The contract states, in its own text: be concise, no repetition; prefer visually
  ordered output and a table where a table fits; go step by step; explain technical topics as simply
  as possible unless the user asks for depth.
- **FR-005** — It states the badge colour semantics as a table of exactly four rows: 🟢 success · 🔵
  information · 🟠 warning, still open · 🔴 failure, actual and standing.
- **FR-006** — It states the rule that decides the row: **a badge describes the state at the time of
  reading, not the path taken to reach it.** Found-and-fixed is 🟢 or 🔵, never 🔴.
- **FR-007** — It requires a final report to lead with its outcome, legible without parsing prose.
- **FR-008** — It states that the carrier is an **emoji glyph in Markdown, never an ANSI escape
  sequence**, and says why: the glyph is portable across all seven harnesses; terminal colour is the
  harness's business.
- **FR-009** — It states the portable degradation rules — for colour, where even a glyph cannot
  render; and for selection, where the harness has no native single-select question tool (a short
  numbered list with a marked default).
- **FR-010** — It states that badges are for prose and rendered report surfaces and **never enter**
  the fenced machine-readable blocks defined by `workflow-contract`, `review-findings-contract`,
  `qa-report-contract`, `alert-triage-contract`, `handoff-protocol` and `status-audit`. A report may
  carry both.
- **FR-011** — It declares no numeric values, no harness names as requirements, and no vendor API —
  the same self-denying clause `mobile-first-contract` carries.
- **FR-012** — It carries a scope-limiting sentence: it declares obligations about output shape and
  confers no authority to run commands, read credentials, or act outside the answer at hand.

### The primary leg — always-on reach

- **FR-013** — Each of the three always-on context files gains the pointer line, in the established
  verbatim form: `templates/harness-specific/claude/CLAUDE.md`,
  `templates/harness-specific/codex/AGENTS.md`,
  `templates/harness-specific/cursor/specify-rules.mdc`.
- **FR-014** — `templates/core/root/AGENTS.md` gains a **second managed section**, labelled
  `response-style`, carrying a pointer and nothing else. The label is declared in
  **`templates/manifest.json`** — the authored home — and regenerated into `src/templates_bundle.ts`
  by `deno task bundle`. The bundle is **never hand-edited**: its own header says so, and an earlier
  revision of this FR instructed editing both, which is either a discarded edit or two homes for one
  decision.
- **FR-015** — `templates/core/skills/using-specnaut/SKILL.md` gains a pointer row. This is the
  on-demand route for `copilot` and `opencode`, whose only `HARNESS_STATIC` entry is
  `.specnaut/harness-tools.md`.
- **FR-016** — The two anchor surfaces named on the ticket gain a pointer:
  `templates/core/skills/board/SKILL.md` and `templates/core/skills/specnaut/SKILL.md`.

### The secondary leg — dispatched subagents

- **FR-017** — `response-style-contract` is added to the `skills:` frontmatter of **every** agent
  definition under `templates/core/agents/` — all 15, the set
  `CORE_BUNDLE.filter((e) => e.category === "agent")`, with no qualifier. An earlier revision said
  "every agent that emits a report or a question to the user". That qualifier narrowed nothing —
  measured, all 15 qualify — while creating a membership criterion stated only in prose, which
  FR-021's derived oracle would then have asserted against itself. A universal contract has no
  membership question.
- **FR-018** — `templates/core/agents/devops-sre.md` has **no** `skills:` line today; it gains one.
- **FR-019** — Every edited file that `SYNC_PAIRS` governs is mirrored byte-identically. That is
  **19** files, not 15: the 15 agents, the new contract, **and the three skills FR-015/FR-016 edit**
  — `using-specnaut/SKILL.md`, `board/SKILL.md` and `specnaut/SKILL.md` are all `SYNC_PAIRS` rows.
  An earlier revision said "every _agent_ edit", under-counting the mirror surface by three.

### Forced by the architecture audit (§ 10)

- **FR-034** — The set of surfaces that must carry the pointer is **derived, not hand listed.**
  Candidates are every `CORE_BUNDLE` entry that is an always-on destination, a documented anchor, or
  the root `AGENTS.md` fence; a non-member carries a **written reason**, and an empty reason is not
  an exclusion. A staleness assertion fails when an exclusion names something that is no longer a
  candidate — otherwise a carve-out outlives its subject, which the precedent has already
  demonstrated once.
- **FR-035** — The per-harness reach of the **secondary** leg is asserted and its asymmetry
  recorded: `skills:` survives on `claude`, `cursor`, `windsurf` and `antigravity` and is discarded
  by `codex`, `copilot` and `opencode`. Measured: **50 of 110** emitted agent renders drop it. The
  assertion exists so the number is a fact in the suite rather than a sentence in a plan.
- **FR-036** — Every emitted Windsurf workflow is measured at its **worst case across every
  bundle-option combination**, not at one. See § 6 — a single-combination measurement is what made
  an earlier revision of this plan report `specnaut-board.md` as having 845 characters to spare when
  its worst case is 38.

- **FR-037 — settled at the stop (Q2, 2026-08-27).** The **five** existing authored spellings of
  "ask one question at a time, with real options" are **replaced by pointers** to this contract:
  `templates/core/skills/specnaut/phases/plan.md` (steps 1 and 8),
  `templates/core/skills/brainstorming/SKILL.md` (lines 10 and 83), and the `brainstorming` row in
  `templates/core/skills/using-specnaut/SKILL.md`. `brainstorming`'s frontmatter `description` is a
  **sixth** occurrence and is left alone — it is discovery metadata a harness reads to route, not a
  normative statement of the rule, and stripping it would make the skill harder to find for no gain.
  Replacing a restatement with a pointer is the narrowest reading of what #575 permits ("inserting
  the pointer reference"), and it is what AC 2 requires as a hard prescription. Without it this
  feature ships a sixth spelling with five silent siblings, which § 1 calls the defect it exists to
  stop.
- **FR-038** — SC-002 is strengthened to match. As written it asks whether the **contract's own
  distinctive sentences** appear once, which would have stayed green on six spellings of a rule the
  contract owns. The assertion additionally sweeps for the rule's _shape_ — the phrase "one question
  at a time" and its variants — and requires every authored occurrence outside the contract to sit
  within a pointer line.

### Forced by the security audit (§ 11)

- **FR-027** — **The contract carries no illustrative example that names anything.** Where a shape
  must be demonstrated, it is demonstrated with metasyntactic placeholders. This is the
  _precondition_ #576 relied on, not an extra: its FR-013 said the same, and the sweep in
  `tests/templates/mobile_first_contract_test.ts` is sufficient there only because "a contract with
  no URL, no domain, no handle and no address has nowhere to carry one." § 7 of this plan had
  dropped the precondition and kept the instrument.
- **FR-028** — The badge glyph is **bound to a verdict already computed elsewhere**, not to the
  author's judgement: `fail` → 🔴, `needs_followup` → 🟠, `pass` → 🟢. The deciders are
  `workflow-contract`'s `STATE` and `review-findings-contract`'s `REVIEW_VERDICT`; this contract
  asks them and does not re-decide.
- **FR-029** — **A summary badge is the worst of what it summarises** — never the majority, never
  the last one written. Without this, a report may honestly badge four fixed defects 🟢, lead 🟢,
  and carry one 🔴 three sections down.
- **FR-030** — Brevity **removes restatement, never substance**: never a finding, a required field,
  a constraint enumeration, or a required block. Where this contract and a block-defining contract
  disagree, **the block-defining contract wins.** The contract states this precedence in its own
  text.
- **FR-031** — The contract's frontmatter declares no `tools:` or `allowed-tools:` key, and an
  assertion keeps that closed by construction. Currently true of every skill in
  `templates/core/skills/`; FR-018 wires this contract into `devops-sre`, the broadest seat in the
  set (`Write, Edit, Bash`, `permissionMode: acceptEdits`).
- **FR-032** — `locateBlock` in `src/domain/merge_block.ts` resolves the **end** fence first and
  walks **back** to the nearest start, so an orphan marker above a real block is stepped over rather
  than treated as the block's opening. Covered by tests for the four fence states in § 11 (F3).

  **Rewritten after implementation, and the earlier text is recorded because restoring it would be a
  regression.** It prescribed _reject the span and fall through to append_. Append is
  non-destructive but **not idempotent**: the orphan is still the first start on the next run, so
  every `upgrade` would add one more block, forever — and it would repair nothing, leaving the real
  block untouched beside a growing pile. The review measured the delivered walk-back as strictly
  non-widening (`realStart >= startIdx`) across 182,862 random fence arrangements with zero
  regressions, and confirmed it cannot cross into a neighbouring label's block. The specification
  was wrong and the code is right; the specification is what changed.
- **FR-033** — § 8 records that the delivered contract file is user-writable and that `upgrade` is
  its only repair path, and the contract states in its own text that a modified copy is the
  project's, not Specnaut's.

### Gates

- **FR-020** — Delivery is asserted apart from reference: for each of the seven harnesses,
  `mapBundle` must both write the contract file **and** carry the pointer. The delivery probe keys
  on a sentence from the contract **body**, not its frontmatter — `copilot_harness.ts` substitutes
  `applyTo: "**"` and `codex`/`opencode` rebuild frontmatter from other fields, so a probe keyed on
  `name:` reports three harnesses as not delivering a file they do deliver.
- **FR-021** — Every gate derives its expectation from a source the implementation edits —
  `alwaysOn` in the manifest, `HARNESS_STATIC`, the entry's declared `managedSection`, the agents'
  own frontmatter — never from a hand-written list restated in the test.
- **FR-022** — Each route is asserted **alone**. A test that passes when _either_ the fence or the
  context file carries the pointer decides nothing; that exact hole was observed and fixed in
  `tests/templates/mobile_first_reach_test.ts`.
- **FR-023** — A mechanical assertion rejects an `AGENTS.md` template copy that contains the
  contract's prose rather than a pointer to it.
- **FR-024** — The `response-style` fence is asserted to be **declared** on the entry that ships it.
  `managedSectionEntries` grafts only declared labels; a fence present in the content but undeclared
  reaches new projects and no existing one, silently.
- **FR-025** — Every new assertion is observed **red** on the defect it guards — pointer removed,
  manifest entry dropped, mirror desynced, fence declaration deleted — with a **live** mutant: the
  mutated tree must still build, or the bundle stays stale and the test reads the previous bundle
  and passes for the wrong reason.
- **FR-026** — Every emitted Windsurf workflow stays under `WINDSURF_WORKFLOW_BUDGET_CHARS`. See § 6
  — one agent does not fit as things stand.

---

## 4. Success criteria

- **SC-001** — On every one of the seven harnesses, a freshly scaffolded project both receives the
  contract file and reaches it by pointer from at least one surface that is in force without
  invocation.
- **SC-002** — The contract's prose exists in exactly one authored file; a full-tree search for any
  distinctive sentence of it returns that file and its mirror, nothing else.
- **SC-003** — An existing project that runs `upgrade` gains the `response-style` fence in
  `AGENTS.md` without its own content being overwritten.
- **SC-004** — Deleting any single pointer turns the suite red, and this was observed rather than
  assumed.
- **SC-005** — Removing the manifest registration turns the suite red.
- **SC-006** — Desyncing the plugin mirror turns the suite red.
- **SC-007** — The whole suite passes with every emitted Windsurf workflow inside budget **at its
  worst case across all 32 bundle-option combinations**, on a tree where the bundle was regenerated.
  Measured at one combination is how the 60-character breach on `specnaut-board.md` stayed
  invisible.
- **SC-008** — A reader shown a final report of successful work sees success at first glance, with
  no 🔴 on anything that is not failing now.

---

## 5. 🔒 The decision table

| The decision                                                               | Its single home                                                                                                                                                                                            | What would duplicate it                                                                                                                      |
| :------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------- |
| Be concise; no repetition; step by step; simple language by default        | `templates/core/skills/response-style-contract/SKILL.md`                                                                                                                                                   | Any "be brief" / "avoid preamble" sentence added to a phase doc, an agent, `AGENTS.md`, or a harness context file                            |
| The four badge colours and what each means                                 | same file, § badge table                                                                                                                                                                                   | A second colour list in a report template, a phase doc's output format, or a review-findings block                                           |
| A badge describes the end state, not the journey                           | same file                                                                                                                                                                                                  | A per-phase rule about when to use 🔴; an agent told separately "don't badge a fixed defect red"                                             |
| The carrier is an emoji glyph, never ANSI                                  | same file                                                                                                                                                                                                  | Any escape-code example anywhere; a harness adapter emitting colour                                                                          |
| A final report leads with its outcome                                      | same file                                                                                                                                                                                                  | A "summary first" instruction restated in `merge.md`, `review.md`, or `qa-report-contract`                                                   |
| How a question is put to the user (selection, marked default, degradation) | same file                                                                                                                                                                                                  | `phases/plan.md` steps 1 and 8, `brainstorming/SKILL.md`, the `using-specnaut` table row — **all four already exist**; see Q2                |
| Badges never enter a fenced machine-readable block                         | same file, § exclusion                                                                                                                                                                                     | A "no emoji" line added to each of the six block-defining contracts                                                                          |
| **Which surfaces must carry the pointer**                                  | a **derivation** over `CORE_BUNDLE` (always-on destination, documented anchor, or the root fence) plus an exclusion file where every entry states a reason                                                 | A positive hand list of file paths in requirement prose — which can only be wrong in one direction, and says nothing about a twelfth surface |
| Whether an authored template is visible to users at all                    | `templates/manifest.json`                                                                                                                                                                                  | A file added under `templates/core/` that nothing registers, shipped to nobody                                                               |
| Whether the contract is value-free and harness-agnostic                    | the assertion in the contract's test file — **prose does not bind; the assertion decides**                                                                                                                 | The self-denying clause stated only in the contract's own text                                                                               |
| Whether the contract is invocable                                          | `user-invocable: false` in its frontmatter, asserted                                                                                                                                                       | A skill listed in a router's phase index by accident                                                                                         |
| Whether a new assertion may be accepted                                    | the **commit body** — the honest home; no automated one exists                                                                                                                                             | A reviewer's memory that the mutant was run                                                                                                  |
| Which harnesses have an always-on context surface                          | `templates/manifest.json` — the `alwaysOn` flag on `harness_static`                                                                                                                                        | A hand-written harness list inside a test, which is the shape that reports clean on whatever somebody remembered to list                     |
| Which agents must honour the contract                                      | the agents' own `skills:` frontmatter                                                                                                                                                                      | A parallel array of agent names in the test file                                                                                             |
| Which files are mirrors of which                                           | `SYNC_PAIRS` in `tests/plugin/plugin_sync_test.ts`                                                                                                                                                         | A second mirror list in a smoke script                                                                                                       |
| Which glyph a given verdict earns                                          | `templates/core/skills/response-style-contract/SKILL.md`, § badge table — asking `REVIEW_VERDICT` / `STATE`, not re-deciding                                                                               | A per-seat mapping of severity to glyph in each agent definition                                                                             |
| Brevity never removes substance; block-defining contracts win a conflict   | same file, § precedence                                                                                                                                                                                    | A "but keep findings complete" caveat added to each of the six block-defining contracts                                                      |
| A malformed fence must not delete user content                             | `src/domain/merge_block.ts` — `locateBlock`                                                                                                                                                                | A per-caller guard in `upgrade_project.ts`, or a check in each template that declares a `managedSection`                                     |
| Whether `AGENTS.md` may hold the content                                   | `templates/manifest.json` — the `skipIfExists` + `managedSection` declaration on the `project-root` `AGENTS.md` entry. **Not `src/templates_bundle.ts`**, which is generated and says so in its own header | A prose rule in a doc saying "don't put it here", with nothing checking                                                                      |

**Two askers, one decider.** The primary leg (context files + fence) and the secondary leg
(`skills:` preload) both _ask_ the contract. Neither restates it. That is two askers and one
decider, which is the permitted shape.

---

## 6. Technical context

**Language / runtime.** TypeScript on Deno. `deno task test` is `bundle && test` — it regenerates
`src/templates_bundle.ts` and does **not** run `fmt` or `lint`. Landing requires `deno fmt` and
`deno lint` separately, and `deno fmt` formats Markdown.

**The mechanism is not new.** #576 shipped this exact dual-leg shape one commit ago: one authored
contract under `templates/core/skills/`, a pointer on the three always-on context files, a managed
`ui-defaults` fence in `AGENTS.md` for the other four harnesses, `skills:` preload on the agents
that need it, and `tests/templates/mobile_first_reach_test.ts` as the reach gate. This feature ships
**no new mechanism** — it is the second instance, and the reach test is the template for its own.

**Managed sections are the only route to existing projects.** `applyManagedSections` /
`managedSectionEntries` in `src/application/upgrade_project.ts` write with `{ overwrite: true }`,
independently of `computeUpgradePlan`'s `skipIfExists` guard, and report an `"added"` outcome for an
existing file lacking the fence. `AGENTS.md` is a `skipIfExists` destination, so its pointer _line_
reaches new projects only; its _fence_ reaches everyone. The entry's `managedSection` field already
accepts `string | readonly string[]` (widened in #576, with `managedSectionLabels` in
`src/domain/template.ts` as the single normaliser) — so declaring a third label needs no type
change.

### 🔴 The Windsurf budget binds on TWO files, and one of them cannot be paid

Measured at `2a28455` against `WINDSURF_WORKFLOW_BUDGET_CHARS` = 11,700
(`WINDSURF_WORKFLOW_MAX_CHARS` 12,000 − `WINDSURF_WORKFLOW_RESERVE_CHARS` 300), taking the **worst
case of each workflow across all 32 bundle-option combinations** — backlog backend × version scheme
× spec backend × autogen:

| Emitted workflow                      | Worst-case headroom | What this feature adds           |
| :------------------------------------ | ------------------: | :------------------------------- |
| `specnaut-agent-dependency-expert.md` |              **22** | FR-017 · **+25** → 🔴 over by 3  |
| `specnaut-board.md`                   |              **38** | FR-016 · **+98** → 🔴 over by 60 |
| `specnaut-agent-ui-ux-designer.md`    |                  80 | FR-017 · +25 → 🟢 55 left        |
| `specnaut-implement.md`               |                 149 | nothing                          |
| `specnaut-agent-product-owner.md`     |                 169 | FR-017 · +25 → 🟢 144 left       |
| `specnaut-plan.md`                    |                 253 | nothing                          |
| `specnaut-using-specnaut.md`          |                 256 | FR-015 · +98 → 🟢 158 left       |
| the other 57 workflows                |               ≥ 845 | —                                |

**An earlier revision of this section reported only the first, and reported `specnaut-board.md` as
having ≥ 845 to spare.** It measured **one** option combination — `backlog=local` — and generalised.
That combination is the widest possible margin for this particular file: `specnaut-board.md` renders
at 4,898 with `backlog=local`, at 268 with `backlog=github`, and at **38** with `backlog=github` +
`spec=cloud` + `autogen=true`. The escalated breach was the 3-character one; the 60-character one
sat in the untested part of the surface. FR-036 exists so this is measured rather than sampled.

The pointer line measures **96 code points**, 98 with its blank line — against 102 for the shipped
`backlog-reference-contract` form. `board/SKILL.md` already carries that one, so it is being asked
to hold a second pointer with 38 characters left.

Windsurf passes agent frontmatter through, stripping only `color:`, so `skills:` is charged in full.

**Neither breach has an editorial fix.** Three characters can be trimmed from `dependency-expert`;
sixty cannot be trimmed from `board/SKILL.md` without reclaiming content for text unrelated to it —
which is precisely what the 300-character reserve was introduced to stop. This is **Q1** at the
stop, and it is one question about mechanism, not two about wording.

**An emoji costs one character here, not two.** The gate measures with `workflowLength`, which
counts code points (`[...content].length`); the doc comment on `WINDSURF_WORKFLOW_MAX_CHARS` saying
"any emoji costs 2" describes UTF-16 `String.length` and is not the measure applied.
`assertEquals(workflowLength("👋"), 1)` is asserted directly in that test file. A four-row badge
table spends four characters of glyph. Do not trim content to pay a cost that is not charged.

### What this feature inherits from #576, and what it does not

"Second instance of the same mechanism" is true of the **packaging** and was false of the **gates**
until the architecture audit said so. Stated explicitly, per finding A4:

| #576's oracle                                                            | Inherited?               |
| :----------------------------------------------------------------------- | :----------------------- |
| `FE_VOCAB` — derive candidates from **content**, independent of the edit | **Yes** — FR-034         |
| `EXCLUSIONS` — every non-member carries a written reason                 | **Yes** — FR-034         |
| `POINTED_BY_DECISION` — reverse check on members outside the derivation  | **Yes** — FR-034         |
| staleness — an exclusion naming a non-candidate fails                    | **Yes** — FR-034         |
| per-harness reach asserted separately from shape                         | **Yes** — FR-020, FR-035 |

Those four cost #576 three fix rounds (`3fa4a98`, `a06278e`, `732c657`) to arrive at. Inheriting the
packaging and re-deriving the gates is how the same three rounds get paid twice.

**Blast radius, after the stop.** The architecture audit counted the pre-stop plan at **≈46 authored
files** and **110** emitted agent renders. Q1's withdrawal of the secondary leg removes 15 agents,
15 agent mirrors and every agent render from that total. What remains:

| Group                                                                          |   Files |
| :----------------------------------------------------------------------------- | ------: |
| The contract + its `plugin/` mirror                                            |       2 |
| `templates/manifest.json` (registration + the third `managedSection` label)    |       1 |
| The three always-on harness context files                                      |       3 |
| `templates/core/root/AGENTS.md` (the `response-style` fence)                   |       1 |
| Pointer surfaces: `using-specnaut`, `specnaut/SKILL.md`                        |       2 |
| FR-037's five restatements → pointers (2 files, one shared with the row above) |       2 |
| `SYNC_PAIRS` + `merge_block.ts` (FR-032) + the new tests                       |      ~4 |
| Regenerated `src/templates_bundle.ts`                                          |       1 |
| Mirrors for the edited skills                                                  |       4 |
| **Total**                                                                      | **≈20** |

**Domain model.** No new entities. One new `CoreEntry` of `category: "skill"`, one new
managed-section label on an existing entry, one guard in `merge_block.ts`, and additions to two
existing enumerations (`SYNC_PAIRS`, the manifest).

---

## 7. Constitution check

Against `.specnaut/memory/constitution.md` at the monorepo root.

| Principle                                       | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| :---------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I — OSS / proprietary boundary**              | 🟢 Pass. Nothing from the private half enters. The contract names no identifier from anywhere.                                                                                                                                                                                                                                                                                                                                                                                                |
| **II — the single bridge is the HTTP contract** | 🟢 Not engaged. No network surface.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **III — the monorepo holds no product code**    | 🟢 Pass. Every file lands inside `apps/specnaut-cli/`; the root gets a pointer bump only.                                                                                                                                                                                                                                                                                                                                                                                                     |
| **IV — cross-cutting change discipline**        | 🟢 Pass. One CLI commit, one pointer commit, submodule pushed first.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **V — merge defaults, local in every half**     | 🟢 Pass. Branch, squash by scope, `scripts/land.sh cli <branch>`. No PR.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **VI — centralised backlog routing**            | 🟢 Pass. The card move and the close go through the `product-owner`; no inline `gh issue` calls.                                                                                                                                                                                                                                                                                                                                                                                              |
| **VII — submodule autonomy**                    | 🟢 Pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **VIII — documentation conventions**            | 🟢 Pass, and load-bearing here. The contract pins no version, date, count or milestone. § 6 above pins measurements to a SHA and says they drift — which is the permitted form.                                                                                                                                                                                                                                                                                                               |
| **IX — dogfooding**                             | 🟢 Pass, and this is the feature's own test: the workspace's `.claude/CLAUDE.md` is a scaffolded surface, so the contract governs this session's answers too.                                                                                                                                                                                                                                                                                                                                 |
| **X — epic status mirrors child progress**      | 🟢 Not engaged. #575 has no children.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **XI — consumer agnosticism (NON-NEGOTIABLE)**  | 🟢 Pass **as amended**. This row originally permitted illustrative examples "invented and attributed to nothing", guarded by the `OUTWARD_SHAPES` sweep. The security audit showed that borrows #576's instrument without its precondition — the sweep is a deny-list over an open set, and it is sufficient there only because that contract carries **no examples at all**. FR-027 restores the precondition: no example names anything. The sweep stays as the second layer. See § 11, F1. |

No entry for Complexity Tracking.

---

## 8. Surface impact

**Client surfaces touched:** the scaffolded project tree, on all seven harnesses. No CLI command,
flag, exit code, or on-disk format changes. `specnaut upgrade` gains one managed-section label to
graft; the upgrade report gains one more `added` line.

**Interface contracts exposed:**

| Contract                   | Shape                                                                                                                                                             |
| :------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The pointer line           | verbatim, one line, the form `backlog-reference-contract` established                                                                                             |
| The `response-style` fence | `<!-- --- Specnaut: response-style --- -->` … `<!-- --- End Specnaut: response-style --- -->`, parsed by `extractBlock(content, "response-style", "html")`        |
| `skills:` frontmatter      | comma-separated skill names; honoured by Claude Code, passed through textually by `windsurf`/`cursor`/`antigravity`, rebuilt away by `codex`/`opencode`/`copilot` |
| The badge vocabulary       | four glyphs, four meanings, stated once                                                                                                                           |

**Front-end / UX-UI:** the `accessibility-expert` FE-surface signals find no front-end surface in
this repository — it is a Deno CLI with no web, mobile or native UI. No
`Visual Prototyping with Claude Artifacts` subsection applies, and per the phase rule this plan does
not mention artifacts further.

**The delivered file is writable, and `upgrade` is its only repair path.** The contract lands in the
project's own tree, so anyone who can commit there can edit an instruction file that is preloaded on
every turn. The ordinary upgrade path self-heals by overwriting it from the bundle — that is a real
compensating control. The residual is the preserve interaction: a project that declares the contract
path preserved has it skipped by both the plan writes and `applyManagedSections`, and the report
prints `preserved … declared`, which reads as intentional. Recorded rather than fixed; the preserve
mechanism is correct.

**Surfaces deliberately NOT touched:**

- `.codex-plugin/` and `.cursor-plugin/` — a `plugin.json` each, no skills tree.
- The six fenced machine-readable block vocabularies — excluded by FR-010.
- The "no leading emoji" rule for issue titles in `board/SKILL.md` — that governs a persisted
  tracker artefact; FR-005 governs a rendered report. Verified at `2a28455`, those are the only two
  occurrences of the word "emoji" in `templates/`.
- The harnesses with no always-on context file — AC 9 requires the gap be **named**, not closed.

---

## 9. Risks

| Risk                                                             | Mitigation                                                                                                                                                                                                                                                       |
| :--------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🟠 `dependency-expert` blows the Windsurf budget by 3 characters | Q1 at the stop. Recommended: trim the agent's duplication before its content, per the standing rule for this cap. 22 characters of headroom is a latent failure independent of this feature.                                                                     |
| 🔴 The reach gate passes for the wrong reason                    | Exactly what happened in #576, twice. FR-022 (assert each route alone) and FR-025 (live mutant) are the direct countermeasures, and both are lifted from the fix.                                                                                                |
| 🟠 A dead mutant during FR-025                                   | Deleting a fence while its label stays declared fails the bundle validator → the bundle stays stale → the test reads the previous bundle and passes. The probe harness must refuse to read a non-zero build as a result, and must restore only the mutated file. |
| 🟠 The contract drifts into restatement                          | FR-023's assertion, plus the Windsurf budget itself: a restatement blows it on the files nearest it.                                                                                                                                                             |
| 🟠 Someone adds the content to `AGENTS.md` later                 | FR-023 rejects it mechanically.                                                                                                                                                                                                                                  |
| 🟠 § XI leak through an illustrative example                     | Sweep for outward shapes, per § 7. Examples invented, attributed to nothing.                                                                                                                                                                                     |
| 🔵 `bundle` and `fmt` disagree on a new emitted form             | Observed on #576's array form. Run `deno task bundle && deno fmt && git diff --exit-code` before landing.                                                                                                                                                        |
| 🔵 A pointer resolves to a file the harness never wrote          | FR-020 asserts delivery apart from reference.                                                                                                                                                                                                                    |

---

## 10. Architecture audit

`architect-expert`, dispatched at step 6 against `plan.md`. Verdict **fail** (advisory): **1
CRITICAL · 3 HIGH · 4 MEDIUM · 3 LOW**. Every finding is accepted and the plan changed; none was
argued down.

**Coverage.** The seat read the plan, #575 in full, the whole of precedent 031, all of `SYNC_PAIRS`
and both its completeness sweeps, `windsurf_harness.ts` and its test, `upgrade_project.ts`, the
manifest's `project-root` entry, the bundle header, the root `AGENTS.md`, the three harness context
files, and all 15 agents' `skills:` lines. It **re-derived** the Windsurf table itself rather than
trusting § 6. It states plainly what it did **not** check: it did not run `deno task test`, did not
verify FR-020's `BODY_MARKER` reasoning beyond counting `skills:` survival, and took FR-010's list
of six block-defining contracts on the plan's word.

| #   | Severity    | Finding                                                                                                | Disposition                                                                        |
| :-- | :---------- | :----------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------- |
| A1  | 🔴 CRITICAL | § 6's headroom table was measured on one bundle-option combination and hides a 60-character breach     | **Plan changed** — § 6 rewritten, FR-036, Q1 reframed. **Verified independently.** |
| A2  | 🟠 HIGH     | No decision-table row for _which surfaces carry the pointer_ — FR-013…FR-016 were a positive hand list | **Plan changed** — new § 5 row, FR-034                                             |
| A3  | 🟠 HIGH     | R9's home made the membership gate assert `X == X`                                                     | **Plan changed** — FR-017's qualifier deleted                                      |
| A4  | 🟠 HIGH     | "Second instance of #576" inherited the packaging and dropped all four of its oracles                  | **Plan changed** — § 6 inheritance table                                           |
| A5  | 🟠 MEDIUM   | R11 named a generated file as a home; FR-014 instructed editing it                                     | **Plan changed** — home re-based on the manifest                                   |
| A6  | 🟠 MEDIUM   | FR-002 and FR-011 had no row                                                                           | **Plan changed** — two rows added                                                  |
| A7  | 🟠 MEDIUM   | FR-019 under-counted the mirror set by three                                                           | **Plan changed** — 19, not 15                                                      |
| A8  | 🟠 MEDIUM   | The secondary leg is inert on 3 of 7 harnesses and no FR recorded it                                   | **Plan changed** — FR-035                                                          |
| A9  | 🔵 LOW      | "Already spelled four times" is five                                                                   | **Plan changed** — § 1 corrected. **Verified.**                                    |
| A10 | 🔵 LOW      | FR-025's live-mutant rule had no home                                                                  | **Plan changed** — row added                                                       |
| A11 | 🔵 LOW      | FR-001's `user-invocable: false` and FR-012's scope clause were unhomed                                | **Plan changed** — rows added                                                      |

### A1 — the truncated measurement (CRITICAL). Independently verified; the seat was right and this plan was wrong.

Re-derived here rather than relayed, because the claim contradicted a table already in this
document. Both are now measured:

| `specnaut-board.md` rendered with                         | Headroom |
| :-------------------------------------------------------- | -------: |
| `backlog=local` — the combination § 6 originally measured |    4,898 |
| `backlog=github`                                          |      268 |
| **`backlog=github` + `spec=cloud` + `autogen=true`**      |   **38** |

FR-016 puts a 98-code-point pointer into `board/SKILL.md`. **Over by 60** — twenty times the breach
that was escalated, on the file the plan had cleared with "≥ 845".

The failure was not arithmetic. It was sampling: the measurement was aimed at the files expected to
be tight rather than swept across the requirement set and the option space. A guard blind to part of
its surface reports clean about the part it never read, and this one reported clean about the only
file with no editorial fix. FR-036 closes the method; § 6 carries the corrected table; Q1 is
re-framed around both breaches as one question.

### A2 — the missing row (HIGH). Accepted.

FR-013 through FR-016 named eleven surfaces by hand across four bullets, and § 5 had rows for _which
harnesses_ and _which agents_ but none for _which surfaces_. A positive membership list in
requirement prose can only be wrong in one direction, and the precedent already shows the fossil:
031's own audit found `CHANNEL_B_CORE` still carving out `specify.md`, a phase doc deleted two
releases earlier — the justification outlived the file and nothing went red, because a positive list
has nothing to say about a member that no longer exists. 031 § 5 has this row precisely because its
audit removed the list that preceded it; this plan reintroduced the list _and_ dropped the row
recording why. Closed by FR-034 and a new § 5 row.

### A3 — the tautological gate (HIGH). Accepted, and the fix makes the plan simpler.

R9 named the agents' own `skills:` frontmatter as the home for _which agents must honour the
contract_, while FR-017 stated the criterion — "every agent that emits a report or a question to the
user" — in prose only. FR-021 then required the gate to derive from a source the implementation
edits. For a **reach** assertion that is exactly right. For a **membership** assertion it asserts
`X == X`: an agent the implementer forgets is absent from the derived set, so it is never expected,
so nothing goes red — not on the day it is forgotten, and not ever.

The clean answer is smaller than the precedent's, not larger: a _response-style_ contract has no
membership question. Every seat answers a human. The set is `category === "agent"` — all 15, one
expression, unstaleable, no exclusion list to fossilise. FR-017's qualifier bought nothing and cost
an unhomeable decision. Deleted.

### A4 — the inheritance claim (HIGH). Accepted.

§ 6 claimed "no new mechanism — this is the second instance". True of the packaging; false of the
gates, which is where #576 actually spent its three fix rounds. § 6 now carries an explicit
inheritance table naming each of the four oracles and confirming this feature takes all four. "Same
shape" is not a design until it names what it copies.

### A5–A8 (MEDIUM). All accepted, one line each.

R11's home moved to `templates/manifest.json` and FR-014 reworded — `src/templates_bundle.ts` is
generated and says so in its own first line, so an instruction to edit both is either a discarded
edit or two homes for one decision. Rows added for FR-002 and FR-011, the latter carrying the
precedent's own lesson that a self-denying clause in prose binds nothing and the assertion is its
decider. FR-019 corrected from 15 mirrored files to 19. FR-035 added, so the 3-of-7 asymmetry is a
fact in the suite rather than a sentence in a plan.

### A9–A11 (LOW). Accepted.

The spelling count was re-measured and is five authored plus one in frontmatter — § 1 corrected, and
it matters because Q2 is a decision about exactly that set. Rows added for FR-025 (home: the commit
body, which is the honest answer — no automated home exists), FR-001's `user-invocable: false`, and
FR-012's scope clause.

---

## 11. Security audit

`security-expert`, dispatched at step 6 against `plan.md`. Verdict **fail** (advisory — this seat
does not veto): **1 HIGH · 3 MEDIUM · 1 LOW**, all resolvable by amending the plan before any code
exists, which is the whole reason the seat runs here.

**Coverage, stated because a clean verdict is worth exactly what it covered.** The seat read
`00-triage.md`, the routing table, `09-design-and-business-logic.md` and
`03-injection-and-input.md`; it did **not** load `01-access-control.md`,
`04-cryptography-and-secrets.md`, `06-supply-chain-and-integrity.md` or `07-data-protection.md`. It
also names that the knowledge base's own "Deliberate gaps" section excludes the AI/agentic surface —
prompt injection, excessive agency — which is where questions 1 and 2 mostly sit. Those two
judgements therefore rest on the design and on the in-tree precedent, not on a catalogued failure
mode. That is a real limit on F4.

| #  | Severity  | Finding                                                                                                          | Disposition                                               |
| :- | :-------- | :--------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------- |
| F1 | 🔴 HIGH   | The § XI guard is borrowed from #576 without the precondition that made it sufficient                            | **Plan changed** — FR-027                                 |
| F2 | 🟠 MEDIUM | The badge vocabulary is ambiguous on an unresolved finding, has no aggregation rule, and nothing enforces FR-006 | **Plan changed** — FR-028, FR-029                         |
| F3 | 🟠 MEDIUM | An orphaned start fence makes the graft delete user content                                                      | **Plan changed** — FR-032, after independent verification |
| F4 | 🟠 MEDIUM | FR-012 forbids granting authority but not shortening a constraint                                                | **Plan changed** — FR-030, FR-031                         |
| F5 | 🔵 LOW    | The delivered contract is user-writable; a declared preserve pins a tampered copy                                | **Plan changed** — FR-033                                 |

### F1 — the borrowed guard (HIGH). Verified, and the seat is right.

§ 7's XI row states that a deny-list cannot close over § XI's open set, and then adopts one anyway.
Checked against the precedent: `tests/templates/mobile_first_contract_test.ts` carries
`OUTWARD_SHAPES` — four regexes over url, bare domain, handle, email — and the comment above it says
the sweep is sufficient **because** "a contract with no URL, no domain, no handle and no address has
nowhere to carry one." That is a precondition, and #576 shipped it as an explicit requirement (its
FR-013, "no examples").

This plan had dropped the precondition and kept the instrument — § 7 positively permitted examples,
"invented and attributed to nothing", which is prose with nothing checking it: the exact shape § 5's
last row condemns. A response-style contract is also structurally more example-hungry than a
mobile-first one, since FR-004, FR-007 and FR-009 all describe output _shapes_, and a shape invites
a worked sample.

Closed by FR-027, which asserts the **precondition** (no example names anything) rather than only
the leak. `OUTWARD_SHAPES` stays as the second layer.

### F2 — the badge vocabulary (MEDIUM). Accepted; it aims at the one case that decides a merge.

FR-005's four glosses overlap on the case that matters: an unresolved HIGH is simultaneously
"warning, still open" and "failure, actual and standing." FR-006 disambiguates the wrong axis — it
settles _time_ (end state, not journey) and leaves _severity_ open. Three compounding gaps, all
fair:

- **No aggregation rule.** FR-006 badges each item, FR-007 requires a lead badge, and nothing says
  the lead is the worst of what it summarises.
- **One-directional pressure.** Every worked example in FR-006 and SC-008 moves red → green; none
  moves green → red. Combined with "be concise" and "lead with your outcome", the standing bias of
  the vocabulary is toward looking successful.
- **Nothing enforces it.** FR-025 demands a live red mutant for the _wiring_ assertions; the
  _semantics_ got SC-008, a human-judgement criterion. A mechanical standard for `AGENTS.md` content
  and a prose standard for the feature's own meaning.

FR-028 removes the author's judgement from the tie by binding the glyph to a verdict already
computed elsewhere; FR-029 adds the worst-of rule. Both are assertable by regex, and
`mobile_first_contract_test.ts` is the working template for asserting a contract sentence.

**Checked and clear:** a sweep of `templates/` for 🟢🔴🟠🔵 returns zero occurrences, so FR-005
establishes a new vocabulary with no corpus to contradict it.

**Why this stays MEDIUM and not HIGH:** FR-010 keeps the glyphs out of the fenced blocks, so the
machine-checked verdict — `REVIEW_VERDICT` and the four counts — stays glyph-free. The badge can
mislead the reader; it cannot mislead the gate. FR-010 is the most valuable control in this document
and is preserved verbatim.

### F3 — the orphaned start fence (MEDIUM, exploitable). **Independently verified, and the precise shape matters.**

This claim was not taken on relay: a seat reported an adjacent version of it during #576's review,
and measurement refuted that one. This one measures true, and the two are distinguished by a
precondition. Probed directly against `mergeIntoFile`:

| Existing `AGENTS.md` shape              | Outcome                                   |
| :-------------------------------------- | :---------------------------------------- |
| Orphan START only, no end anywhere      | 🟢 nothing lost — appends                 |
| Orphan END only                         | 🟢 nothing lost                           |
| Well-formed block, ordinary refresh     | 🟢 nothing lost                           |
| **Orphan START above a complete block** | 🔴 **every line between them is deleted** |

`locateBlock` takes `content.indexOf(start)` — the _first_ start — and then
`content.indexOf(end, afterStart)` — the first end after it. With an orphan above a real block, that
span opens at the orphan and closes at the real end fence, and `mergeIntoFile`'s replace path drops
everything inside it.

**One correction to the finding's wording, and it matters for triage:** the loss is _not_ unbounded
to end-of-file. The tail after the real end fence survives — measured. What is unbounded is the size
of the span between the two markers.

Aggravating, and accurately reported: `writeBundle` runs with `backupExisting: false` on this path,
and `AGENTS.md` is `skipIfExists`, so the graft is its only writer and there is no backup. The
upgrade report says `refreshed`, one line, with no indication of volume. The trigger is an HTML
comment — invisible on GitHub and in a rendered diff preview.

**Compensating control, and it is a real one:** `AGENTS.md` is normally tracked, so the loss shows
in `git diff`. That plus the unusual precondition is why this is MEDIUM.

**Pre-existing, and re-scoped into this ticket rather than fanned out.** This plan does not
introduce the defect; it adds the **third** managed label to the file most likely to be hand-edited,
and ships that third trigger to every existing project through the graft. The standing rule for an
audit that widens a ticket is to re-scope the ticket, not to file a follow-up, and the fix is one
guard — FR-032.

### F4 — brevity as a constraint-shortener (MEDIUM). Accepted, and this is the finding that would never be discovered empirically.

FR-012 forbids the contract from **granting** authority. Nothing forbade it from **shortening a
constraint** — and in this codebase preloaded prose _is_ an enforcement mechanism:
`alert-triage-contract` states in its own words that its Bash allowlist is "the _entire_ limit on an
agent whose frontmatter grants `Bash` unconditionally", and
`templates/core/agents/security-expert.md` is exactly that configuration. A standing "be concise, no
repetition" in that same channel is pressure on the one thing that must never be summarised. The
same holds for completeness: `review-findings-contract` requires every field and a non-empty
`EVIDENCE`; `00-triage.md` requires one finding per defect.

FR-010 saw the adjacent problem — badges must not enter the fenced blocks — and solved it as a
_parse_ hazard. The trust hazard beside it was untreated. **A suppressed finding is undetectable by
construction: there is no artefact to inspect.** That is why this ships now rather than on evidence.

Closed by FR-030 (brevity removes restatement, never substance; block-defining contracts win) and
FR-031 (no `tools:`/`allowed-tools:` in frontmatter, asserted).

**One privilege path checked and clear:** no skill in `templates/core/skills/` declares `tools:` or
`allowed-tools:` today, so a preloaded skill cannot widen an agent's grant through frontmatter.
FR-031 keeps it that way by construction rather than by luck.

### F5 — the delivered file is writable (LOW). Accepted as documentation, no code change.

Not new in kind — the three always-on context files and `mobile-first-contract` already have this
shape, and the ordinary upgrade path self-heals by overwriting the skill from the bundle. The
residual is the preserve interaction: a project that declares the contract path preserved has it
skipped by both the plan writes and `applyManagedSections`, and the report prints
`preserved … declared`, which reads as intentional. FR-033 records that the delivered file is
user-writable and that `upgrade` is its only repair path.

### Q4 — what an authenticated stranger can do to somebody else's account

**Nothing**, and the seat named what it checked to reach that rather than asserting it: the
credential surface at `src/infrastructure/credential_store.ts`, `src/infrastructure/keychain/*`,
`src/domain/cloud/*`, and the only outbound network calls in the tree in
`src/infrastructure/github_api.ts`. This feature's file set intersects none of them, and adds no
flag, argument, exit code or on-disk format.

---

## 12. Open questions and settled decisions

### Settled at the stop — 2026-08-27

**Q1 — the two Windsurf breaches. Answer: structural — primary leg only.**

`dependency-expert` was over by 3 and `specnaut-board.md` over by 60, both flowing from one premise:
that a contract every turn must honour is enumerated surface by surface. Rather than pay either
breach, the premise is withdrawn. The `skills:` per-seat leg (FR-017, FR-018) and the
`board/SKILL.md` pointer (FR-016) are dropped.

Nothing is trimmed and both breaches disappear. Reach is unchanged where it was ever real: the three
always-on context files cover `claude`/`codex`/`cursor`, and the `response-style` fence in
`AGENTS.md` covers all seven **and** every existing project — which the withdrawn leg never did.
What is genuinely lost is the preload on Claude Code, the one harness known to act on `skills:`;
measured against 50 of 110 renders discarding it and zero main-session turns governed, that is the
smaller half.

**Cost to be stated on #575, not buried:** AC 6 and AC 10 are satisfied by a different mechanism
than their text describes. AC 10 in particular says the preload "is wired as the secondary leg". It
is not, and the ticket must say so with the measurement that decided it.

**Q2 — the five existing spellings. Answer: replace all five with pointers** (FR-037, FR-038).

Shipping the contract while leaving five silent restatements would have produced a sixth spelling of
a rule this feature exists to single-source — and SC-002 would have gone green anyway, because it
only ever asked about the contract's _own_ sentences. FR-038 closes that gap too. `brainstorming`'s
frontmatter `description` is left alone: it is routing metadata, not a normative statement.

### Decided here, without asking

- **Name: `response-style-contract`.** Follows the `-contract` suffix convention of the six existing
  preloaded contracts. A shorter name would buy 9 characters against Q1 — not enough to close either
  breach, and not a reason to break a convention six files keep.
- **The fence label is `response-style`, a new one.** Not folded into `ui-defaults`: that fence is
  UI-scoped and this contract governs every answer.
- **`using-specnaut` gets a pointer.** It is the on-demand route for the two harnesses whose only
  static entry is `.specnaut/harness-tools.md`, it has 256 characters of worst-case headroom, and
  `verification-before-completion` already establishes exactly this reference shape from exactly
  this file.
- **`devops-sre` gains a `skills:` line rather than being skipped.** 6,493 characters of headroom,
  and it writes advisory reports to a human.
- **All 15 agents, no qualifier.** Per A3 — a universal contract has no membership question, and the
  qualifier only created one that nothing could check.
- **No new always-on context file for `windsurf` / `antigravity` / `copilot` / `opencode`.** Out of
  scope on the ticket; the fence is their route, and it is the one that also reaches existing
  projects.
- **The `merge_block.ts` orphan-fence fix is re-scoped into this ticket, not fanned out** (FR-032).
  The defect is pre-existing, but this feature ships its third trigger, and the standing rule for an
  audit that widens a ticket is to re-scope rather than file a follow-up.
- **Landing is local `--ff-only` via `scripts/land.sh cli`.** Repository default.

---

## 13. What implementation found that the plan did not

Two facts, recorded here because both change what a future reader should believe.

**The spelling count was fourteen, and every count before the last one was wrong.** § 1 said four.
The architecture audit measured five. FR-038's sweep found a sixth on its first run — a bullet in
`brainstorming`'s "Key principles". The review then found **eight more**, and the reason is the
sharpest lesson in this feature: the sweep's regexes were `/one question at a time/i` and a
multiple-choice variant, which is **a guess at how the rule gets written**. Every occurrence phrased
"questions … are asked one at a time" — the words in the other order — walked straight past it.

A guessed shape is the same defect as a hand-written list, wearing a mechanism's clothes. The sweep
now matches the phrase itself and narrows on the subject (`question|ask`), which also correctly
leaves alone `groom.md`'s unrelated "process tickets one at a time".

Eight of the fourteen were placement descriptions — a phase-index row, an ASCII diagram, a template
caption — that stated _where_ questions are asked and leaked _how_ along the way. Those had the
mechanic removed rather than a pointer added: the placement is still theirs to state, the mechanic
never was.

**A registered pointer is not a gated one.** `POINTED_BY_DECISION` recorded four surfaces that point
at the contract by decision, and its staleness check asked only whether each key still named a file.
Deleting the pointer it recorded left the suite at 1632 passed / 0 failed — measured twice by the
review. An entry is a claim that the surface POINTS; the check now asserts the claim. The same
review found a filter clause in the neighbouring test that could never fire, because it compared
`CORE_BUNDLE` ids against `HARNESS_STATIC` destination paths — two namespaces that never intersect.
A clause that cannot fire reads as coverage it does not provide.

**One existing smoke check was inverted, deliberately.** It asserted that `brainstorming` states the
one-question-at-a-time rule itself. After this feature it must not: the rule has one author and
every other surface points at it. The check now asserts the pointer and the absence of the phrase —
the same guarantee for the user, a stronger one for the tree, since the old form was satisfied by
any of the copies that used to exist.

**The Windsurf gate was never blind — the § 6 measurement was.** The budget assertion in
`tests/infrastructure/harness/windsurf_harness_test.ts` already iterates `everyBundleOption()`, so
the 60-character `specnaut-board.md` breach would have failed CI the moment it landed. What sampled
one combination was this plan's own § 6 table, written by hand. FR-036 is therefore satisfied by a
gate that already existed; the corrected practice belongs to the plan author, not to the suite.
Worth stating plainly: the failure was a claim made about a surface that was never measured, next to
a mechanism that measures it correctly.

**A stale tally was found beside a live assertion.** `tests/integration/init_codex_test.ts` carried
a running arithmetic comment ending "= 21" directly above `assertEquals(…, 25)`. It had been wrong
for four features, because nothing checks a comment. The tally is removed rather than corrected —
the assertion is the fact, the list above it is history.

## 14. A number three counts disagreed on

The evidence for withdrawing the `skills:` leg (§ 12, Q1) included "50 of 110 emitted agent renders
discard the key". Two later measurements did not reproduce it: the product owner measured **45 of
105**, and a third census keyed on a **content marker** rather than on a path shape measured **46 of
101**.

None is wrong. They disagree because _"an emitted agent render"_ is not a well-defined unit across
seven adapters: `cursor` emits agents as skills, `codex` as `.toml`, `copilot` as
`.instructions.md`, and each census drew the boundary somewhere slightly different. A path-shaped
filter is a guess at a layout, which is the same defect as a guessed regex — this feature has now
produced it twice.

**The invariant the decision actually rested on does not depend on the census, and all three agree
on it:**

- `codex`, `copilot` and `opencode` discard `skills:` **wholesale** — every agent render on those
  three harnesses loses it, on every count.
- On the four that keep it, it survives **textually**; only Claude Code is known to act on it.
- It appears on no skill and on no always-on context file, so it governs **zero** main-session
  turns.

Cite the invariant, not the ratio. A figure that three careful counts could not agree on has no
business being load-bearing, and the argument never needed it.
