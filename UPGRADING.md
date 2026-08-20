# Upgrading Specnaut

## 1.x → 2.0.0

### At a glance

| Before                                                | After                                                 |
| :---------------------------------------------------- | :---------------------------------------------------- |
| 9 chainable phases                                    | **5** — `plan → tasks → implement → review → merge`   |
| 5 chain flags                                         | **1** — `--manual`                                    |
| up to 8 files per feature                             | **2** — `plan.md` + `tasks.md`                        |
| stops when clarification is needed, then before merge | **exactly 2** — end of `plan`, and the review verdict |

Run `specnaut upgrade` in each scaffolded project; it removes the files this version no longer
ships. Nothing migrates your existing spec directories — they are left on disk untouched.

### Phases that no longer exist

An old phase name now prints the phase index and stops. There are no aliases — this is a clean
break.

| Gone                    | Where its work happens now                                                                       |
| :---------------------- | :----------------------------------------------------------------------------------------------- |
| `/specnaut brainstorm`  | `/specnaut plan`, step 1 — the discovery dialogue, run only when the input is too vague to plan. |
| `/specnaut specify`     | `/specnaut plan` — the same document, sections 1–4.                                              |
| `/specnaut clarify`     | `/specnaut plan`, step 8 — questions asked one at a time at the stop, before any code exists.    |
| `/specnaut analyze`     | **Replaced, not moved.** See below.                                                              |
| `/specnaut checklist`   | `plan.md`'s success criteria and decision table.                                                 |
| `/specnaut list-skills` | Read `.specnaut/installed.lock` directly.                                                        |

The chain is now:

```
plan → tasks → implement → review → merge
```

### Flags that no longer exist

`--once`, `--continue`, `--lite` and `--full` are removed, along with the lite-chain concept and the
`lite-heuristic` contract doc. **`--manual` is the only surviving flag.**

Re-entry needs no flag: invoking a phase whose downstream artefacts already exist runs one-shot;
invoking one whose downstream artefacts are absent chains. `workflow_shape` is gone from
`.specnaut/feature.json`; an existing file carrying it is ignored, not an error.

### Artefacts: eight files down to two

A feature now produces exactly `plan.md` and `tasks.md`.

`spec.md`, `research.md`, `data-model.md`, `quickstart.md`, `contracts/` and `checklists/` are no
longer generated, and `spec-template.md` and `checklist-template.md` no longer ship. Where their
content matters it lives in `plan.md` — the domain model in section 6, interface contracts in
section 8.

**Your existing spec directories are left on disk untouched.** Nothing migrates them, and the `plan`
phase reads whatever is there without failing. Migrate them by hand if you want the new shape, or
leave them; they are a record of work already done.

### What replaces the rigour that was removed

This is the part a shorter phase list hides. `analyze` was **replaced**, not dropped.

With one planning document there are no artefacts left to hold in agreement, so a cross-artefact
consistency check has nothing to check. Its successor runs _earlier_ and costs less:

- **A binding decision table** in `plan.md` — every rule the feature introduces, its **single home**
  (a file path, never a layer), and what would count as a second spelling. The implementer may not
  move a decision out of its home without the plan being amended first.
- **Two audits of the plan itself**, dispatched concurrently **before a line of code exists** —
  `architecture-auditor` and `security-auditor`. Their findings are written back into `plan.md`:
  either the plan changes, or it records why the objection was accepted.

Architecture found at review time is architecture rebuilt. This moves that discovery to where
changing your mind is still free.

### Two stops, and no third

The chain stops at exactly two points: the **end of `plan`**, where you approve the architecture and
answer the open questions, and the **review verdict**, which _is_ the merge request. Every other
boundary is crossed automatically.

Only a CRITICAL or HIGH finding buys another fix cycle; MEDIUM and LOW go to the backlog and the
branch ships.

### Merge now squashes by scope

`/specnaut merge` performs the squash itself: **one commit per scope**, not one per branch. The
feature, its generated artefacts, unrelated configuration, docs, and any fix to a pre-existing
defect each get their own commit — the last one carrying **its own** backlog id, not the feature's.

If your default branch is protected, the local fast-forward path will not work; the phase does not
implement a forge-side path.

### `AGENTS.md` on upgrade

`AGENTS.md` is yours. `specnaut upgrade` does not rewrite it, and does not reorder it. But the
two-stop rule above only works from a file that is always in context, so the one section Specnaut
owns is delivered as a fenced block:

```markdown
<!-- --- Specnaut: chain-stops --- -->

## The Specnaut chain has exactly two stops

...

<!-- --- End Specnaut: chain-stops --- -->
```

Appended to the end if your file has no such block; replaced in place if it does. Everything around
it stays byte-identical, the fences are Markdown comments so nothing renders, and the run prints one
line naming what it did. Re-running changes nothing. Delete the block and the next upgrade restores
it — that is the only section on the file Specnaut claims.

Declaring `AGENTS.md` in `.specnaut/preserve.yml` freezes it completely: the section is not
delivered either, and `--force` does not change that. `--reset-preserved` is the only way through.

One related fix: an upgrade no longer records a pre-existing `AGENTS.md` in
`.specnaut/installed.lock`. It used to adopt the file it had just decided not to write, which made
every later run report your own document as "customized locally" — and let `--force` replace it with
the template.
