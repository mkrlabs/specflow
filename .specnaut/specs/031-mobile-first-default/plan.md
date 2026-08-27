# Plan — Make mobile-first the assumed default for UI work

- **Backlog item:** specnaut-cli#576 — Make mobile-first the assumed default for UI work, with an explicit project opt-out — https://github.com/specnaut/specnaut-cli/issues/576
- **Depends on:** specnaut-cli#575 — Centralize the assistant response-style contract into one harness-agnostic source referenced by pointer — https://github.com/specnaut/specnaut-cli/issues/575
- **Branch:** `031-mobile-first-default`
- **Date:** 2026-08-27

---

## 1. Why this exists

A user building a UI through Specnaut has to ask for responsiveness by hand,
every time. The tool never assumes it.

Measured, at `specnaut-cli@0258546`:

- A grep of `templates/`, `plugin/` and `src/` for
  `mobile-first|responsive|breakpoint|touch target|viewport` returns hits in
  exactly one place — `templates/core/specnaut/memory/a11y/`. Those are WCAG
  criteria (1.4.4, 1.4.10) applied by an **invoked audit after the code
  exists**, never as an instruction before it is written.
- `templates/core/agents/ui-ux-designer.md` — the canonical `DESIGN.md`
  template — contains **zero** occurrences of `breakpoint`, `@media`, or any
  responsive prefix. It declares typography, spacing, radii, shadows and motion
  as fixed pixel values. An agent following it faithfully emits a fixed-width
  design system.
- Its single touch affordance is `Min height 40px (touch-friendly)` on Input.
  40 is below both platform minimums in common use (44 pt on iOS, 48 dp on
  Android). The one line aiming at touch misses.

So the defect is not only a missing instruction. It is a shipped template that
instructs the opposite, and a user compensating for it by hand on every request.

The measured user cost is one sentence of prompt per UI request, repeated
indefinitely, plus whatever is not caught when the sentence is forgotten.

## 2. User scenarios

### P1 — the main-session turn (this is the reported failure)

**Given** a project scaffolded with Specnaut and no desktop-only declaration,
**when** the user asks for a UI component in an ordinary turn — no `/specnaut`
phase, no dispatched agent, no plan — **then** the emitted markup and styles
treat the narrow viewport as the base case, without the user saying so.

This scenario is the reason the always-on leg is load-bearing rather than
inherited. A phase-gated or agent-gated instruction never reaches this turn.

### P2 — the planned feature

**Given** a project with a front-end surface, **when** the user runs
`/specnaut plan` on a UI feature, **then** the resulting `plan.md` carries
adaptive behaviour among its requirements without the brief having asked, and
its decision table names where the breakpoint values live.

### P3 — the design system

**Given** a user dispatching `ui-ux-designer`, **when** it produces or edits
`DESIGN.md`, **then** that document declares breakpoint tokens, a touch-target
minimum token, and a type/spacing scale that adapts — and discovery mode
assumes mobile-first rather than asking whether it is wanted.

### P4 — the exception

**Given** a project that is genuinely desktop-only, **when** it declares that
in `.specnaut/memory/constitution.md`, **then** agents stop assuming
mobile-first for it, and the declaration is the only thing that produces that
effect.

### Edge cases

- **A harness with no always-on surface.** Four of seven have none (§ 8). On
  those, P1 is reached only through the project-root `AGENTS.md`, which is
  `skipIfExists` — so on an *existing* project on those harnesses, P1 is not
  served at all. Named, not solved (FR-011).
- **A native-only project.** No front-end detection signal matches it (§ 5,
  row 4). It is served by the undetected legs and by nothing detection-gated.
- **A project whose constitution predates this change.** `memory/constitution.md`
  is `skipIfExists`; its shipped seed carries no `Front-end patterns` section at
  all. Such a project gets the default from the always-on leg, never from its
  own constitution, until it re-runs `/specnaut constitution`.
- **A UI request in a project with no `DESIGN.md`.** Most projects. The contract
  must be actionable with no token file present — it states obligations, and
  where no token file exists the implementer declares the values in the code it
  writes rather than treating the rule as inapplicable.

## 3. Requirements

- **FR-001** The mobile-first default exists as exactly one authored file under
  `templates/core/`, registered in `templates/manifest.json`.
- **FR-002** That file states the concrete rule set (§ 6, "The rule set") in
  terms of concepts, and states that it is a **default with an explicit
  opt-out**, not a mandate.
- **FR-003** The contract names no framework, library, utility-class prefix or
  vendor API anywhere in its text. The assertion is scoped **to the contract
  file only** — surfaces that merely point at it keep their own pre-existing
  framework references (§ 5, "A scoping trap").
- **FR-013** The contract contains **no examples** — no identifier-shaped token
  naming any real project, product, vendor, host or design-system token. Its
  rules are stated as obligations over concepts. This, not FR-003, is what
  serves constitution § XI: a deny-list can close over the finite set of
  framework names, and cannot close over the unbounded set of things an
  unrelated project might be called.
- **FR-004** The contract declares no **tunable** value — no breakpoint
  position, no target-size minimum, no type-scale step. Citations, WCAG
  criterion numbers and rule ordinals are permitted and required: § 6 rule 2's
  authority *is* "WCAG 1.4.10". A ban on digits would forbid the citation the
  rule depends on and could never go green. The assertion names the tunables
  and requires each to appear zero times — it does not grep for numerals.
- **FR-005** The contract states how a project declares the exception, names
  the file, **the exact literal form** the declaration takes — a fixed heading
  and a fixed declarative sentence, not free prose — and states that **anything
  not matching that literal form is treated as absent**, so the default stays
  on. Absence already fails safe; this makes ambiguity fail in the same
  direction.
- **FR-006** **Both** constitution files gain § `Front-end patterns` carrying
  the default bullet and the opt-out convention, by pointer:
  `templates/core/specnaut/templates/constitution-template.md` (what
  `/specnaut constitution` fills) **and**
  `templates/core/specnaut/memory/constitution.md` — the seed a project
  actually receives at `init`, which today has exactly two headings and no
  such section. Editing only the template leaves the opt-out's named home with
  no heading to declare under. This also retires a pre-existing inconsistency:
  `developer.md` already instructs the agent to read a `Front-end patterns`
  section of the seed that has never existed.
- **FR-007** Every surface required to honour the contract references it **by
  pointer**. No surface restates any rule.
- **FR-008** The set of surfaces in FR-007 is a **derived candidate set minus a
  justified exclusion list**, never a positive list. Candidates: every
  `CORE_BUNDLE` entry of category `agent` whose content matches the front-end
  vocabulary, plus every always-on `HARNESS_STATIC` destination. Each exclusion
  carries a written reason. A positive list can only be wrong in one direction
  and is wrong in that direction today — `accessibility-expert.md`,
  `performance-expert.md` and `code-reviewer.md` all touch UI and none is in
  § 8's list. The inversion is not invented here: `tests/plugin/plugin_sync_test.ts`
  already runs a completeness sweep against an exclusions file, ten lines from
  the enumeration this plan proposed to copy.
- **FR-009** `templates/core/agents/ui-ux-designer.md`'s canonical `DESIGN.md`
  template gains a responsive/adaptive section declaring breakpoint tokens, a
  touch-target minimum token, and an adapting type/spacing scale. Its existing
  `Min height 40px (touch-friendly)` literal is replaced by a reference to the
  declared token — one number, in one place.
- **FR-010** Mechanical assertions cover: file present; manifest-registered;
  mirror-identical in `plugin/`; referenced by every surface in the FR-008
  enumeration; restated by none of them; free of framework names per FR-003;
  free of numeric values per FR-004.
- **FR-011** The always-on leg is enumerated **per harness**, naming explicitly
  every harness that has no always-on surface. `harness_static` alone **cannot**
  produce that list, for two measured reasons: `windsurf` and `antigravity`
  have **zero** entries, so the complement is not computable from the set; and
  only **3 of its 17** entries are always-on context files — the other 14 are
  scripts, hooks, settings, and five on-demand `harness-tools.md` copies.
  Separating them is a hand classification, which is exactly what a derivation
  must not contain. So: add `alwaysOn: true` as **data** on the three context
  entries, and derive the table as `HARNESSES × harness_static.filter(alwaysOn)`,
  taking `HARNESSES` from `src/domain/installed_lock.ts` — the canonical list,
  whose own comment records the time it diverged from the parser's copy and
  made `init --ai antigravity` produce a lock `upgrade` refused to read.
- **FR-012** Every assertion added under FR-010 was **observed failing** on the
  defect it guards before being accepted.
- **FR-015** **At least one assertion connects registration to reach.** Every
  other assertion in FR-010 is about the *shape* of the templates — the file
  exists, is registered, is mirrored, is pointed at. None of them can fail when
  the contract reaches no turn on a given harness. Render a project per harness
  and assert, per harness, that the contract is reachable from a surface that
  harness loads without invocation — or that the harness is on the declared
  uncovered list. A suite that is green on shape while the feature is inert is
  the failure this requirement exists to prevent.
- **FR-016** The contract ships **preloaded and non-invocable** —
  `user-invocable: false` in its frontmatter, asserted — matching
  `backlog-reference-contract`, whose test pins both the frontmatter key and
  the literal marker sentence. Note the platform exception rather than
  pretending it away: Windsurf emits every skill into `.windsurf/workflows/`,
  so it is slash-invocable there whatever the frontmatter says.
- **FR-017** The pointer has **two channels**, and both are asserted. Channel A
  — agents that preload via `skills:` frontmatter, verified by parsing the
  frontmatter. Channel B — surfaces with no frontmatter preloading, which carry
  a prose pointer. The precedent's test separates them; collapsing both into
  "a pointer" is how one of the two ends up unasserted.
- **FR-014** The contract states that it declares obligations about UI output
  only, and confers no authority to run commands, read credentials, or modify
  files outside the UI work at hand. A scope-limiting sentence in an
  instruction file is a partial mitigation, not a control — it is what is
  available at plan time, and it costs one line.

FR-008 and FR-011 quantify over sets. Both sets are enumerated by **search**:
FR-008's from the pointer-carrying surfaces the test itself declares, FR-011's
from `harness_static` in the manifest. Neither is decomposed by example.

## 4. Success criteria

- **SC-001** A user asking for a UI component, in a project with no
  declaration and no mention of responsiveness in the request, receives output
  that treats the narrow viewport as the base case.
- **SC-002** A user who wants desktop-only writes that statement **once**, in
  one place, and is not asked about it again.
- **SC-003** A reader of the contract can tell whether a given piece of UI
  satisfies it without knowing which framework built the UI.
- **SC-004** Removing the pointer from any one surface, or desyncing any
  mirror, turns the suite red.
- **SC-005** The contract's rules appear in full in exactly one file; a reader
  who greps for any rule's wording finds one authored occurrence.
- **SC-006** Emitted Windsurf workflows stay inside their character budget.

## 5. 🔒 The decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| **What "mobile-first" obliges** — the rule set | `templates/core/skills/mobile-first-contract/SKILL.md` | Any restatement of a rule in `ui-ux-designer.md`, `developer.md`, `constitution-template.md`, `plan.md`, or an always-on context file. Grep each rule's distinctive wording; more than one authored hit is the defect. |
| **Whether the default applies to this project** — the opt-out | The consuming project's `.specnaut/memory/constitution.md`. Its **form** is declared once, in the contract file. | A second opt-out channel: a `DESIGN.md` heading, an `init-options.json` key, a CLI flag, or a per-agent override. Grep for any other reader of a desktop-only signal. |
| **The tunable values** — breakpoint positions, touch-target minimum, type scale | The project's `DESIGN.md` when one exists; **its constitution's `Front-end patterns` section when it does not**. Two binding sites in priority order, both real files. `DESIGN.md` is named in only two authored templates and **no manifest entry ever writes one** — it exists solely as output of a `ui-ux-designer` dispatch, which most projects never run. A single home that most projects lack is not a home. | A tunable in the contract file; the surviving `40px` literal in `ui-ux-designer.md`; a default breakpoint set hardcoded in a template; **values re-declared per feature in the code**, which is where the earlier draft's fallback sent them — N sites, which is the defect this row exists to prevent. |
| **Which surfaces must carry the pointer** | The derived candidate set in the new test, minus a **justified exclusion list** | A positive membership list. Measured evidence against one: the precedent's `CHANNEL_B_CORE` still carries a nine-line justified carve-out for `specify.md`, a phase doc deleted in #455/#456. The carve-out outlived the file and nothing went red, because a positive list has nothing to say about a member that no longer exists. |
| **Whether the contract is framework-agnostic** | The deny-list assertion in the new test | Prose in the contract telling the reader not to name frameworks. Prose does not bind; the assertion does. The contract may state the principle, but the *decision* is the assertion. |
| **Which harnesses have an always-on surface** | An `alwaysOn: true` flag on the three `harness_static` context entries, joined against `HARNESSES` in `src/domain/installed_lock.ts` | Any hand-written per-harness table, **and the invisible second decider**: without the flag, the derivation still needs a human to separate the 3 always-on entries from the other 14, and needs a list `harness_static` does not contain to name `windsurf` and `antigravity` at all. Two deciders, one of them unwritten. |

| **Whether an authored template is visible to users at all** | `templates/manifest.json`, gated by `tests/templates/manifest_registration_test.ts` | A file added under `templates/` and never registered. It renders for nobody and no other check notices. FR-001's second clause is this row. |
| **Where the opt-out convention is documented** | Both constitution files — the seed **and** the template (FR-006) | Documenting it in only one. Editing the template leaves the seed — the file a project actually receives — without the heading the opt-out declares under; editing only the seed leaves `/specnaut constitution` regenerating a file that drops it. |
| **Whether a new assertion is accepted** | The commit body, per FR-012 | Accepting a presence-shaped assertion that has never gone red. There is no automated home for this one and inventing one would be theatre; the honest home is the written record that it was observed failing. |

**Two askers, one decider — recorded deliberately.** The touch-target minimum is
*asked* by both the contract (which obliges a declared minimum) and
`ui-ux-designer.md` (which declares the token). It is *decided* only in the
project's `DESIGN.md`. Today's `40px` literal is a second decider, and removing
it is what makes this row true.

**A scoping trap on the deny-list.** `constitution-template.md`'s existing
`Front-end patterns` block already names frameworks — "React, Vue, Svelte,
Solid…", "Redux, Pinia, Zustand…" — as tuning guidance. The FR-003 assertion
must scope to the contract file, not to every surface that points at it, or it
goes red on text this feature never touched.

## 6. Technical context

**Language / runtime.** Deno + TypeScript. Templates are authored under
`templates/` and compiled into `src/templates_bundle.ts` by `deno task bundle`;
a stale bundle ships a broken binary, so the bundle is regenerated and committed
with any template change.

**Registration.** `templates/manifest.json` has two arrays: `core` (285 entries,
by `category`/`name`/`source`) and `harness_static` (17 entries, by
`harness`/`destination`). An authored file under `templates/` that is not in the
manifest is invisible to users — `tests/templates/manifest_registration_test.ts`
is the gate.

**Mirrors.** `tests/plugin/plugin_sync_test.ts` holds `SYNC_PAIRS`, a literal
list mapping `plugin/…` to its bundled source, asserting byte-identity. It
covers `templates/core/skills/*` and 15 `templates/core/agents/<name>.md`.
`ui-ux-designer` is among the 15, so editing it puts the agents mirror in play.
A new file is mirrored by nothing until its pair is added to that list by hand.
`.codex-plugin/` and `.cursor-plugin/` hold a `plugin.json` each and no skills
or agents tree — they are not mirrors and must not be widened into.

**Budget.** `src/infrastructure/harness/windsurf_harness.ts` derives
`WINDSURF_WORKFLOW_BUDGET_CHARS` from `WINDSURF_WORKFLOW_MAX_CHARS` less
`WINDSURF_WORKFLOW_RESERVE_CHARS`. Values are read from the source, not pinned
here. The gate is the suite, so a restatement surfaces as red CI. This is the
mechanical reason FR-007 forbids restatement rather than merely preferring
reference.

**The rule set** (the substance of FR-002, concepts only):

1. The narrow viewport is the base case; wider layouts are progressive
   enhancement, not narrow-width patches on a desktop layout.
2. No horizontal scrolling of content at the narrowest supported viewport.
   Already an obligation under WCAG 1.4.10 Reflow — the contract cites that
   authority rather than asserting a preference.
3. Breakpoints are declared, named tokens, not values scattered at call sites.
4. Interactive targets meet a declared minimum touch size. This is a **design
   default, not an accessibility criterion** — the shipped a11y catalogue tracks
   WCAG 2.1 A/AA, which has no target-size criterion. Misattributing it is a
   defect.
5. Type and spacing adapt — fluid, or stepped at the declared breakpoints. One
   fixed pixel scale for all widths does not satisfy this.
6. Input modality is not assumed. Anything depending on hover or a fine pointer
   has a touch and keyboard equivalent.
7. Zoom is not disabled and the viewport (or platform equivalent) is set.
8. Native equivalents are stated in the same terms — device class and
   orientation, safe-area insets, the platform's dynamic-type setting.

**Domain vocabulary.** *Contract* — the authored rule set, one file. *Pointer* —
a one-line reference to it by skill name, the shape `backlog-reference-contract`
already uses. *Always-on surface* — a scaffolded file a harness loads into every
turn without invocation. *Opt-out declaration* — a project's statement that it is
not mobile-first. *Token* — a named value in the project's `DESIGN.md`.

## 7. Constitution check

Against `.specnaut/memory/constitution.md` at the monorepo root.

| Principle | Verdict |
| :--- | :--- |
| I — OSS / proprietary boundary | **Pass.** Entirely within the public CLI. No private-half identifier is involved. |
| II — single bridge is the HTTP contract | **Pass.** No cross-half traffic. |
| III — monorepo holds no product code | **Pass.** All product changes land in `apps/specnaut-cli/`; the monorepo takes only a pointer bump. |
| IV — cross-cutting change discipline | **Pass.** One half, one commit, then the pointer commit. |
| V — merge defaults, local by default | **Pass.** Local `--ff-only` via `scripts/land.sh cli`. Not a `feat` carve-out risk: the adoption section goes in the commit body. |
| VI — centralised backlog routing | **Pass.** #576 was filed through the `product-owner`; `merge` closes it. |
| VII — submodule autonomy | **Pass.** |
| VIII — documentation conventions | **Pass, with a live constraint.** The contract must not pin version numbers, dates or counts. It must also not pin the Windsurf budget number — § 6 cites the constants by symbol for exactly this reason. |
| IX — dogfooding | **Partial, and disclosed.** This repo has no front-end surface, so the CLI cannot dogfood its own mobile-first contract. The pointer wiring and the assertions are dogfooded; the rules themselves are not exercised here. Recorded in Complexity Tracking below rather than claimed as a pass. |
| X — epic status mirrors child progress | **N/A.** #576 is a sibling of monorepo#33, not its child. |
| XI — consumer agnosticism | **Pass, on FR-013 and FR-004 — not on FR-003.** The contract is written for other people's projects. § XI protects an **open, unknowable** set: any unrelated project's name, vendors, hosts, or internal token names. A deny-list cannot close over a set whose members are unknown at authoring time; FR-003 is the right instrument for the *closed* set of framework names and the wrong one for this. What actually serves § XI is FR-013 (no examples at all) and FR-004 (no numeric values — a real project's token values are recognisable). Applying this plan's own § 5 row-5 principle: prose does not bind, the assertion does. |

**Complexity Tracking — § IX partial.** Justification: the feature's subject is
UI, and the CLI is a terminal program with no authored front-end surface
(`docs-dist/` is gitignored build output). Dogfooding the rules would require
inventing a UI in this repo, which is a larger and worse change than accepting
that the rules ship untested against real markup. Mitigation: the *mechanism*
(pointer, manifest, mirror, budget) is fully exercised by assertions here, and
the *rules* are exercised by the smoke sandbox scenarios, which scaffold real
projects.

## 8. Surface impact

**No front-end surface exists in this repository.** The `accessibility-expert`
FE-surface signals match nothing authored here — the only `.html` files live in
`docs-dist/`, which `.gitignore:10` excludes. Per the phase contract, this plan
therefore carries no visual-prototyping subsection.

**Client surfaces touched.**

| Surface | Change |
| :--- | :--- |
| `templates/core/skills/mobile-first-contract/SKILL.md` | New. The single authored contract. |
| `templates/manifest.json` | One `core` entry, category `skill`. |
| `templates/core/specnaut/templates/constitution-template.md` | § `Front-end patterns` gains the default bullet + opt-out convention, by pointer. |
| `templates/core/agents/ui-ux-designer.md` | Responsive/adaptive section in the canonical `DESIGN.md` template; `40px` literal replaced by a token reference; `skills:` pointer. |
| `templates/core/agents/developer.md` | `skills:` pointer. Its front-end route is already the constitution. |
| `templates/core/skills/specnaut/phases/plan.md` § 8 | Pointer line on the existing FE-gated branch. |
| `templates/harness-specific/claude/CLAUDE.md` | Pointer line. |
| `templates/harness-specific/codex/AGENTS.md` | Pointer line. |
| `templates/harness-specific/cursor/specify-rules.mdc` | Pointer line. |
| `templates/core/root/AGENTS.md` | Pointer line. The only surface common to all seven harnesses. |
| `plugin/skills/mobile-first-contract/SKILL.md`, `plugin/agents/{ui-ux-designer,developer}.md` | Mirrors. |
| `tests/plugin/plugin_sync_test.ts` | **One** new `SYNC_PAIRS` row, added by hand. Measured: 69 rows today (53 skills, 16 agents); `ui-ux-designer` and `developer` already have theirs inside the 15-name agent block, so the delta is +1, not the plural an earlier draft implied. |
| `tests/templates/…` (new) | The FR-010 assertions. |
| `src/templates_bundle.ts` | Regenerated. |

**The always-on leg, per harness** — derived from `harness_static`, and the
finding that most shapes the architecture:

| Harness | Always-on context file on the upgrade path |
| :--- | :--- |
| `claude` | `.claude/CLAUDE.md` ✅ |
| `codex` | `.codex/AGENTS.md` ✅ |
| `cursor` | `.cursor/rules/specify-rules.mdc` ✅ |
| `copilot` | ❌ none — `.specnaut/harness-tools.md` only, which the `using-specnaut` skill reads **on demand** |
| `opencode` | ❌ none — same |
| `windsurf` | ❌ **no `harness_static` entry at all** |
| `antigravity` | ❌ **no `harness_static` entry at all** |

Three of seven. The project-root `AGENTS.md` is the only surface common to all
seven, and it is `skipIfExists: true` — written once at `init` and never
rewritten by `upgrade`.

**The project-root `AGENTS.md` is not as frozen as `skipIfExists` suggests.**
Its manifest entry carries `managedSection: "chain-stops"`, and
`managedSectionEntries` in `src/application/upgrade_project.ts` applies managed
sections **independently of the `skipIfExists` plan** — the guard in
`computeUpgradePlan` skips the file, and the fenced block is merged anyway. So
there *is* a write path into a user-owned instruction file on every harness, on
every upgrade.

**Where the pointer goes is therefore a real decision, and it decides the
feature's reach.** Recorded here rather than left to the implementer:

| Placement | Reach | Cost |
| :--- | :--- | :--- |
| **Outside** the fence, beside the existing `backlog-reference-contract` line | New projects only. On `copilot`, `opencode`, `windsurf`, `antigravity` — which have no other always-on surface — the feature does nothing for existing projects. | None. Matches the precedent exactly. |
| **Inside** the `chain-stops` fence | Every project, every harness, on the next `upgrade`. | Semantically wrong — that fence is named and scoped to the chain's two stops. |
| **A new second fence** in `AGENTS.md` | Same as inside. | **Measured, three files in `src/` + `scripts/`, zero template churn:** `CoreEntry.managedSection` in `src/domain/core_bundle.ts` is `readonly managedSection?: string` — "the **single** Specnaut-owned section" — so it widens to a list; then `managedSectionEntries` in `src/application/upgrade_project.ts` and the fence validator in `scripts/bundle-templates.ts`. Plus the standing cost: Specnaut owns more of a file the user owns, and `src/domain/merge_block.ts` documents a deliberate non-repair — deleting exactly one of the two markers orphans the block and the next merge appends a duplicate, so a user cannot cleanly revoke it by deleting a marker. |

`applyManagedSections` writes with `{ overwrite: true }` and its outcome type
is `"added" | "refreshed"` — **`"added"` is the case where an existing user
file lacks the fence.** So this is not merely a channel for projects that
already have the block: it installs it into projects that do not. That is what
makes the third row reach existing projects on all seven harnesses.

**What a pointer contract actually costs, measured on the precedent.** 43
tracked files contain `backlog-reference-contract`; 34 excluding the `plugin/`
mirror. Broken down: 16 authored pointer-carrying surfaces under `templates/`,
the contract itself, one manifest entry, 9 plugin mirrors, **10 tests**, 2 smoke
scripts, and the generated bundle. Five layers, roughly 40 files — about four
times what this section's own 14-row table suggests. The table above is the
change; this is the blast radius.

**The precedent has this hole too, and nobody had noticed.** The existing
`backlog-reference-contract` pointer sits at the top of `templates/core/root/AGENTS.md`,
**outside** the fence. So the wiring #575 and #576 both copy already reaches new
projects only, on the four harnesses with no always-on surface. That is a
finding about the precedent, not about this plan — but it means "reuse #575's
shape" and "deliver the promise universally" are not the same instruction, and
the plan must not pretend they are.

**Consequence, stated plainly:** as scoped — pointer outside the fence — the
headline promise holds for three of seven harnesses on existing projects, and
for all seven on new ones. Choosing the third row above would make it universal
at the cost of widening the managed section. This is the architecture decision
presented at the stop.

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| The contract becomes another vague virtue and changes nothing. | FR-004: no numbers in the contract, obligations only — and § 6's rule set is written so each rule names an observable, not an aspiration. |
| The FR-003 deny-list goes red on `constitution-template.md`'s pre-existing framework names. | Scope the assertion to the contract file. Recorded in § 5. |
| A pointer is added to a surface and the contract's wording is *also* pasted there "for convenience". | FR-007 + the restatement assertion, keyed on the FR-008 enumeration. |
| Windsurf budget breach on the files nearest the pointer. | The suite gates it; the pointer is one line by construction. |
| The `40px` literal survives somewhere and becomes a second decider. | FR-009 names it explicitly; the assertion greps for a bare pixel literal in the touch context. |
| The new assertions are presence-shaped and never fail. | FR-012 — each observed red on the defect it guards, before acceptance. |
| #575 has not landed at pickup and the two fork the mechanism. | Land the identical shape (contract file + pointer discipline) so they converge. Do not invent a second wiring. |
| The suite is green on template shape while the contract reaches no turn on four harnesses. | FR-015 — the only assertion in the set that is about reach rather than shape. Named by the architecture audit as the finding that outlives all the others. |
| A reader takes "mobile-first" to exclude native. | The contract's own rule 8 states native equivalents in the same terms; the name is discussed in § 12. |
| An example in the contract names a real project, vendor or token — a § XI incident, retroactive and requiring a history rewrite on a public tagged repo. | FR-013: no examples at all. The assertion is trivially enforceable because the permitted set is empty, which is the only allow-list that closes over an unbounded risk. |
| The opt-out is flipped by accident during an unrelated constitution edit, or by desktop-leaning prose near the heading. | FR-005's literal form plus the non-matching-means-absent rule: ambiguity fails in the same safe direction as absence. |
| The contract is edited in a consuming repo and read as instructions on an ordinary turn. | Pre-existing for all 285 shipped template entries; not created here. FR-014 adds the one mitigation available at plan time. |

## 10. Architecture audit

`architect-expert`, read-only, against this plan. **Verdict: fail** — 1 critical,
4 high, 3 medium, 2 low. All four blast-radius counts were measured, not
estimated; they are folded into § 8 rather than repeated here.

**Coverage:** three catalogue leaves read — `README.md`,
`smells/shotgun-surgery.md`, `smells/duplicate-code.md`. Findings resting on no
leaf are labelled plan-consistency defects rather than smells, which is the
right distinction to keep.

| # | Sev | Finding | Disposition |
| :-- | :-- | :--- | :--- |
| A1 | CRITICAL | § 8's premise was false. `AGENTS.md` **is** on the upgrade path: its manifest entry carries `managedSection: "chain-stops"`, `applyManagedSections` writes with `overwrite: true` independent of `skipIfExists`, and its outcome type includes `"added"` — the case where an existing user file lacks the fence. All seven harness adapters propagate the field. The scope reduction to "3 of 7" rested on a wall that is a door. | **Plan changed; the decision re-taken and escalated.** § 8 now carries three placement options with measured cost. The audit's phrasing is worth keeping verbatim: *"You did not accept a gap; you accepted a gap you believed was closed."* Presented at the stop — see § 12 Q1. |
| A2 | HIGH | FR-011's derivation is impossible as written. `windsurf` and `antigravity` have **zero** `harness_static` entries, so the complement cannot be computed from that set; and only **3 of 17** entries are always-on, the split being an unwritten hand classification. Two deciders, one invisible. | **Plan changed.** FR-011 now requires `alwaysOn: true` as data on the three context entries, joined against `HARNESSES` in `src/domain/installed_lock.ts`. Decision-table row 6 rewritten. |
| A3 | HIGH | The opt-out's named home has no section to declare under. The seed `templates/core/specnaut/memory/constitution.md` has exactly two headings and no `Front-end patterns`; FR-006 edited `constitution-template.md`, a different destination. `developer.md` already reads a section of the seed that has never existed. | **Plan changed.** FR-006 now covers both files. This retires a pre-existing reader/seed disagreement the plan had not noticed. |
| A4 | HIGH | FR-004's "no numeric values" is contradicted by § 6 rule 2, which requires the contract to cite WCAG 1.4.10 for its authority. The FR-010 assertion could never go green. | **Plan changed.** FR-004 restated as "no **tunable** value", asserted by naming the tunables rather than by grepping digits — the shape the precedent's `LOAD_BEARING` test already uses. |
| A5 | HIGH | FR-007 quantifies over every UI-touching surface; § 8 wires 2 of the 4 UI-touching agents. Measured: `accessibility-expert.md` (11 FE-vocabulary hits), `performance-expert.md` (2) and `code-reviewer.md` are outside it. A positive list can only be wrong in one direction and already is. | **Plan changed.** FR-008 inverted to a derived candidate set minus a justified exclusion list — the shape `plugin_sync_test.ts` already runs ten lines away. |
| A6 | MEDIUM | The "enumeration in a test" home is **proven** to go stale by the precedent being copied: `CHANNEL_B_CORE` carries a nine-line justified carve-out for `specify.md`, deleted in #455/#456. The justification outlived the file and nothing went red. | **Folded into A5's fix.** Recorded in decision-table row 4 as evidence *against* the home the plan first chose. |
| A7 | MEDIUM | § 8 said "rows" for the `SYNC_PAIRS` delta; both agents already have rows. | **Corrected.** 69 rows today; delta +1. |
| A8 | MEDIUM | `DESIGN.md` is not a file for the majority case — named in two authored templates, written by no manifest entry, produced only by a `ui-ux-designer` dispatch. The earlier fallback ("the implementer declares the values in the code it writes") relocates the decision to N sites, the exact defect row 3 exists to prevent. | **Plan changed.** Row 3 now names two binding sites in priority order: `DESIGN.md` when present, the constitution's `Front-end patterns` when not — a file every project has, and the one A3 requires touching anyway. |
| A9 | LOW | Windsurf headroom measured across 32 bundle-option combinations, 63 emitted workflows, budget 11,700. `specnaut-plan.md` worst case 11,345 — **355 characters of headroom**. Four workflows sit under 200. `specnaut-agent-ui-ux-designer.md` has 2,052, so FR-009's section is comfortable. | **Accepted with the number recorded.** SC-006 is satisfiable, but § 9's "one line by construction" was doing more work than it looked: `specnaut-plan.md` has room for roughly three such lines, ever. |
| A10 | LOW | The precedent asserts `user-invocable: false` and a literal marker sentence; the plan required neither. It also has **two** pointer channels — `skills:` frontmatter and prose — and the plan collapsed them into one. | **Plan changed.** FR-016 and FR-017 added. |

**The finding that matters most, and it is not the CRITICAL.** From the audit,
because paraphrasing it would soften it:

> *A reviewer greps the rule set's wording, gets exactly one authored hit, sees
> SC-005 green and the whole suite green — and concludes the contract is live.
> It is not. No assertion in FR-010 connects "the file exists and is pointed
> at" to "a turn on harness X can load it." Every assertion in the plan is
> about the shape of the templates; none is about reach.*

That is this session's recurring failure class arriving inside my own plan: a
gate that reports clean about a surface it never read. **FR-015 exists because
of it** — render per harness, assert reachability per harness, or declare the
harness uncovered.

## 11. Security audit

`security-expert`, read-only, against this plan. **Verdict: fail** — 0 critical,
2 high, 1 medium, 2 low. One finding changed the plan's own compliance record.

**Coverage, because a verdict is worth what it covered.** Four knowledge-base
files read: triage, README, supply-chain-and-integrity, design-and-business-logic.
**Not read:** `07-data-protection.md`, so the confidentiality half of F1 is
uncited. And a declared gap the seat surfaced rather than papered over: the
shipped security knowledge base states that the **AI/agentic surface — prompt
injection, tool misuse, memory poisoning, excessive agency — is not covered**.
That is precisely the class question 4 asks about, so F4 is labelled a suspicion
and not shipped as a finding. Specnaut's entire product is agent instruction
files; that gap deserves its own backlog item.

| # | Sev | Finding | Disposition |
| :-- | :-- | :--- | :--- |
| F1 | HIGH | FR-003's framework deny-list cannot enforce constitution § XI, and § 7 recorded "Pass" on the strength of it. A deny-list closes over a **finite** set (framework names); § XI protects an **unbounded** one (any unrelated project's name, vendor, host, token). Wrong instrument, and the plan asserted a control that does not exist. | **Plan changed.** FR-013 added — the contract contains **no examples at all**, which is the only allow-list that closes over an unbounded set. FR-003 kept and scoped to the contract file. § 7 row XI rewritten to credit FR-013 + FR-004. The rejected alternative — permit examples behind a declared allow-list vocabulary — is recorded in § 12. |
| F2 | HIGH | Unverified binary self-update (`FetchDownloader.download` → `replaceRunningBinary`, no checksum, no signature) is the trust root for every template this feature ships. | **Accepted, not fixed here, and routed.** Pre-existing; this feature neither creates nor worsens it. Folding it into #576's scope would let an unrelated supply-chain gap gate a template change. Filed separately (§ 12). |
| F3 | MEDIUM | The opt-out's **absent** case fails safe — correctly, the conservative artifact is the responsive one. Its **ambiguous** case was undefined and fails open: desktop-leaning prose near the heading would disable the default silently. | **Plan changed.** FR-005 now requires a literal declaration form and states that anything not matching it is treated as absent. |
| F4 | LOW | The contract becomes an always-on-reachable instruction file in the consuming repo with no scope-limiting clause. Marginal — 285 shipped entries already have identical trust properties. | **Plan changed.** FR-014 adds the scope-limiting sentence, recorded explicitly as a partial mitigation and not a control. |
| F5 | LOW | § 8 concluded that four harnesses "get nothing" on the ground that root `AGENTS.md` is never rewritten — true only **outside** its `chain-stops` fence. The managed-section merge runs independently of the `skipIfExists` plan, so a write path into that file exists on every harness. The placement decision was unstated. | **Plan changed, and it grew.** § 8 now carries the three placement options with their reach and cost, and records that the precedent's own pointer sits outside the fence — so the wiring #575 and #576 both copy already has this hole. Presented at the stop as the architecture decision. |

**Explicitly not findings**, recorded so a gap is distinguishable from a
judgement: no path traversal (the skill name is a manifest-authored constant,
not user input); nothing this feature adds carries `executable: true`; no
destination can clobber a user-edited file under a plain `upgrade` — the
`skipIfExists` guard sits above every write branch and is lock-independent, and
`--force` is an explicit, backing-up escape hatch; "absence means the default is
on" is a fail-**safe**, not a fail-open; and § 5 names one opt-out channel with
its rejected alternatives enumerated, which is correct by construction.

## 12. Open questions and settled decisions

### Decided without asking — one line each, so a wrong assumption is visible

- **The contract is named `mobile-first-contract`.** It covers native too
  (rule 8), so `adaptive-ui-contract` was the more literal name. Rejected:
  "mobile-first" is the term of art an implementer recognises and the words the
  request was made in. The contract's own text carries the native scope.
- **F2 (unverified binary self-update) does not gate this plan.** It is a real
  HIGH and it is the trust root for every template shipped — but it is
  pre-existing, this feature neither creates nor worsens it, and letting a
  supply-chain gap block a template change is how neither gets done. Routed to
  the backlog as its own item.
- **The agentic-surface gap in the shipped security knowledge base is worth its
  own item.** The base declares prompt injection, tool misuse, memory poisoning
  and excessive agency out of scope. Specnaut's entire product is agent
  instruction files. That is a strange place to have a declared blind spot, and
  it is not this feature's job to close.
- **The § XI instrument is FR-013 (no examples), not an allow-list of permitted
  example vocabulary.** The allow-list was the audit's option (b). Rejected: an
  empty permitted set is the only allow-list that provably closes over an
  unbounded risk, and it costs nothing here because FR-002 already states the
  rules as obligations over concepts.
- **The plan does not add a front-end branch to `implement.md`.** Confirmed by
  grep, as the issue body claims: that file has zero front-end content, and
  inventing a branch to hang this on is a larger structural change than the
  feature.

### Open — asked at the stop, one at a time

**Q1 — the placement decision, and with it the feature's reach.** Ordered first
because every other answer depends on it: it decides what FR-015 asserts, what
SC-001 can promise, and whether the item is still M-sized.

**Q2 — scope.** The plan grew during the audits. Whether it ships whole or
splits is Kevin's call, not the plan's.

_Answers recorded here with their date once given._
