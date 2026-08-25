# Tasks: Windsurf workflows ship with editing headroom, and the guard that says so sees every file

**Branch**: `fix/562-windsurf-workflow-headroom` | **Plan**: `plan.md` | **Backlog item**:
[specnaut/specnaut-cli#562](https://github.com/specnaut/specnaut-cli/issues/562)

## Format: `[ID] [P?] [Story] Description`

`[P]` = parallelizable (different files, no dependency on an incomplete task).

## Path Conventions

All paths are relative to `apps/specnaut-cli/` unless they name another repository.

## The order is not a preference — it is FR-003d

**Every red in this breakdown is observed on a real file, never a synthetic one.** That is the whole
reason the sequence is fixed:

1. Widen the enumeration **while the assertion still reads `≤ CAP`**. `specnaut-board.md` goes red
   at 12,539 — the live breach, seen for the first time.
2. Put the content guards in place **before** anything is trimmed. A size guard is satisfied by
   deletion; until FR-009/FR-010/FR-011 exist, nothing can tell a trim from a loss.
3. Split `board/SKILL.md`. Suite green again, breach gone.
4. **Then** introduce the budget. Six more files go red — the headroom problem, seen.
5. Trim those six.

Trimming before step 1 would erase the breach before any assertion had seen it, and the guard that
is supposed to catch it would only ever have been observed failing on a file we broke on purpose.

**Record each observed red in the commit body**: the file, the number, and the assertion that fired.
A green suite is not evidence that an assertion works.

---

## Phase 1: Setup

- [ ] T001 Capture the baseline: run `deno task test` and record the pass/fail counts in
      `.specnaut/specs/028-windsurf-workflow-headroom/baseline.txt`, alongside the worst emitted
      size per workflow over all 32 combinations. This is the artefact every later "observed red" is
      compared against.
- [ ] T002 [P] Confirm `deno fmt --check` is clean before any edit. `deno task test` is
      `bundle && test` and does **not** run it; it has failed in CI on a locally green run before.

---

## Phase 2: Foundational (blocking — nothing else may start)

**Decision homes in play**: _"Which install-parameter combinations a Windsurf size check must
cover"_ → `src/application/ports.ts`. A hand-written list anywhere is the duplication shape this row
forbids.

- [ ] T003 In `src/application/ports.ts`, beside `BundleOptions`, add the **type-derived** parameter
      space: one structure of shape `Record<keyof Required<BundleOptions>, readonly unknown[]>`
      whose values are `KNOWN_BACKLOG_BACKENDS`, `KNOWN_VERSION_SCHEMES`, `KNOWN_SPEC_BACKENDS`
      (imported from `src/domain/installed_lock.ts`, never retyped) and `[false, true]` for
      `specAutogen`. Export a function that computes the cross-product. **`Required<…>` is
      load-bearing**: it is what makes an optional field a compile error rather than a silent
      narrowing. (FR-004, FR-004b)
- [ ] T004 Prove T003's compile error is real: temporarily add a fifth field to `BundleOptions`,
      confirm the parameter-space structure **fails to compile**, then revert. Record what the error
      said. Without this, "a missing key is a compile error" is a claim, not a mechanism. (SC-004)
- [ ] T005 Add a test asserting the cross-product's cardinality is the product of the value-domain
      lengths — today 4 × 2 × 2 × 2 = 32. It must derive both sides, never hard-code 32, or it
      becomes the next thing that stops noticing.

---

## Phase 3: US3 + US3b — the guard sees the whole surface, and the breach is observed (P1) 🎯 MVP

**Independent test criterion**: `deno task test` fails, naming `specnaut-board.md` at 12,539
characters on `backlog=github, spec=cloud, autogen=true` — a file nobody has broken.

- [ ] T006 [US3] In `tests/infrastructure/harness/windsurf_harness_test.ts`, replace the
      hand-written nested loops with the T003 cross-product. Leave the assertion reading
      `≤ WINDSURF_WORKFLOW_MAX_CHARS` for now. Delete the `specBackend: "local"` pin. (FR-003)
- [ ] T007 [US3b] **Run the suite and observe it red.** Expect `specnaut-board.md`, 12,539, over by
      539, on two combinations. Copy the failure message verbatim into the commit body. This is the
      single most important observation in the feature: the suite was green with this shipping.
      (FR-003b, FR-006)
- [ ] T008 [US3] Commit Phase 2 + Phase 3 as one scope —
      `fix(562): measure every install
      combination, not half of them` — with T007's red quoted
      in the body. The tree is red at this commit **on purpose**; T014 makes it green. Note that
      plainly in the body so a bisect does not read it as a broken commit.

---

## Phase 4: US1 (part) — the guards a trim cannot satisfy by deleting things (P1)

**These land before any content is touched.** The only automated check on the six trim targets today
is a size assertion, and removing content always satisfies it.

- [ ] T009 [P] Add an **emitted-workflow count** assertion (today 58, derived from the bundle where
      possible). Three ways to pass a size guard without shortening anything survive otherwise: drop
      the file (`applyBackend` returns `null`), change its destination (the loop filters on
      `.windsurf/workflows/`), or iterate nothing. (FR-009)
- [ ] T010 [P] Add **full-sentence** assertions for every sentence named in `plan.md` §11, across
      `security-expert.md`, `product-owner.md`, `implement.md` and `board/SKILL.md`. Not keywords:
      `assertStringIncludes(c, "shipped")` passes on a mutilated file because the word survives
      elsewhere. `product-owner.md` has **no** content assertions at all today. (FR-010, S5)
- [ ] T011 [P] Add a golden for `implement.md`'s **`spec-backend=cloud`** render.
      `tests/fixtures/implement_local_golden.md` pins the `local` branch — not the one being
      trimmed. Same blind spot as the size guard, one directory over. (FR-010)
- [ ] T012 Mark the two blocks that read as duplication and are not: `security-expert.md`'s Mode 2
      Bash constraint (1,378 chars — the _entire_ limit on an agent whose frontmatter grants `Bash`
      unconditionally) and `implement.md`'s per-language ignore tables (~2,400 chars of
      secret-exclusion patterns whose collapse would land the damage in **consumer** repositories).
      A comment naming why, so the next trim does not have to re-derive it. (FR-011)
- [ ] T013 Observe T010 red: delete one guarded sentence, confirm the named assertion fires,
      restore. Do this for **one sentence per file**, not once overall — an assertion added to the
      wrong file is exactly the failure this step exists to catch. (FR-006)

---

## Phase 5: US3b — the breach is repaired by a split, not a trim (P1)

- [ ] T014 [US3b] Split `templates/core/skills/board/SKILL.md`: move the
      `<!-- BEGIN: spec-autogen=on -->` block (1,187 chars, the entire 1,117-char overshoot) into
      its own companion document. **It is not duplication** — it is the whole cloud-autogen
      instruction, including _"Never fatal to task creation"_ — so FR-008 forbids deleting it to
      fit. (FR-003c)
- [ ] T015 [US3b] A split touches **five** surfaces; walk all five, because one of them fails
      silently: `templates/manifest.json` (new entry) · `src/domain/plugin_coverage.ts`
      (`PLUGIN_COVERED_PATHS_CLAUDE` — this one goes red on its own via
      `tests/domain/plugin_coverage_parity_test.ts`) · **`SYNC_PAIRS` in
      `tests/plugin/plugin_sync_test.ts` — silently green if omitted** · the new emitted workflow
      (58 → 59) and its router reference · the mirrors. #558's split of `merge.md` touched exactly
      these. (A12)
- [ ] T016 [US3b] Re-run: `specnaut-board.md` under the cap on all 32 combinations, suite green.
      Update T009's count assertion for the new file — and note that having to update it is the
      assertion working, not the assertion being in the way.

---

## Phase 6: US1 + US4 — the budget, its message, and one decider (P1/P2)

**Independent test criterion**: a paragraph can be added to any bundled agent without the build
failing on length; when length _is_ the problem, the failure names the file and the deficit.

- [ ] T017 [US1] In `src/infrastructure/harness/windsurf_harness.ts`, add the reserve — **300
      characters, budget 11,700** — beside `WINDSURF_WORKFLOW_MAX_CHARS`. Keep the reserve
      **module-private**; export only the budget, so no call site can spell `MAX - RESERVE` and
      SC-005 is enforced by the module boundary rather than by discipline. Carry the reason: why
      300, what it buys, and **why a number no production code reads lives in production source** —
      its justification is the cap's own comment, and splitting the number from its reason is worse
      than a test-only export. (FR-001, FR-001b)
- [ ] T018 [US1] Add the exported **failure-message builder**: path, measured size, budget, deficit,
      and the install combination. One builder, not a string spelled at each assertion. (FR-007)
- [ ] T019 [US1] Report the **worst remaining headroom across all workflows**, once per run, pass or
      fail. The assertion alone is binary — green until the day it is red — and gives nobody a way
      to see the margin halving. (FR-007b, A10)
- [ ] T020 [US1] Switch the assertion from `≤ CAP` to `≤ BUDGET`. **Observe it red** and record the
      list: expect the five clustered files plus `implement.md`, six in total, 2,027 characters
      minus what T014 already removed. (FR-002, FR-006)
- [ ] T021 [US4] Delete `tests/templates/expert_mechanisms_test.ts:143` and its `SEATS` size loop.
      One assertion decides. What Windsurf reads is the emitted workflow; the raw bundle source
      never lands in `.windsurf/workflows/`, so that site measured something that does not ship —
      wrong unit, 3 seats instead of 58 files, 1 combination instead of 32. (FR-005)
- [ ] T022 [US4] Delete the stale rationale with it: that file claims _"Cascade truncates silently
      at the boundary"_, which `windsurf_harness.ts:40-43` explicitly retracted as unsourced.
      Leaving it behind means it gets cited again. (S6)

---

## Phase 7: US2 — the trims (P1)

**Independent test criterion**: every trim names what the removed text duplicated **and where the
surviving copy is**. A trim that cannot name its surviving copy is not a trim.

- [ ] T023 [US2] Before touching any file, `grep -rl "<name>" tests/` and read what pins it.
      `product-owner.md` — the file that triggered this ticket — is referenced by **26** test files.
      (FR-008b)
- [ ] T024 [P] [US2] Trim `templates/core/agents/specnaut-guide.md` (−253).
- [ ] T025 [P] [US2] Trim `templates/core/agents/security-expert.md` (−251). **Not** the Mode 2 Bash
      block (T012). Fold in S7 while here: the frontmatter announces "Three dispatch shapes" and
      lists two — Mode 3 is missing, and the corrected clause is shorter than the reclaimed
      duplication.
- [ ] T026 [P] [US2] Trim `templates/core/skills/board/groom.md` (−227).
- [ ] T027 [P] [US2] Trim `templates/core/agents/product-owner.md` (−224). No content assertions
      existed here before T010; they do now.
- [ ] T028 [US2] Trim `templates/core/agents/dependency-expert.md` (−215). **Not parallel**:
      `tests/templates/expert_mechanisms_test.ts:60-90` asserts the block _"### The two rules that
      need no catalogue"_ is byte-identical across `performance-expert`, `accessibility-expert` and
      `dependency-expert`. A trim inside it is a **three-file** edit for one file's benefit, and the
      other two are not otherwise in scope. (FR-008b)
- [ ] T029 [P] [US2] Trim `templates/core/skills/specnaut/phases/implement.md` (−18). The blessed
      target is the hook-`condition` non-evaluation rule, ~1,800 chars of genuine self-duplication
      between the pre- and post-hook blocks — collapse the second copy **by reference**, do not
      delete the rule. **Not** the ignore tables (T012).
- [ ] T030 [US2] Each trim commit cites `plan.md` FR-008 and names the surviving copy, using **only
      paths under `apps/specnaut-cli/`** — these records land in public git history, and one citing
      a private-half document would be a § I violation there. (S8)

---

## Phase 8: Polish & cross-cutting

- [ ] T031 `deno task bundle` and commit `src/templates_bundle.ts` in its own `chore(codegen):`
      commit. A stale bundle ships broken binaries.
- [ ] T032 `deno fmt --check`, then `deno task test`. Both. Separately.
- [ ] T033 Mirror `plugin/`: the trims propagate. Note that `SYNC_PAIRS` covers 53 of 62 assets with
      **no completeness test**, and `plugin/skills/board/` does not exist — so `board.md` and
      `board-groom.md` have no plugin mirror to update. Worth its own ticket; not this one.
- [ ] T034 Mirror the monorepo-root `.claude/` copies — **per file, scoped to the trimmed hunks,
      never a blanket copy.** `security-expert.md`, `dependency-expert.md`, `architect-expert.md`
      are byte-identical and need the trim. `specnaut-guide.md` and `product-owner.md` diverge
      deliberately (`scripts/scaffold-drift-allowlist.txt:86,94`) — leave them.
      `.claude/skills/board/SKILL.md` has **165 workspace-only lines** including the public/private
      routing rule — **do not overwrite it**, and do not "fix" the divergence by pushing that
      section into `templates/core/` either: it names the private halves' repo roster. (S3)
- [ ] T035 `deno run --allow-run scripts/check-adoption.ts --from main --to HEAD` — this branch
      carries a `feat`-shaped change to shipped behaviour.
- [ ] T036 Correct #562's body: its measurement table predates #558/#560, and its framing — _"the
      cap itself is guarded … and it is green"_ — is false. Through the `product-owner` agent, never
      inline. (§12)
- [ ] T037 File the two findings this ticket surfaces but does not fix: `SYNC_PAIRS` has no
      completeness test and 9 of 62 plugin assets sit outside it; the monorepo-root `.claude/`
      mirror is guarded by nothing. Both via the `product-owner` agent.

---

## Dependencies & Execution Order

```
Phase 1  Setup
   ↓
Phase 2  Foundational — the derived parameter space        [BLOCKING]
   ↓
Phase 3  US3 + US3b — widen the guard, observe the breach  [tree red on purpose]
   ↓
Phase 4  Content guards — before any trim, not after       [BLOCKING for Phase 7]
   ↓
Phase 5  US3b — split board/SKILL.md                       [tree green again]
   ↓
Phase 6  US1 + US4 — budget, message, one decider          [six files red]
   ↓
Phase 7  US2 — the trims
   ↓
Phase 8  Polish
```

**The one dependency that is easy to get wrong**: Phase 4 must complete before Phase 7. Every other
edge is ordinary sequencing; that one is the difference between a trim and a silent loss.

### Parallel opportunities

- T009 / T010 / T011 — three different test files.
- T024 / T025 / T026 / T027 / T029 — five different template files. **T028 is excluded**: it edits
  three files, two of which are outside the trim set.

### Commit scopes (per `phases/merge-squash.md`)

| Scope                             | Tasks     |
| :-------------------------------- | :-------- |
| `fix(562)` — enumeration          | T003–T008 |
| `fix(562)` — content guards       | T009–T013 |
| `fix(562)` — board split          | T014–T016 |
| `fix(562)` — budget + one decider | T017–T022 |
| `fix(562)` — trims                | T023–T030 |
| `chore(codegen)`                  | T031      |
| mirrors / follow-ups              | T033–T037 |

## Implementation Strategy

**MVP is Phase 2 + Phase 3.** It ships nothing and fixes nothing — it makes the guard tell the
truth, and it turns a 539-character breach from invisible into a failing test. That is the
deliverable this ticket did not know it needed, and it is worth landing on its own if anything
interrupts the rest.

Everything after it is the ticket as filed: room to edit, and files small enough to have it.

## Notes

- **A green suite proves nothing here.** It was green with `specnaut-board.md` 539 characters over
  the cap. Every assertion this feature adds must be seen failing on a real file before it is
  believed.
- **The trims are the dangerous half.** The mechanism work is checkable; a deleted sentence is
  invisible in every subsequent review. Phase 4 exists to make that half checkable too.
