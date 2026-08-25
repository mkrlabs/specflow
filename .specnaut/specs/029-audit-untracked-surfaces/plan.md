# Plan: the coverage gate sees a surface file before it is committed, not after

**Branch**: `fix/564-audit-sees-untracked-surfaces` | **Date**: 2026-08-26 | **Backlog item**:
[specnaut/specnaut-cli#564 — "audit.sh is blind to untracked files, so a brand-new surface file passes the coverage gate"](https://github.com/specnaut/specnaut-cli/issues/564)

**This is the feature's one planning document.** Business and technical together, read whole by
whoever implements it.

> **Citation convention.** This document cites `audit.sh` by **anchor**, never by line number — "the
> `CHANGED=` assignment", "the final `if` before `exit 1`". The first draft inherited `audit.sh:181`
> and `audit.sh:671` from the ticket and both were already wrong on this branch: `:181` is a
> `SURFACES` entry, i.e. the one region FR-007 forbids touching, and a reader following the citation
> would have landed inside it. Anchors are the only citation that survives the next split.

---

## 1. Why this exists

`scripts/smoke/audit.sh` answers one question: _does every user-visible surface file that changed
since the last release have a smoke assertion naming it?_ It collects the changed set with a single
`git diff --name-only --diff-filter=AMR "$SINCE..HEAD"` (the `CHANGED=` assignment). That compares
two **commits**. A file that has never been committed is in neither, so it is not collected, not
mapped, and not judged.

The window in which that matters is exactly the window the gate exists for. A wholly new surface
file has no assertion by definition — it is a coverage gap from the moment it is created — and the
gate stays silent for the whole time it is being written, then goes red once it lands, which is
after the cheapest moment to fix it has passed.

### The measurement, re-taken on this branch's HEAD

Not inherited from the ticket. Taken on `fix/564-audit-sees-untracked-surfaces` at `7f2d11e`:

| tree state                                                                        | `audit.sh` rc | gaps reported |
| :-------------------------------------------------------------------------------- | ------------: | ------------: |
| clean                                                                             |             0 |             0 |
| `templates/core/agents/probe-untracked-564.md` created, uncommitted, no assertion |         **0** |         **0** |

The second row is the defect: a bundled agent that no smoke names, sitting under a mapped surface
glob (`templates/core/agents/*`), and the gate prints `0 coverage gap(s)` and exits 0. Committing
the same file makes it red. Nothing about the file changed — only whether git had recorded it.

This is the family #544–#547, #549 and #562 all belong to: **the gate reports coverage that does not
exist**, and the defining question is _what can this check not see?_ Here the answer is the newest
files on the surface it guards.

### Where the new path can actually fire — counted, because it changes what "done" means

| Caller                                                                            | Tree      | Can the new collection be non-empty?                                                                  |
| :-------------------------------------------------------------------------------- | :-------- | :---------------------------------------------------------------------------------------------------- |
| `scripts/smoke/run-all.sh` (runs the audit **last**)                              | real      | **yes** — local developer runs                                                                        |
| `.specnaut/release/preflight.sh`                                                  | real      | **no** — its `git status --porcelain` gate aborts on any untracked file _before_ the audit is invoked |
| `scripts/smoke/smoke-toolbox.sh` (drift probe)                                    | real      | **no** — its probe file lives in `scripts/smoke/`, outside all four prefixes                          |
| `scripts/smoke/smoke-audit.sh` (17 invocations)                                   | synthetic | **yes** — the fixture                                                                                 |
| CI: `.github/workflows/smoke.yml`, job `smoke` → `run-all.sh`                     | real      | **no** — `actions/checkout` gives a clean tree                                                        |
| `templates/core/skills/verification-before-completion/SKILL.md` + its two mirrors | —         | documented, never executed                                                                            |

**Read that table before writing the tests.** In the release gate and in CI the untracked set is
provably empty. The feature's only permanent witness is `smoke-audit.sh`'s fixture. If that fixture
assertion is vacuous, nothing anywhere observes this feature working again after the day it lands —
which is why FR-006 and FR-009 exist and why the security seat's "read no content" invariant gets an
assertion of its own.

## 2. User scenarios

**P1 — a maintainer adds a new bundled surface file and has not committed it yet.**

- **Given** a working tree with `templates/core/agents/new-thing.md` created but never `git add`ed,
  **and** no smoke script naming `new-thing.md`, **When** `scripts/smoke/audit.sh` runs, **Then** it
  reports `new-thing.md` as a coverage gap, **marks it `(untracked)` in the report line**, and exits
  non-zero.
- **Given** the same tree **and** a smoke assertion naming `new-thing.md`, **When** the audit runs,
  **Then** it exits 0.
- **Given** the file has been `git add`ed but not committed, **When** the audit runs, **Then** it is
  still collected (see FR-010 — staging is the common next keystroke, not an exotic state).

**P2 — the audit must not start reporting on files that are none of its business.**

- **Given** an untracked file under a surface prefix that a `.gitignore` rule matches — the fixture
  case is `templates/core/agents/debug.log` against `*.log`, which is a real rule in this repo's own
  `.gitignore` — **When** the audit runs, **Then** that file appears in no bucket.
- **Given** the same tree with `--exclude-standard` removed from the script, **When** the audit
  runs, **Then** it _does_ appear. **This pair is the assertion.** A single green run proves nothing
  here.
- **Given** an untracked file outside the four surface prefixes (e.g. `notes.md` at the repo root,
  or anything under `sandbox/`), **When** the audit runs, **Then** it is not collected — **because
  of the pathspec, which is a different mechanism and gets its own assertion.**

**P3 — the verdict is stable, and it is a property of the tree rather than of the machine.**

- **Given** an unchanged tree, **When** the audit runs twice, **Then** both runs give the same
  verdict and the same counts.
- **Given** the same tree on a machine with a `core.excludesFile` configured and on one without,
  **When** the audit runs, **Then** the verdict is the same (FR-004).

### Edge cases — all six verified in a throwaway repo, none reasoned from memory

| Case                                                      | Verified behaviour                                                                                                                                                                                                                                                                                    |
| :-------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A file both untracked **and** matching no `SURFACES` glob | Unmapped bucket, fatal — the existing path, unchanged.                                                                                                                                                                                                                                                |
| A file untracked, mapped, and allow-listed with a reason  | Allow-listed gap, not fatal — the existing hatch, reached the same way.                                                                                                                                                                                                                               |
| A file **staged but not committed**                       | **Invisible to both `ls-files --others` and `$SINCE..HEAD`.** Closed by FR-010's third source, not left as a hole. The first draft's cell said "still collected" and then explained that it is not; it was wrong in the direction that flatters the plan.                                             |
| A path with non-ASCII bytes, untracked                    | Rendered unescaped **only if `-c core.quotePath=false` is on the `ls-files` invocation too** — hence FR-002 hoisting the whole git prefix, not just the pathspec. Without it: `"templates/core/agents/ag\303\251nt.md"`, which matches no glob. That is #549, verbatim.                               |
| An untracked **directory**                                | Split. A plain untracked directory has its **files** enumerated. A directory containing a `.git` is emitted as **`templates/core/agents/nested/`** — trailing slash, contents suppressed. The first draft called this impossible "by construction". It is not; measured both ways. Handled by FR-011. |
| **Duplicate between the two sets**                        | **Possible.** `git rm --cached <path>` after committing it puts the path in _both_ — the diff reports it as an `A` in the range and `ls-files --others` reports it because the index no longer has it. Measured. The first draft called this impossible "by construction". Closed by FR-012.          |

## 3. Requirements

- **FR-001** — The changed set MUST include untracked, non-ignored files under the audited surface
  prefixes, collected via `git ls-files --others --exclude-standard`, **unioned** with the existing
  tracked collection.
- **FR-002** — The **whole per-invocation git prefix** —
  `git -C "$SRC_ROOT" -c core.quotePath=false` — and the **pathspec** MUST each exist exactly once,
  as shared variables both (all) collections consume. Hoisting the pathspec alone would leave
  `-c core.quotePath=false` with two literal homes, and #549 is the shipped incident proving what
  one missing copy of that flag costs. (#564 AC4, AC7.)
- **FR-003** — No new **verdict** logic: no new counter, no new term in the exit-code expression, no
  new exit code. **Marking a collected path `(untracked)` in the report text is REQUIRED and is
  explicitly not verdict logic** — it touches no counter and no exit term. Without it an uncommitted
  file prints identically to a committed gap, and SC-001 is half delivered. (#564 AC8.)
- **FR-004** — Ignored paths MUST stay invisible **by `--exclude-standard`**, not by a second
  exclusion list. `--exclude-standard` reads **three** sources — per-directory `.gitignore` files,
  `$GIT_DIR/info/exclude`, and `core.excludesFile`. The third is machine-global and has nothing to
  do with this repository, and it **is** configured on at least one maintainer machine; it MUST be
  pinned out with `-c core.excludesFile=/dev/null` so the verdict is a property of the tree.
  `$GIT_DIR/info/exclude` stays honoured: it is repo-local and deliberate, the same class as
  `.gitignore`. The regression assertion MUST plant its fixture **under a surface prefix** with an
  ignore rule mirroring a real one, and MUST be observed **both** with and without the flag. A
  fixture planted outside the pathspec is excluded by the pathspec and proves nothing about the
  flag.
- **FR-005** — The `$SINCE..HEAD` semantics for tracked files MUST be unchanged. Everything else is
  **unioned in**, never substituted. (#564 out-of-scope clause.)
- **FR-006** — Every new assertion MUST be **observed red** against a deliberately re-introduced
  defect before being accepted. A green run on a correct tree is not evidence that a new check
  works. Probe filenames MUST be invented and ticket-derived (`probe-untracked-564.md`) — never
  borrowed from any real project, per constitution § XI. (#564 AC2.)
- **FR-007** — The `SURFACES` map and `coverage-allowlist.txt` MUST NOT be edited by this change.
  (#564 out of scope; the hand-mapping half of the class was closed by #562.)
- **FR-008** — The rationale — the approach taken and the three rejected — MUST live as a **comment
  beside the union**, citing #564, matching the five existing instances in this file. The commit
  body carries the same rationale as the ephemeral echo, not as the record. (#564 AC6, widened: a
  commit body is not what a reader three cycles from now greps.)
- **FR-009** — `smoke-audit.sh` MUST plant every new fixture file **after** the last invocation
  whose counts are asserted, or `git add`+commit it before that invocation. Nineteen assertion sites
  in that file pin exact counts, and a single stray untracked file under a surface prefix moves all
  of them. The current fixture is clean; the margin is one line.
- **FR-010** — The changed set MUST also include **staged-but-uncommitted** paths, via a third
  source `git diff --name-only --diff-filter=AMR --cached HEAD`. AC1 says "still-uncommitted", and
  `git add` is the most common keystroke after `touch`; without this, the value window of the whole
  feature is approximately zero for anyone using `git add -A` or an editor that stages on save.
- **FR-011** — A collected path ending in `/` (an untracked directory containing its own `.git`)
  MUST be reported with a message naming that cause. It reaches the unmapped bucket and is fatal
  either way; what FR-011 buys is that the maintainer's natural repair is not "add a `.gitignore`
  entry", which is FR-004's drift shape.
- **FR-012** — The union MUST be de-duplicated, preserving first-seen order (`awk '!seen[$0]++'`,
  not `sort -u` — SC-003 relies on a fixed order).
- **FR-013** — `--src-root` MUST be the **toplevel** of its work tree. `git ls-files` emits
  **cwd-relative** paths where `git diff --name-only` emits **root-relative** ones; from a
  subdirectory the two halves speak different vocabularies and the untracked half matches no glob.
  Belt: pass `--full-name`. Braces: assert `SRC_ROOT = git rev-parse --show-toplevel` at the flag
  validation and **exit 3**, which already means "`--src-root` is not usable" and which
  `preflight.sh` already branches on. No fourth exit code.
- **FR-014** — The audit MUST read the **content** of no collected path. A collected path is a
  string used for mapping and reporting only. Asserted by planting an unreadable (`chmod 000`)
  untracked surface file and requiring the audit to complete — which fails the moment somebody adds
  a read.

## 4. Success criteria

- **SC-001** — A maintainer who creates a new bundled surface file learns it has no coverage **while
  writing it**, from the same command that will judge it at release time, and the report says the
  file is uncommitted rather than leaving them to work that out.
- **SC-002** — A tree whose only difference from clean is an ignored artefact gives the clean
  verdict, **and gives it identically on any machine and in CI**.
- **SC-003** — Two consecutive audit runs on an unchanged tree produce identical output.
- **SC-004** — The audit meta-test fails when the untracked collection is removed from the script,
  and separately when `--exclude-standard` is removed from it.

## 5. 🔒 The decision table

| The decision                                            | Its single home                                                                                                                                   | What would duplicate it                                                                                                                                                                                                                          |
| :------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Which paths count as an audited surface**             | `scripts/smoke/audit.sh` — one `SURFACE_PATHSPEC` array, consumed by every collection                                                             | A second literal list on the `ls-files` or `--cached` line; a hard-coded prefix inside a new `case` filter                                                                                                                                       |
| **How a git invocation renders and scopes a path**      | `scripts/smoke/audit.sh` — one `GIT_SRC` prefix array carrying `-C "$SRC_ROOT"`, `-c core.quotePath=false`, `-c core.excludesFile=/dev/null`      | A second literal `-c core.quotePath=false`; a bare `git -C "$SRC_ROOT"` on any new collection line                                                                                                                                               |
| **What is invisible to the audit**                      | `.gitignore` files in the tree, plus `$GIT_DIR/info/exclude` — reached via `--exclude-standard`, with `core.excludesFile` deliberately pinned out | An explicit `case "$f" in sandbox/*) continue`; an exclusion pathspec (`:!sandbox`) beside the include list; **`templates/core/root/.gitignore`, which git reads as a live rule over a mapped surface while also being shipped product content** |
| **Whether a collected file with no assertion is fatal** | `audit.sh`'s final `if` before `exit 1`                                                                                                           | A new `untracked_count` term in that expression; an early `exit 1` on the untracked branch                                                                                                                                                       |
| **What identifies a file for coverage**                 | `coverage_token()` in `audit.sh`                                                                                                                  | Any basename derivation added on the untracked path                                                                                                                                                                                              |
| **Whether the tracked range is `$SINCE..HEAD`**         | the `git diff … "$SINCE..HEAD"` invocation                                                                                                        | A `git status --porcelain` call treated as equivalent                                                                                                                                                                                            |
| **What the audit's stated contract says**               | `scripts/smoke/README.md`, "Audit heuristics" — **DERIVED**; `audit.sh` is the decider                                                            | A third prose restatement elsewhere; leaving README stale after a behaviour change                                                                                                                                                               |

**Deliberately NOT unified — and this is binding too.** `smoke-audit.sh` writes its fixture paths as
**literals**, and they must stay literal. They are the only independent second opinion on what
`SURFACE_PATHSPEC` contains: import the variable into the fixture and the meta-test plants under
whatever `audit.sh` currently says, so no assertion can ever fail on a wrong pathspec. #551 is the
precedent — twelve shipped files under `templates/harness-specific/` were invisible because the
pathspec ignored the tree, and only a hand-written literal elsewhere could have caught it. A comment
beside those literals must say so, or the next reader "fixes" the duplication.

Binding: a review finding that any row above has two homes is a plan violation, not a style opinion.
So is a change that collapses the paragraph beneath it.

## 6. Technical context

- **Language**: POSIX-ish bash, `set -euo pipefail`, written for **bash 3.2** (macOS) like the rest
  of `scripts/smoke/`. No new dependency: `git ls-files` is already implied by the script's
  `git diff`.
- **Testing**: `scripts/smoke/smoke-audit.sh` — a meta-test that builds a synthetic git repo, plants
  one of each finding class, and runs the **real** `audit.sh` against it via `--src-root` /
  `--smoke-dir`. It is the only place that can plant an untracked file without dirtying the real
  tree, and per §1 it is the feature's only permanent witness.
- **The synthetic repo has no `.gitignore` today.** FR-004 needs one; this change adds it to the
  fixture. Fixture setup, not a product change — and it sits at the synthetic root, outside all four
  prefixes, so it shifts no existing count.
- **Constraint that shapes the design**: `audit.sh`'s exit code _is_ the verdict, and three distinct
  non-zero codes are already load-bearing (1 findings, 2 bad baseline, 3 not a usable work tree),
  consumed by `preflight.sh`. Nothing here adds a fourth. FR-013 reuses 3 on purpose.

### The domain fact this rests on — and the axis on which it does **not**

`--diff-filter=AMR` selects **A**dded, **M**odified, **R**enamed. A path git has never recorded can
only ever be an addition — `M`, `R`, `D`, `C` are undefined for it. So `ls-files --others` yields
exactly the `A` subset the filter would have selected. On the **filter** axis the equivalence is by
construction.

**It is not by construction on the path axis.** `git diff --name-only` emits root-relative paths;
`git ls-files` emits **cwd-relative** ones. Measured from a subdirectory: `sub/tracked.md` versus
`newuntracked.md`. That is why FR-013 exists, and why "the pathspec is the only thing that can
drift" — the first draft's claim — was wrong.

## 7. Constitution check

| Principle                              | Verdict | Note                                                                                                                                                                                                                                   |
| :------------------------------------- | :------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. OSS / proprietary boundary          | pass    | Public half only. Nothing from Cloud is read, named or referenced.                                                                                                                                                                     |
| II. Single bridge is the HTTP contract | pass    | No cross-half call.                                                                                                                                                                                                                    |
| III. Monorepo holds no product code    | pass    | Everything lands in `apps/specnaut-cli/`.                                                                                                                                                                                              |
| IV. Cross-cutting change discipline    | pass    | One commit in the CLI half, one pointer commit in the monorepo, submodule pushed first.                                                                                                                                                |
| V. Merge defaults — local by default   | pass    | Local `--ff-only` via `scripts/land.sh cli <branch>`.                                                                                                                                                                                  |
| VI. Centralised backlog routing        | pass    | The `Ready → In progress` move went through the `product-owner` agent; the close will too.                                                                                                                                             |
| VII. Submodule autonomy                | pass    | The CLI's own conventions apply inside it.                                                                                                                                                                                             |
| VIII. Documentation conventions        | pass    | No version, date or shipping count pinned in long-lived prose. `7f2d11e` sits in a dated spec, which is a record.                                                                                                                      |
| IX. Dogfooding clause                  | pass    | This ran through `/specnaut plan`, both audits included.                                                                                                                                                                               |
| X. Epic status mirrors child progress  | pass    | #564 is standalone.                                                                                                                                                                                                                    |
| XI. Consumer agnosticism               | pass    | No project that uses Specnaut is named or made identifiable; no third party is named at all. FR-006 pins probe names to invented, ticket-derived strings — the one step in this plan that tempts someone to reach for a real filename. |

### Complexity tracking

No violations to justify.

## 8. Surface impact

| Surface                                                                                                        | Touched?             | What changes                                                                                                                                                                                                                                                                                                          |
| :------------------------------------------------------------------------------------------------------------- | :------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/smoke/audit.sh`                                                                                       | yes                  | `GIT_SRC` + `SURFACE_PATHSPEC` hoisted; `CHANGED` becomes the de-duplicated union of three sources; `(untracked)` / nested-repo report annotations; the toplevel assertion at flag validation.                                                                                                                        |
| `scripts/smoke/smoke-audit.sh`                                                                                 | yes                  | New assertions for P1, P2, P3, FR-011, FR-012, FR-013, FR-014; a `.gitignore` added to the synthetic fixture; the existing non-ASCII scenario extended to an **untracked** accented file. All planted per FR-009.                                                                                                     |
| `scripts/smoke/README.md` ("Audit heuristics")                                                                 | yes                  | The changed-set paragraph; **and the pre-existing staleness at the Unmapped-surface row**, which says `templates/core/` when that bucket has covered `templates/harness-specific/` since #551 and reports `src/cli/` separately. Fixed in the same change or the doc ships two contradictory claims about one bucket. |
| `scripts/smoke/smoke-toolbox.sh`                                                                               | **no**               | It is a caller (its drift probe runs the real audit against the real tree), but its probe file lives in `scripts/smoke/`, outside all four prefixes. Listed because §8 is where a reviewer checks the blast radius, and its absence from the first draft was itself a finding.                                        |
| `scripts/smoke/coverage-allowlist.txt`, the `SURFACES` map                                                     | **no**               | FR-007.                                                                                                                                                                                                                                                                                                               |
| `.specnaut/release/preflight.sh`                                                                               | **no**               | Branches on exit codes, which are unchanged; and its clean-tree gate means the new collection is provably empty there.                                                                                                                                                                                                |
| `templates/core/skills/verification-before-completion/SKILL.md` + `plugin/` mirror + `src/templates_bundle.ts` | **no**, deliberately | The bundled skill documents the audit. Adding a sentence there is a three-file change (template, byte-identical plugin mirror enforced by `tests/plugin/plugin_sync_test.ts`, bundle regen) **and** makes the edited file a coverage-gap subject of the audit it describes. Stated so nobody asks for it casually.    |
| Bundled templates, `src/`, `templates/manifest.json`                                                           | **no**               | Nothing user-facing ships differently.                                                                                                                                                                                                                                                                                |
| The scaffolded product (`specnaut init` output)                                                                | **no**               | `scripts/smoke/` is not bundled.                                                                                                                                                                                                                                                                                      |

### Interface contracts exposed

`audit.sh`'s CLI contract — `--since`, `--src-root`, `--smoke-dir`, and the four exit codes — is
unchanged. FR-013 **narrows** what `--src-root` accepts (toplevel only) using an existing code; that
is the only contract movement, and it is a tightening.

## 9. Risks

| Risk                                                                                                                                                                                                                                                                                                                                          | Mitigation                                                                                                                                                                                                                                                                                                                                                           |
| :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The gate goes red on a maintainer's local scratch file** and reads as a false positive.                                                                                                                                                                                                                                                     | `--exclude-standard` plus the pathspec means the only collected untracked files are non-ignored ones _under a bundled-surface prefix_. A scratch file there is not scratch — it is an unshipped surface file. The allow-list already carries a real exception with a written reason.                                                                                 |
| **`run-all.sh` runs the audit LAST against the real tree**, so untracked residue left by any earlier suite script now fails the whole suite — a coupling that did not exist before.                                                                                                                                                           | Verified today: no suite script leaves untracked files under the four prefixes (all fixture writes are committed or live under `sandbox/` and `scripts/smoke/`). FR-003's `(untracked)` marker means such a failure names its cause instead of inviting an assertion for a file that was never meant to exist. Re-verified by running the full suite before landing. |
| **A second pathspec or a second `-c core.quotePath=false` is added later**, restoring the class silently.                                                                                                                                                                                                                                     | FR-002 hoists both into shared variables; §5's third column names the drift shapes so a reviewer greps for them.                                                                                                                                                                                                                                                     |
| **The new assertion passes vacuously** — this repo's most-repeated failure (#546, and three false "still green" probes in the #562 session). The first draft of this plan shipped exactly that: its `--exclude-standard` assertion planted under `sandbox/`, which the _pathspec_ excludes, so the flag could be deleted and it stayed green. | FR-004's paired observation and FR-006 across every new assertion. SC-004 names both deletions.                                                                                                                                                                                                                                                                      |
| **`templates/core/root/.gitignore` is shipped product content that git also reads as a live exclusion rule** over `templates/core/root/*`, a mapped surface. Editing it as a normal product change silently narrows what the gate sees.                                                                                                       | Named in §5 row 3's third column. Verified: `templates/core/root/foo.specnaut.bak` is excluded by `templates/core/root/.gitignore:1`. Not fixed here — it is a real second decision in one file and deserves its own ticket, recorded in §12.                                                                                                                        |
| **The report could become a disclosure path** if someone later "improves" the unmapped bucket to read a new file's front-matter, in a job whose logs are public.                                                                                                                                                                              | FR-014 pins "paths only, never contents" as an assertion rather than an unwritten invariant. Today no byte of a collected file is read — verified.                                                                                                                                                                                                                   |
| **Output ordering differs between runs**, making SC-003 unverifiable.                                                                                                                                                                                                                                                                         | Fixed concatenation order plus `awk '!seen[$0]++'` (FR-012), which preserves it where `sort -u` would not.                                                                                                                                                                                                                                                           |

## 10. Architecture audit

`architect-expert`, plan-time, on this document before a line was written. **Verdict: fail** — 2
CRITICAL, 4 HIGH, 6 MEDIUM, 2 LOW. **Every finding accepted; every empirical claim re-verified here
before acceptance.** Two of them were fixes made of the same material as the defect this ticket
fixes, which is the whole reason the audit runs before the code.

| #  | Finding                                                                                                                                                                                                                                                  | Disposition                                                                                                                                                                                               |
| :- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 | §5 row 1's third column forbade `smoke-audit.sh`'s independent path literals. Enforcing it would make the meta-test tautological — it would plant under whatever `audit.sh` says, so no assertion could fail on a wrong pathspec. #551 is the precedent. | **Plan changed.** The clause is deleted and inverted: §5 now carries a binding paragraph saying those literals are a deliberate independent restatement that must stay literal.                           |
| C2 | FR-004's regression fixture planted under `sandbox/`, outside the pathspec — so it was the _pathspec_ excluding it, and `--exclude-standard` could be deleted with the assertion still green.                                                            | **Plan changed.** FR-004 and §2 P2 now require the fixture **under a surface prefix** against a real ignore rule, observed **both** ways. SC-004 names the deletion.                                      |
| H1 | FR-002 hoisted the pathspec and left `-c core.quotePath=false` with two literal homes. #549 is the shipped incident.                                                                                                                                     | **Plan changed.** FR-002 hoists the whole `GIT_SRC` prefix; §5 gains a row for it; §2's edge case restated.                                                                                               |
| H2 | `git ls-files` is cwd-relative, `git diff --name-only` is root-relative, and nothing asserts `--src-root` is the toplevel.                                                                                                                               | **Plan changed.** FR-013, belt (`--full-name`) and braces (toplevel assertion, exit 3). Re-verified: `sub/tracked.md` vs `newuntracked.md`. Also the security seat's MEDIUM 1 — two seats, independently. |
| H3 | An untracked gap would print identically to a committed one, and FR-003 read as forbidding the distinction. `run-all.sh` runs the audit last against the real tree.                                                                                      | **Plan changed.** FR-003 now _requires_ the `(untracked)` marker and says why it is not verdict logic. §9 gains the ordering risk.                                                                        |
| H4 | Four spellings of the surface list already exist, and `README.md`'s Unmapped-surface row is **already stale** (says `templates/core/` for a bucket that covers `templates/harness-specific/` since #551). §8 mandated a fifth prose copy.                | **Plan changed.** §5 gains a row declaring README **derived**; §8 requires fixing the pre-existing staleness in the same change. Verified against the file.                                               |
| M1 | "An untracked directory — `ls-files` lists files, not directories" is false: a directory containing a `.git` is emitted as `nested/` with contents suppressed.                                                                                           | **Plan changed.** §2 restated with both measured behaviours; FR-011 names the cause in the report.                                                                                                        |
| M2 | "Duplicate between the two sets — impossible by construction" is false: `git rm --cached` puts a path in both.                                                                                                                                           | **Plan changed.** Reproduced. FR-012 de-duplicates.                                                                                                                                                       |
| M3 | §5 row 2's "single home" is three sources, two per-machine and outside the repo.                                                                                                                                                                         | **Plan changed.** FR-004 names all three; `core.excludesFile` pinned out, `info/exclude` deliberately kept. Verified: `core.excludesFile` **is** set on this machine and its file exists.                 |
| M4 | The staged-file row said "still collected" and then explained that it is not, and cited the wrong FR.                                                                                                                                                    | **Plan changed**, and the hole closed rather than documented: FR-010 unions a third source. See §12.                                                                                                      |
| M5 | Four stale line citations on a plan whose §1 claims a re-measurement. `audit.sh:181` is a `SURFACES` entry — the one region FR-007 forbids touching.                                                                                                     | **Plan changed.** Anchor-only citation convention stated at the top.                                                                                                                                      |
| M6 | `smoke-toolbox.sh` is a fourth caller and was absent from §8.                                                                                                                                                                                            | **Plan changed.** §1's caller table and §8 both carry it, with why it is safe.                                                                                                                            |
| L1 | The bundled skill documents the audit and is mirrored in three places.                                                                                                                                                                                   | **Plan changed.** §8 names it as a deliberate non-change with its three-file cost.                                                                                                                        |
| L2 | FR-008 put the rationale only in the commit body — the copy nobody greps.                                                                                                                                                                                | **Plan changed.** FR-008 makes the code comment the record, matching the five existing instances in `audit.sh`.                                                                                           |

**What the audit checked and found sound**, recorded because a clean verdict is worth exactly what
it covered: FR-003's "the mechanism already exists" is correct and traced end to end; the
`--diff-filter=AMR` equivalence holds on its own axis; the existing fixture leaves nothing behind
(all 17 invocations traced) — the margin is one line, hence FR-009; nothing in §8 relocates text the
19 count assertions name; the real tree is clean on both sides today, so the change is a no-op on
landing; and the rejection of option 2 (`git status --porcelain`) is correct and properly protected
by §5.

## 11. Security audit

`security-expert`, plan-time, same message as the architecture audit. **Verdict: needs_followup** —
0 CRITICAL, 0 HIGH, 2 MEDIUM, 2 LOW. Kept separate from §10 on purpose: the architect asks whether a
rule has one home, this seat asks who can reach it.

**No injection, no new principal, no disclosure path.** Every hostile-filename class fails closed
through git's own C-quoting plus the pre-existing quoted `case "$f"`, and the `$glob` that is
deliberately unquoted comes from a hard-coded array, not from input. Measured, not assumed: a
`$(…)`-bearing filename executed nothing; a `*`-bearing filename was reported literally; a newline
in a filename arrives C-quoted as one line, so `while IFS= read -r f` cannot desynchronise, and the
quoted form fails closed into the fatal unmapped bucket. No collected path is ever opened.

The trust boundary, stated plainly because §9's first draft never did: **this change adds no
principal.** Locally the maintainer already executes the script from the tree it reads. In CI a fork
contributor already has arbitrary execution in the smoke job, which is built for that —
`pull_request` not `pull_request_target`, `contents: read`, `persist-credentials: false`, no secrets
— and this change touches none of those four. On the release path the new collection is provably
empty.

| #  | Finding                                                                                                                                                                                                     | Disposition                                                                                                                                                                                      |
| :- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1 | "Equivalence by construction" is false on the path-prefix axis.                                                                                                                                             | **Same as architecture H2** — found independently by both seats. FR-013.                                                                                                                         |
| M2 | FR-004 named one home for "what is invisible"; `--exclude-standard` reads three, one machine-local, one of them **shipped product content** (`templates/core/root/.gitignore`, live over a mapped surface). | **Plan changed.** FR-004 rewritten; `core.excludesFile` pinned out; SC-002/SC-003 restated as cross-machine. The product-content half is named in §5 row 3 and deferred to its own ticket (§12). |
| L1 | §2's untracked-directory claim is false for an embedded repository.                                                                                                                                         | **Same as architecture M1.** FR-011.                                                                                                                                                             |
| L2 | "Paths only, never contents" is load-bearing and unwritten — one plausible refactor (reading front-matter to classify an unmapped file) from becoming a content-disclosure path in a public CI log.         | **Plan changed.** FR-014 pins it as an assertion. The `.gitignore` widening it also proposes is refused here — see §12.                                                                          |

**§ XI: clean.** No third party is named. The seat's forward-looking note is folded into FR-006:
probe filenames stay invented and ticket-derived, because FR-006 is exactly the step that tempts
someone to reach for a real one.

## 12. Open questions and settled decisions

There was no user stop with open questions on this item: the ticket's one genuine fork — which of
three collection strategies — was settled on 2026-08-26 in the ticket body itself (option 1), with
its rejected alternatives written out. What follows is what **this plan** decided, so each survives
the branch.

1. **Staged-but-uncommitted files are covered, not documented as a hole** (2026-08-26). The
   architecture seat's M4 argued that `git add` is the most common keystroke after `touch`, so a
   plan that closes only the untracked case delivers approximately zero value to anyone using
   `git add -A` or an editor that stages on save. AC1's own words are "still-uncommitted", which
   staging is. Taken: FR-010 unions a third source. It goes beyond the ticket's _title_, and inside
   its _criterion_ — recorded here rather than assumed.
2. **`core.excludesFile` is pinned out; `$GIT_DIR/info/exclude` is not** (2026-08-26). Both seats
   flagged that `--exclude-standard` reads three sources. The global file is machine-wide and has
   nothing to do with this repository — inheriting it makes the verdict a property of the laptop, in
   the false-green direction. `info/exclude` is repo-local and deliberate, the same class as
   `.gitignore`, so it stays honoured. Silently inheriting both was the only option refused.
3. **Refused: widening `.gitignore` to `.env*`, `*.pem`, `*.key`, `id_rsa*`** (2026-08-26). The
   security seat's L2 proposes it as cheap hygiene, and it is. It is refused _in this ticket_ for
   two reasons: it changes what the gate can see, in the direction this ticket exists to close; and
   it is not what #564 is about. Filed as its own item instead.
4. **Refused: fixing `templates/core/root/.gitignore`'s double duty** (2026-08-26). A shipped
   template that git also reads as a live exclusion rule over a mapped surface is a real second
   decision in one file. Naming it in §5 row 3 is what this ticket owes it; resolving it is a
   separate ticket, because any resolution changes what consumers receive.
5. **Decided without asking**: the fixture's ignore pattern is `*.log` (a real rule in this repo's
   `.gitignore`), the de-duplication is `awk '!seen[$0]++'` rather than `sort -u` (SC-003 needs the
   order), and FR-013 reuses exit 3 rather than adding a code (`preflight.sh` already branches on
   it).
