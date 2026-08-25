# Plan: Windsurf workflows ship with editing headroom, and the guard that says so sees every file

**Branch**: `fix/562-windsurf-workflow-headroom` | **Date**: 2026-08-25 | **Backlog item**:
[specnaut/specnaut-cli#562 — "Windsurf workflows ship with no editing headroom — six emitted files sit within 100 characters of the 12,000 cap"](https://github.com/specnaut/specnaut-cli/issues/562)

**This is the feature's one planning document.** Business and technical together, read whole by
whoever implements it.

---

## 1. Why this exists

Windsurf's Cascade caps a workflow file at 12,000 characters. Specnaut emits 58 of them. Five sit
within 100 characters of that cap, which means any routine edit to any of them fails the build, and
the only remedy available at that moment is deleting unrelated content from the same file to buy
characters back.

That happened twice in one day. Working #561, `product-owner.md` had 23 characters of room, so every
character added had to be reclaimed elsewhere in the file — and the reclaimed content (a duplicated
paragraph, a scale already stated in the frontmatter schema, a verbatim-repeated Responsibility
line) had nothing to do with the ticket. `board-groom.md` blew the cap in the same change and needed
the same treatment.

This is a product concern, not a maintainer chore: the cap is Windsurf's, the content is what
Specnaut ships, and a consumer who customises a bundled agent under Windsurf hits the same wall with
no notice until the build fails.

### The measurement, re-taken on this branch's HEAD

**The table in #562's body is stale and must not be used as the baseline.** It was measured before
#558 and #560 split `merge.md`; that file was its worst row at 11,960 and now emits at **7,807**.
Re-measured over `backlogBackend × versionScheme × specBackend` — worst value per path:

| emitted workflow                      |  chars |  left |
| ------------------------------------- | -----: | ----: |
| `specnaut-agent-specnaut-guide.md`    | 11,953 |    47 |
| `specnaut-agent-security-expert.md`   | 11,951 |    49 |
| `specnaut-board-groom.md`             | 11,927 |    73 |
| `specnaut-agent-product-owner.md`     | 11,924 |    76 |
| `specnaut-agent-dependency-expert.md` | 11,915 |    85 |
| `specnaut-implement.md`               | 11,718 |   282 |
| `specnaut-using-specnaut.md`          | 11,444 |   556 |
| `specnaut-board.md`                   | 11,422 |   578 |
| `specnaut-plan.md`                    | 11,345 |   655 |
| `specnaut-agent-architect-expert.md`  | 10,981 | 1,019 |

Those ten rows are the worst values over the parameter combinations **the shipped guard measures**.
Over the combinations the harness actually accepts, the picture is different — see below.

### The second problem, which #562 does not name: the guard is blind to half its surface

`BundleOptions` (`src/application/ports.ts:157`) has **four** fields — `backlogBackend`,
`versionScheme`, `specBackend`, `specAutogen`. The cap guard
(`tests/infrastructure/harness/windsurf_harness_test.ts:141`) loops the first two, pins
`specBackend: "local"`, and never mentions `specAutogen`. It measures 16 of the 32 combinations, and
the half it skips is the half where the files are longest:

| emitted workflow        | measured by the guard | actual worst |    unseen |
| ----------------------- | --------------------: | -----------: | --------: |
| `specnaut-board.md`     |                11,422 |   **12,539** | **1,117** |
| `specnaut-implement.md` |                10,892 |       11,718 |       826 |
| `specnaut-tasks.md`     |                10,175 |       10,505 |       330 |
| `specnaut-review.md`    |                 5,558 |        5,852 |       294 |

**`specnaut-board.md` is over the cap today — 12,539 characters, 539 past Windsurf's limit** — on
`backlogBackend: "github"`, `specBackend: "cloud"`, `specAutogen: true`, on both version schemes.
The guard reports it at 11,422 and passes.

Reachability, stated precisely rather than dramatically: `spec_autogen` is parsed from
`.specnaut/installed.lock` (`src/domain/installed_lock.ts:157`), round-tripped back out (`:216`),
and fed to `mapBundle` on the `upgrade` and `diff` paths
(`src/cli/handlers/upgrade_handler.ts:81,87,153,397,524`; `src/application/diff_project.ts:81`).
**No `init` flag sets it** — `grep -rn "spec-autogen" src/cli/` returns nothing — so today it is
reached by a lock that already carries `spec_autogen: true`, not by a fresh install. That makes the
breach narrow. It does not make it hypothetical: it is a shipped, parsed, round-tripped option, and
a Windsurf user on that combination has been receiving an over-cap workflow with nothing to tell
them.

So this ticket is **not only** a headroom purchase. Raising the bar without widening the enumeration
would ship a stricter number and a _quieter_ guard, and would leave the one genuine breach exactly
as invisible as it is now — the same shape as every other defect this repository has been fixing all
week: **the question is never "is there a guard" but "what does it not look at"**.

## 2. User scenarios

### US1 — A maintainer edits a bundled agent and finds out in time (P1)

**Given** an emitted workflow whose size is inside the reserve band (under 12,000, over the budget)
**When** the test suite runs **Then** it fails, naming the file, its measured size, the budget, and
how many characters must go — and it fails while the file is still legal for Windsurf, so the edit
that triggered it can be kept and the trim planned rather than improvised.

### US2 — The tight files are given room without losing behaviour (P1)

**Given** the files above the chosen budget **When** each is trimmed **Then** every trim removes
something the file **duplicates** — of itself, of its frontmatter, or of a sibling document — and no
instruction, rule or contract sentence is lost. #491 is the precedent and the warning: it showed how
little pure duplication is left in the longest seats.

### US3 — The guard covers the whole install surface (P1)

**Given** the four fields of `BundleOptions`, which is what the harness actually accepts **When**
the cap guard runs **Then** it measures every combination of them — 32, not 16 — and a fifth field
added later cannot silently narrow that coverage.

### US3b — The one file that is over the cap comes back under it (P1)

**Given** `specnaut-board.md` at 12,539 characters on `backlog=github, spec=cloud, autogen=true`
**When** this feature lands **Then** that file is under the budget on **every** combination, and the
guard that says so is the one that failed on it first.

### US4 — One assertion decides the limit (P2)

**Given** two places in the suite that today check a Windsurf size **When** the budget changes
**Then** it changes in one file, and the other site either asks that decision or is gone.

### Edge cases

- **A file cannot be brought under the budget without losing behaviour.** Then the file is too long
  for one workflow, not wrongly measured — split it, as #558/#560 split `merge.md` from 11,960 to
  7,807. See §12 "Decided without asking": there is no excuse list.
- **A trim is applied to `templates/core/` and the mirrors drift.** `plugin/` is guarded by
  `tests/plugin/plugin_sync_test.ts`; the monorepo-root `.claude/` copy is guarded by nothing. See
  §9.
- **The new assertion is green on the current tree for the wrong reason** — a typo in the budget
  arithmetic, a loop that iterates nothing. Covered by FR-006: it must be observed red.
- **`specBackend: "cloud"` is not a shipped default.** It is still a shipped option; a workflow that
  truncates only for cloud-spec users is a defect for those users.

## 3. Requirements

- **FR-001**: The reserved headroom is a **named constant** declared once, beside
  `WINDSURF_WORKFLOW_MAX_CHARS` in `src/infrastructure/harness/windsurf_harness.ts`, with the reason
  written next to it: why this number, and what it is meant to buy. It also carries **one sentence
  saying why a number no production code reads lives in production source** — because the reserve's
  justification _is_ the cap's own comment ("the vendor documents no failure mode above 12,000"),
  and splitting the number from its reason is worse than a test-only export. Precedent: the file
  already exports `workflowLength`, which no `src/` caller uses.
- **FR-001b**: Only the **budget** is exported. The reserve stays module-private, so no call site
  can spell `MAX - RESERVE` and SC-005 is enforced by the module boundary rather than by discipline.
- **FR-002**: The emitted-workflow guard asserts against the **budget**, not the cap.
- **FR-003**: **Every** emitted Windsurf workflow, on **every** combination of the install
  parameters the harness accepts, is at or under the budget. This quantifies over a set; the set is
  enumerated by the guard itself, never by example. The parameters are the fields of `BundleOptions`
  (`src/application/ports.ts:157`) — enumerate them **from the type**, not from what the current
  test happens to loop: today that is `backlogBackend` (4) × `versionScheme` (2) × `specBackend` (2)
  × `specAutogen` (2) = **32** combinations, of which the shipped guard measures 16.
- **FR-003b**: `specnaut-board.md`, which emits at 12,539 characters — **539 over Windsurf's cap** —
  on `backlogBackend: "github"`, `specBackend: "cloud"`, `specAutogen: true`, is brought under the
  budget on every combination. This is a breach repair, not headroom, and it is the reason FR-003
  cannot be deferred to a follow-up.
- **FR-003c**: `board/SKILL.md` is **split, not trimmed** — the plan's own edge case, applied to the
  file that needs it. Its `spec-autogen=on` block is 1,187 characters and contributes the entire
  1,117-character overshoot, but it is **not duplication**: it is the whole cloud-autogen
  instruction, including _"Never fatal to task creation — if spec generation fails … the task stays
  created"_. Removing it to fit is what FR-008 forbids. A split touches the five surfaces in §8's
  manifest row, one of which (`SYNC_PAIRS`) goes silently green if omitted.
- **FR-003d**: **The enumeration fix lands first, in its own commit, observed turning FR-003b red.**
  Both plan audits converged on this ordering independently. Trimming first would make the breach
  disappear before anything had ever seen it, and the assertion that is supposed to catch it would
  never have been observed failing on a real file — only on a synthetic one.
- **FR-004**: The combination set is **derived from the type**, not declared. It is one structure
  keyed by `BundleOptions`' own field names, typed so that **a missing key is a compile error** —
  the shape `Record<keyof Required<BundleOptions>, readonly unknown[]>` — whose values are the
  existing `KNOWN_BACKLOG_BACKENDS` / `KNOWN_VERSION_SCHEMES` / `KNOWN_SPEC_BACKENDS` arrays from
  `src/domain/installed_lock.ts` plus `[false, true]` for the boolean. The cross-product is computed
  from it. A test may not spell its own nested loops over install parameters.

  **Declared once is not derived, and the difference is the whole feature.** A hand-written list of
  combinations produces no compile error and no red test when a fifth field is added — which is
  precisely how `specAutogen` was missed and how the 539-character breach reached production with a
  green suite. A design that enumerates by hand reproduces the defect it exists to remove, one level
  of indirection up.
- **FR-004b**: That structure's home is **beside `BundleOptions` in `src/application/ports.ts`**, or
  a test-support module importing it — **not** the Windsurf harness. `BundleOptions` is consumed by
  all seven harnesses; the parameter space is a property of the port, not of one adapter. Windsurf
  owns the _cap_, not the _parameter space_.
- **FR-005**: Exactly one assertion **decides** the Windsurf size limit. Any other size check either
  asks that decision or is removed. `tests/templates/expert_mechanisms_test.ts:143` is the second
  decider today: it measures `agent(seat).length` — the raw bundle source of three seats, in UTF-16
  code units, without the harness's frontmatter wrapper. Whichever way it goes, the reason is
  written down.
- **FR-006**: The new assertion is **observed failing** against a file deliberately pushed into the
  reserve band, and what was observed is recorded in the commit body. Green on the current tree is
  not evidence.
- **FR-007**: The failure message names the path, the measured size, the budget, the deficit, and
  the install combination it was measured on. It is built by **one exported message builder**, not
  by a string spelled at each assertion — otherwise a surviving second enforcement point writes its
  own wording, and "over the cap" starts naming a budget.
- **FR-007b**: Every run reports the **worst remaining headroom across all workflows**, once, pass
  or fail. The assertion alone is binary — green until the day it is red — and gives no way to see
  that the margin halved. The number costs nothing once FR-007's builder exists, and turns a cliff
  into a slope.
- **FR-008**: Every file over the budget is brought under it by removing duplication only. No
  instruction, rule, threshold or output-contract sentence is lost in a trim.
- **FR-009**: **A size guard is satisfied by deletion, so size cannot be the only assertion.** Three
  ways to pass it without the content being short enough survive the plan as written: drop the file
  (`applyBackend` returns `null` and the entry is skipped — and **no test asserts the emitted
  workflow count**), change its destination (the loop filters on
  `path.startsWith(".windsurf/workflows/")`), or iterate nothing. Before any trim lands, the suite
  asserts the **emitted workflow count** as well as each file's size.
- **FR-010**: **Sentence-level assertions land before the trims, not after.** The only automated
  check on the six trim targets today is a size assertion — a predicate that removing content always
  satisfies. `security_knowledge_base_test.ts` protects nine substrings of `security-expert.md` and
  **nothing at all** of `product-owner.md`; `implement.md`'s golden pins the `local` render, which
  is the branch the trim is _not_ aimed at. Each sentence named in §11 gets an assertion **on the
  full sentence, not a keyword** — `assertStringIncludes(c, "shipped")` passes on a mutilated file
  because the word survives elsewhere — and `implement.md` gets a golden for its
  `spec-backend=cloud` render.
- **FR-011**: **Two blocks are marked "not duplication, do not trim".** `security-expert.md`'s Mode
  2 Bash constraint (1,378 characters; the _entire_ limit on an agent whose frontmatter grants
  `Bash` unconditionally; three near-identical `gh api` snippets that read as self-duplication) and
  `implement.md`'s per-language ignore tables (~2,400 characters of secret-exclusion patterns —
  `.env*`, `*.tfstate*`, `*.key`, `kubeconfig*` — whose collapse into a "universal" set deletes
  exactly the rows that keep credentials out of **consumer** repositories).
- **FR-008b**: A trim may not break a **byte-identity contract**.
  `tests/templates/expert_mechanisms_test.ts:60-90` asserts that the block
  `### The two rules that need no catalogue` is byte-identical across `performance-expert`,
  `accessibility-expert` and `dependency-expert`. `dependency-expert.md` is in the trim set and the
  other two are not, so a trim inside that block is a **three-file** edit for one file's benefit.
  Before trimming any file, `grep -rl "<name>" tests/` and read what pins it: `product-owner.md` —
  the file that triggered this ticket — is referenced by **26** test files.

## 4. Success criteria

- **SC-001**: A maintainer can add a paragraph to any bundled agent or phase document without the
  build failing on length.
- **SC-002**: When length does become the problem, the failure says which file and how much to cut,
  and arrives while the file is still valid for Windsurf.
- **SC-003**: No workflow loses behaviour: every instruction, rule, threshold and output-contract
  sentence present before the trims is present after them.
- **SC-006**: No emitted workflow exceeds Windsurf's cap on any combination the tool can produce —
  which is not true today.
- **SC-004**: Adding a new install parameter cannot narrow the guard's coverage without the change
  being visible in one place.
- **SC-005**: Changing the reserved headroom requires editing exactly one number in one file.

## 5. 🔒 Decision table

| The decision                                                          | Its single home                                                                                                        | What would duplicate it                                                                                                                                                                                                           |
| :-------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How much editing room every emitted Windsurf workflow must keep       | `src/infrastructure/harness/windsurf_harness.ts` — one exported constant, with the budget derived beside it            | A literal `11_800`/`11_500` in a test; a per-file allowance table; `MAX - 200` written at a call site; the number restated in a prose comment elsewhere                                                                           |
| Which install-parameter combinations a Windsurf size check must cover | `src/infrastructure/harness/windsurf_harness.ts` — one exported list, derived from `BundleOptions` rather than retyped | A test spelling its own nested `for` loops — exactly what pinned `specBackend: "local"`, omitted `specAutogen`, and hid a 539-character breach; a second list in another test; a comment claiming coverage the loop does not have |
| Whether a given workflow is too long                                  | `tests/infrastructure/harness/windsurf_harness_test.ts` — the one assertion that decides it                            | `tests/templates/expert_mechanisms_test.ts:143`, which decides the same thing on a different measure (raw source, UTF-16, three seats) and can therefore disagree; any future per-seat length check                               |
| What unit a workflow is measured in                                   | `workflowLength` in `src/infrastructure/harness/windsurf_harness.ts` (already the home; unchanged by this feature)     | `String.length` at a call site; `TextEncoder().encode(…).length`; `[...s].length` re-spelled inline                                                                                                                               |

A rule with two genuine enforcement points names the one place the decision is made and records that
both **ask** it. Rows 1 and 2 are asked by every size check; row 3 is the one where two **deciders**
exist today, which is why FR-005 exists.

## 6. Technical context

**Language/Version**: TypeScript on Deno (see `deno.json`) **Primary Dependencies**: `@std/assert`,
`@std/yaml` — no new dependency **Storage**: N/A **Testing**: `deno task test` (which is
`deno task bundle && deno test …`) plus `deno fmt --check`, which `deno task test` does **not** run
and which has failed in CI on a green local run before **Target Platform**: the CLI's own test
suite; the artefact is what `specnaut init --ai windsurf` writes into `.windsurf/workflows/`
**Project Type**: cli **Performance Goals**: N/A **Constraints**: Windsurf Cascade caps a workflow
file at 12,000 **characters** (#539 settled the unit). The vendor documents no failure mode above it
— not truncation, not an error, not rejection. Stay under; do not rely on what happens above.
**Scale/Scope**: 58 emitted workflows; **4** install parameters ⇒ 32 combinations; 6–10 files to
trim depending on §12.

### Domain model

No new entities. Three existing concepts get sharper names:

- **Bounded context**: the Windsurf harness — the only place that knows what Cascade accepts.
- **Vocabulary**: **cap** = Windsurf's 12,000, not ours to change. **reserve** = the room we keep
  back. **budget** = `cap − reserve`, the number a file is actually held to. Three words for three
  different things, and the current code has a name for only one of them, which is part of why the
  other two were spelled as literals and loops.
- **Invariants**: `0 < reserve < cap`; every emitted workflow ≤ budget on every combination; the
  budget is derived, never written down twice.

## 7. Constitution check

| Principle                              | Verdict | Note                                                                                                                                                                          |
| :------------------------------------- | :------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. OSS / proprietary boundary          | pass    | Public half only. Nothing from Cloud is read, named or referenced.                                                                                                            |
| II. Single bridge is the HTTP contract | pass    | No cross-half call.                                                                                                                                                           |
| III. Monorepo holds no product code    | pass    | All product changes land in `apps/specnaut-cli/`. The workspace `.claude/` copies are mirrors, not product (§9).                                                              |
| IV. Cross-cutting change discipline    | pass    | One commit in the CLI half, one pointer commit in the monorepo, submodule pushed first.                                                                                       |
| V. Merge defaults — local by default   | pass    | Local `--ff-only` via `scripts/land.sh cli <branch>`. Not risky enough for `--pr`.                                                                                            |
| VI. Centralised backlog routing        | pass    | The card move went through the `product-owner` agent; the close will too.                                                                                                     |
| VII. Submodule autonomy                | pass    | The CLI's own conventions apply inside it.                                                                                                                                    |
| VIII. Documentation conventions        | pass    | No version number, release date or shipping count is pinned in long-lived prose. The measurement table above is inside a dated spec, which is a record, not a long-lived doc. |
| IX. Dogfooding clause                  | pass    | This ran through `/specnaut plan`.                                                                                                                                            |
| X. Epic status mirrors child progress  | pass    | #562 is a standalone item, not an epic.                                                                                                                                       |
| XI. Consumer agnosticism               | pass    | No project that uses Specnaut is named, implied, or made identifiable. The only third party named is Windsurf, whose cap this is.                                             |

### Complexity tracking

No violations to justify.

## 8. Surface impact

| Surface                                                                 | Touched?                                    | What changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| :---------------------------------------------------------------------- | :------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Windsurf harness (`src/infrastructure/harness/windsurf_harness.ts`)     | yes                                         | Two exports added: the reserve constant (+ derived budget) and the install-combination list. `workflowLength` and the cap constant are unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `tests/infrastructure/harness/windsurf_harness_test.ts`                 | yes                                         | The cap assertion becomes a budget assertion and consumes the shared combination list.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `tests/templates/expert_mechanisms_test.ts`                             | yes                                         | Its second decider is resolved per FR-005.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Bundled agents / skills / phase docs under `templates/core/`            | yes                                         | Content trims only, on the files over budget.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `plugin/agents/`, `plugin/skills/`                                      | yes                                         | Byte-identical mirrors of the trimmed files. Guarded by `tests/plugin/plugin_sync_test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/templates_bundle.ts`                                               | yes                                         | Regenerated by `deno task bundle`. Never hand-edited.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `templates/manifest.json`, `src/domain/plugin_coverage.ts`              | **no**                                      | No file is added or removed — only content changes. Verify rather than assume.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Other harnesses (claude, cursor, codex, copilot, opencode, antigravity) | no                                          | They have no length cap. They do receive the trimmed content, which is why FR-008 forbids removing behaviour.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Monorepo-root `.claude/agents/`, `.claude/skills/`                      | yes, downstream, and **not byte-identical** | Measured, not assumed. `security-expert.md`, `dependency-expert.md`, `architect-expert.md` **are** identical and would go stale silently. `specnaut-guide.md` (8 lines) and `product-owner.md` (781 lines) diverge **deliberately**, recorded with reasons in `scripts/scaffold-drift-allowlist.txt:86,94`. And `.claude/skills/board/SKILL.md` has **165 lines that exist only in the workspace copy** — including the whole _"Visibility is chosen by `--repo`"_ section, the rule that decides whether a ticket is filed on a public or a private repo. Not guarded by any test. See §9. |
| Public CLI behaviour at runtime                                         | no                                          | No shipped command changes. `specnaut init --ai windsurf` writes shorter files with the same instructions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

### Documentation (this feature)

```text
.specnaut/specs/028-windsurf-workflow-headroom/
├── plan.md    # This file — the whole plan
└── tasks.md   # derived from THIS file once approved
```

## 9. Risks

| Risk                                                                                                                                                                       | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| :------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A trim removes behaviour while looking like duplication. The longest seats are the ones #491 already mined, so what is left is not obviously redundant.                    | FR-008 plus a per-trim record: each trim names what the removed text duplicated and where the surviving copy is. A trim that cannot name its surviving copy is not a trim.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| The reserve is set, the six files are trimmed, and normal work refills the room within weeks — the ticket's problem returns with a stricter number.                        | The failure now arrives 200+ characters early instead of at the cliff, which is the whole deliverable. This is a mitigation of severity, not of recurrence; recurrence is expected and cheap.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| The chosen reserve puts a file inside the band that the guard still cannot see.                                                                                            | FR-003/FR-004 widen the enumeration from 16 combinations to all 32 in the same change. This is why the enumeration fix is not a separate ticket — without it, the one file that is actually over the cap stays invisible behind a stricter number.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| The trim needed for `specnaut-board.md` is 539 characters plus the reserve — far more than the other files — and the board skill is dense with backend-conditional blocks. | Its size is driven by a conditional block (`spec-autogen=on`, +1,117 characters, rendered only when `specAutogen && specBackend === "cloud"`). Trim inside that block first: it is the content that pushes the file over, and it is the content no other combination sees.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| The monorepo-root `.claude/` copies go stale — **and the obvious remedy is worse than the problem**.                                                                       | A blanket "drift sweep and re-copy" would overwrite `.claude/skills/board/SKILL.md` with the shipped template and **delete its 165 workspace-only lines**, including the public/private routing rule (_"could a stranger read this and learn something that is none of their business?"_). Losing it files maintainer paperwork — vendor enrolments, billing, credential provisioning — world-readable on the public half: the same class as the leak this workspace already remediated once. So: **per-file, scoped to the trimmed hunks only**, never a blanket copy. Re-copy the three byte-identical agents; leave the two allowlisted ones and the board skill alone. And **do not** resolve it the other way either — pushing the visibility section into `templates/core/` would put the private halves' repo roster in the public template, which is a § I violation in its own right. The divergence is deliberate and must stay one. |
| `deno fmt --check` fails in CI on a locally green run — it is not part of `deno task test`.                                                                                | Run `deno fmt --check` explicitly before landing. This has already bitten once, on #548.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| The new assertion is green because it measures nothing.                                                                                                                    | FR-006: observed red against a deliberately over-budget file, and the observation recorded.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

## 10. Architecture audit

_Findings from the `architect-expert` run against THIS document, before any code existed._

| #                    | Finding                                                                                                                                                                                                                                                                                                                                                             | What was done                                                                                                                                                                                                                                                                                                        |
| :------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 (HIGH)            | FR-007's failure-message contract has no row in §5. If a second enforcement point survives, it writes its own wording — no path, no deficit, no combination, and the word "cap" for a budget.                                                                                                                                                                       | **Plan changed.** §5 gained a row; FR-007 now requires one exported message builder.                                                                                                                                                                                                                                 |
| A2 (MED)             | FR-008 — the rule governing what counts as a legitimate trim, across 6–10 files — has no home in §5. §9 put it in a per-trim commit note, which is a home with no reader.                                                                                                                                                                                           | **Plan changed.** §5 gained a row naming this document as the home, cited by each trim commit.                                                                                                                                                                                                                       |
| A3 (HIGH)            | The mirror set has no row and §8 stated it wrongly. `plugin/` holds 62 `.md` assets, `SYNC_PAIRS` covers 53, **9 are unguarded**, there is no completeness test, and **`plugin/skills/board/` does not exist** — so two of the tightest files have no plugin mirror at all.                                                                                         | **Plan changed.** §5 gained a row; §8's plugin row rewritten with the counts; `SYNC_PAIRS` added as its own surface. Verified independently: 62 assets, no `board` directory.                                                                                                                                        |
| A4 (CRITICAL)        | `BundleOptions` has **four** fields, not three. The guard measures 16 of 32 combinations, and `specnaut-board.md` ships **539 characters over the cap**, green. §1's "not a breach repair" was false.                                                                                                                                                               | **Already corrected before this audit returned** — found by re-measuring the plan's own baseline rather than copying #562's table. Recorded here because the audit reproduced the 12,539 figure independently, which is what makes it evidence rather than a claim.                                                  |
| A5 (MED)             | Agrees the reserve belongs in the harness — but only after the case against it is made, and the plan asserted the home with no defence. Also: export the budget, keep the reserve module-private, so SC-005 is enforced by the module boundary rather than by discipline.                                                                                           | **Plan changed.** FR-001 now carries the justification sentence; FR-001b makes the reserve module-private.                                                                                                                                                                                                           |
| A6 (CRITICAL)        | The combination list, as specified, **cannot satisfy its own SC-004**. A hand-written list produces no compile error when a field is added — which is exactly how `specAutogen` was missed. "Declared once" is not "derived". And its home was wrong: `BundleOptions` serves seven harnesses, so the parameter space is a property of the port, not of one adapter. | **Plan changed — this is the audit's most valuable finding.** FR-004 respecified as a type-derived structure keyed by `keyof Required<BundleOptions>`, values from the `KNOWN_*` arrays; FR-004b moves its home beside `BundleOptions`. §5 row 2 rewritten.                                                          |
| A7 (HIGH, predicted) | Three cycles on, a fifth parameter ships, nobody edits the list, and the guard measures half the space again — the same sentence this plan writes about #562, with a different parameter name.                                                                                                                                                                      | **Plan changed** — this is what A6's fix prevents; the compile error is the mechanism.                                                                                                                                                                                                                               |
| A8 (MED, predicted)  | If the second decider stays, it measures raw source in UTF-16 against a budget derived for characters of a wrapped, rendered artefact. They will diverge on the first astral character, and someone will trim a real instruction to satisfy a test that never measured what ships.                                                                                  | **Deferred to the stop** — this is open question 2. FR-005 already requires the reason to be written down; if the answer is "keep it", it must record _what it measures instead_.                                                                                                                                    |
| A9 (HIGH)            | The root mirror has already drifted on two of five files checked.                                                                                                                                                                                                                                                                                                   | **Objection accepted with a correction.** Verified: both drifts are **deliberate** and recorded per-entry in `scripts/scaffold-drift-allowlist.txt:86,94`. The real exposure is the _identical_ three, which would go stale silently. §9 rewritten accordingly — and see S3, which found the far worse half of this. |
| A10 (LOW)            | The assertion is binary — green until the day it is red. Nothing makes _approach_ visible; a reviewer cannot see that the median headroom halved.                                                                                                                                                                                                                   | **Plan changed.** FR-007b reports worst remaining headroom once per run, pass or fail. Cheap once the message builder exists, and it turns a cliff into a slope.                                                                                                                                                     |
| A12 (HIGH)           | §8's "manifest/coverage untouched" is true on its stated premise (verified: neither stores a hash or a length) but **false for the split fallback the plan itself makes mandatory**. A split touches five surfaces; `SYNC_PAIRS` is one §8 never listed, and omitting it goes silently green.                                                                       | **Plan changed.** §8's row now states the premise and the exception with all five surfaces. FR-003c makes the split concrete for `board/SKILL.md`.                                                                                                                                                                   |
| —                    | A stale prose number in `merge_squash_by_scope_test.ts:25` ("11,960 characters against a 12,000 cap").                                                                                                                                                                                                                                                              | **Objection declined, with reason.** Read in context it is past tense recording _why_ #558 extracted the file — an accurate historical cause, not a live claim. Constitution § VIII governs long-lived prose docs pinning current state; this is a code comment recording a past one.                                |

**Verdict**: **FAIL** — do not proceed to `tasks` as written. Two blocking findings, A4 and A6.
**Coverage**: `plan.md` whole; `windsurf_harness.ts` in full; `ports.ts:157-230`;
`spec_autogen_filter.ts`, `backlog_filter.ts`, `conditional_render.ts`; `plugin_coverage.ts` in
full; `manifest.json`; three test files in full; `board/SKILL.md` marker structure; five agent files
diffed against the root mirror. It independently reproduced `specnaut-board.md = 11,422` by
simulating the render, which is what gives the 12,539 figure its weight. **Not covered**: the suite
was not run, the other 57 workflows were not re-measured, and no judgement was made on whether any
specific trim is achievable — that is FR-008's content question, not an architecture one.

Both blocking findings are now addressed in this document. The verdict is recorded as it was given;
it is not re-run here, because a seat that grades its own corrections is not a second opinion.

## 11. Security audit

_Findings from the `security-expert` run against THIS document, in parallel with the architecture
audit. Kept separate on purpose — the two answer different questions._

| #         | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | What was done                                                                                                                                                                                                                                   |
| :-------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1 (HIGH) | A shipped workflow is already 539 characters over the vendor cap and the guard reports it passing. Independently measured over all 32 combinations against the committed bundle. If Cascade truncates, what is lost is the file's **tail** — which it extracted: the scope-confinement rule _"The user asks about another project's backlog — this skill is wired to this project only."_                                                                                                                                                                                                                                                                                           | **Plan changed** (already corrected before the audit returned; confirmed independently here). FR-003b, and FR-003d makes the enumeration fix land first so this is observed turning red.                                                        |
| S2 (HIGH) | The plan enumerated three install parameters where four exist, reproducing in its own measurement the exact narrowing it was written to fix.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | **Plan changed** — §1, §6, US3 and the baseline table all corrected to four.                                                                                                                                                                    |
| S3 (HIGH) | **§9's prescribed remedy would have destroyed a real control.** The root mirror is not byte-identical: `.claude/skills/board/SKILL.md` has 165 workspace-only lines, including the entire _"Visibility is chosen by `--repo`"_ section — the rule that decides whether a ticket goes to a public or a private repo. A blanket "drift sweep and re-copy" deletes it, and the failure mode is maintainer paperwork (vendor enrolments, billing, credential provisioning) filed world-readable on the public half. It also names the wrong fix in the other direction: pushing that section into `templates/core/` would put the private halves' repo roster into the public template. | **Plan changed — this is the audit's most valuable finding, and it is a defect I wrote.** §8's mirror row and §9's risk row both rewritten: per-file, scoped to the trimmed hunks, never a blanket copy, and the divergence stays a divergence. |
| S4 (HIGH) | FR-008 and SC-003 forbid losing behaviour and **nothing mechanical enforces either**. The only automated check on the trim targets is a size assertion — a predicate deletion always satisfies. `plugin_sync_test.ts` _propagates_ a trim rather than catching it. `product-owner.md` has no content assertions at all. `implement.md`'s golden pins the `local` render — not the branch being trimmed.                                                                                                                                                                                                                                                                             | **Plan changed.** FR-010 puts sentence-level assertions and the cloud-render golden **before** any trim; FR-011 marks the two blocks that read as duplication and are not.                                                                      |
| —         | Three further ways to satisfy a size guard without shortening anything: drop the file (no test asserts the emitted count), move its destination, iterate nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | **Plan changed.** FR-009 adds the emitted-count assertion. This is the same finding as A6 arriving through a different door: _a guard is only worth what it does not let through._                                                              |
| S5 (MED)  | The guards that do exist are single-keyword substring checks. `assertStringIncludes(c, "shipped")` passes on a mutilated sentence because the word survives elsewhere; `"never emit a secret value"` protects the heading and not _"Never the value, not truncated, not partially masked"_ or _"Recommend rotation at the issuer"_.                                                                                                                                                                                                                                                                                                                                                 | **Plan changed.** FR-010 requires full sentences, not keywords — and names this as what makes S4 tractable at all.                                                                                                                              |
| S6 (MED)  | The two size deciders carry **contradictory rationales**: `expert_mechanisms_test.ts` asserts Cascade truncates silently; `windsurf_harness.ts:40-43` explicitly retracted that as unsourced. S1's impact assessment depends on which is right.                                                                                                                                                                                                                                                                                                                                                                                                                                     | **Plan changed.** FR-005's resolution must correct or delete the stale claim in the same commit, whichever way the open question goes.                                                                                                          |
| S7 (LOW)  | `security-expert.md`'s frontmatter announces "Three dispatch shapes" and lists two — Mode 3, the mode that produced this audit, is missing from the routing surface a dispatcher reads.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | **Accepted, folded into the trim commit.** The corrected clause is shorter than the reclaimed duplication, so the file with 49 characters of room can afford it.                                                                                |
| S8 (LOW)  | The per-trim justification records land in **public** commit history; one citing a private-half document as the surviving copy would be a § I violation in git history — an incident needing a rewrite, not a revert.                                                                                                                                                                                                                                                                                                                                                                                                                                                               | **Plan changed.** §9's record must cite only paths under `apps/specnaut-cli/`.                                                                                                                                                                  |

**The sentences that must survive any trim**, named by the audit and carried here so the implementer
does not have to re-derive them — `security-expert.md`: the Mode 2 Bash constraint, the eight
always-check rules, _"Do NOT auto-close the alert"_, the `NOT RUN`/`SEATS_REPORTED: 0` pairing, the
domain-file-wins tiebreak, and severity-before-adjustment. `product-owner.md`: _"If more than one
signal is present, ask the user which is canonical before mutating anything"_, _"Public API only."_,
_"Never delete task files"_, the `⚠ classification incomplete` rule, the `cascade-check.sh`
exit-code gate, and `P2` for correctness/security. `implement.md`: the hook-`condition`
non-evaluation rule, the ignore tables, and _"Freeze the tree."_ `board/SKILL.md`: _"Never fatal to
task creation"_ and the scope-confinement rule in its tail.

**Verdict**: **FAIL** — four HIGH, one of them a shipped breach the plan asserted did not exist.
**Coverage**: the plan; the harness and both guards; `BundleOptions` and its lock-file parse
(checked fail-closed and correct — `root.spec_autogen === true` is strict identity); the six trim
targets plus `board/SKILL.md`; the tests that guard them; the root board mirror diffed line by line;
all 32 combinations measured against the committed bundle. **Not covered**: the other 51 emitted
workflows for content-loss risk, the `plugin/` mirror's own contents, the other six harnesses, and
seven of its own domain files that nothing in scope routed to.

**Q4, answered with its coverage**: nothing. There is no authentication, session, token, tenant or
account anywhere in scope — the harness makes no network call and touches no credential,
`BundleOptions` carries no principal, and the emitted artefacts are Markdown written by the user's
own `init` into the user's own repository.

## 12. Open questions

### The reserve, costed against the true worst case

All four install parameters, 32 combinations, measured on this branch's HEAD. "To cut" is the total
across every file over the budget; the single worst cut is always `specnaut-board.md`, which starts
539 characters over the cap rather than under it.

| reserve | budget | files to trim | chars to cut | worst single cut | the next file's real slack                                                 |
| ------: | -----: | ------------: | -----------: | ---------------: | :------------------------------------------------------------------------- |
|     200 | 11,800 |             6 |        1,409 |    739 (`board`) | `implement` clears by 82                                                   |
|     300 | 11,700 |             7 |        2,027 |    839 (`board`) | `using-specnaut` clears by 256                                             |
|     500 | 11,500 |             7 |        3,427 |  1,039 (`board`) | `using-specnaut` clears by 56 — it becomes the next tight file immediately |
|   1,000 | 11,000 |             9 |        7,716 |  1,539 (`board`) | `architect-expert` clears by 19                                            |

The last column is the one that decides it. A reserve is only worth what the _next_ file has left:
at 500 the eighth file has 56 characters of room, which is the state this ticket exists to end,
arriving one file further down the list.

| Question                                                                                                                  | Answer                          | Date |
| :------------------------------------------------------------------------------------------------------------------------ | :------------------------------ | :--- |
| What should the reserved headroom be?                                                                                     | _(pending — asked at the stop)_ |      |
| Does `tests/templates/expert_mechanisms_test.ts:143` fold into the one decider, or stay as a deliberately separate check? | _(pending — asked at the stop)_ |      |

Both audits added weight to the second question. The architect (A8) predicts the two measures
diverge on the first astral character and someone then trims a real instruction to satisfy a test
that never measured the shipped artefact. The security seat (S6) found that the two sites carry
**contradictory rationales** — one asserts Cascade truncates silently, the other explicitly
retracted that claim as unsourced. Whichever way the question goes, the stale rationale is corrected
in the same commit.

### Decided without asking

- **No excuse list.** #562's acceptance criteria allow "or each is individually excused with a
  written reason". Rejected: an excused file is a file with zero headroom plus a note saying so,
  which is the state this ticket exists to end, and an allowlist entry is a pinned defect that
  outlives everyone who understood it. A file that cannot fit the budget without losing behaviour is
  too long for one workflow — split it, as `merge.md` was.
- **The reserve is one number for all workflows, not per-file.** A per-file allowance is the
  duplication shape named in the decision table's first row, and it makes the budget unreadable.
- **The enumeration fix is folded into this ticket rather than filed separately.** It is not a
  pre-existing defect the branch happened to expose — it is the same defect wearing a different
  face: a size guard that does not measure what ships. Fixing the number without fixing the
  enumeration would ship a stricter guard that sees less, and would leave the one real breach
  invisible.
- **The breach repair keeps #562's id, not a new one.** `phases/merge-squash.md` says a fix to a
  pre-existing defect the branch merely _exposed_ takes its own backlog id. This is not that: the
  guard's blind spot and the missing headroom are one defect, found by doing #562's own measurement
  properly. It gets one commit, and #562's id.
- **#562's body will be corrected, not silently superseded.** Its measurement table predates
  #558/#560 and its framing ("the cap itself is guarded … and it is green") is now known to be
  false. A comment on the issue records the re-measurement and the breach before this lands.
- **The trims are one commit per scope, per `phases/merge-squash.md`** — and the order is fixed by
  FR-003d: the enumeration fix first, observed turning the `board.md` breach red; the guard
  hardening (FR-009/FR-010/FR-011) second; the trims and the `board/SKILL.md` split last. Trimming
  first would erase the breach before anything had seen it.
- **`board/SKILL.md` is split, not trimmed.** Both audits reached this independently and FR-008
  forbids the alternative: its `spec-autogen` block is the whole cloud-autogen instruction, not
  duplication. Recorded here rather than asked, because it is a consequence of a rule already in the
  plan, not a free choice — but it is the largest single change in the feature, so it is flagged at
  the stop.
- **Per-trim justification records cite only paths under `apps/specnaut-cli/`** (S8). They land in
  public commit history.
- **The baseline table is re-measured, not copied from the issue.** The issue's table predates
  #558/#560. The code is the present; a document is a claim about the past.
