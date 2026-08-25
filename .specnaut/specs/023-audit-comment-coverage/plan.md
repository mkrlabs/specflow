# 023 — A comment is not an assertion

**Issue:** [#545 — audit.sh counts a mention in a comment as coverage](https://github.com/specnaut/specnaut-cli/issues/545)
**Branch:** `023-audit-comment-coverage`

## 1. Why this exists

`scripts/smoke/audit.sh` decides whether a changed file is covered by a smoke
test with one unanchored fixed-string match on the basename, over the whole
smoke file — comments included. A basename mentioned only in a comment counts
as coverage, **including a comment that says the file is deliberately not
covered**.

The audit is precise about what it *scans* (a git pathspec) and loose about
what it *accepts* (any mention anywhere). The looseness runs in the one
direction a gate must never fail in: it reports coverage that does not exist.
`.specnaut/release/preflight.sh` branches on this script's exit code, so the
error is not cosmetic.

**Measured, before deciding anything.** Two facts, both from the working tree:

- **The defect is latent, not live.** Replaying the coverage loop with a
  comment-stripped match over every mapped surface change back to `v1.0.0`
  — six baselines, 100 mapped files at the widest — flips **zero** verdicts. No
  coverage claim standing today rests on a comment. The fix is preventive; it
  will not turn the gate red.
- **The naive strip everyone reaches for is wrong here.** `sed 's/#.*$//'`
  truncates at the first `#` on a line, and shell puts one in the middle of
  real code. Measured across the 19 scripts in `scripts/smoke/` (3182 lines):
  **673** lines are genuine comments; the naive expression alters **874**;
  the difference — **201 lines of real code silently destroyed** — is the
  defect. 16 of those are parameter expansions (`${rt#.claude/agents/}`), and
  **82** are the suite's own section banners, `echo "═══ #180  add.sh …"`.

That second fact matters because `run-all.sh:69` **already** uses the naive
strip, for the FR-001 boundary check. So the suite does not have one comment
problem; it has one comment *rule* spelled inaccurately in one place and about
to be spelled a second time.


## 2. User scenarios

The user is the maintainer running the release gate, and CI running it for them.

**P1 — a smoke that only mentions a file cannot vouch for it.**
*Given* a bundled file changed since the baseline tag, *and* the only
occurrence of its basename in the expected smoke script is inside a comment,
*when* `audit.sh` runs, *then* the file is reported as a coverage gap and the
exit code is non-zero.

**P2 — the rule has one spelling, in the scripts that ask it.**
*Given* `audit.sh`'s coverage match and `run-all.sh`'s FR-001 boundary check
— the two places that must tell shell code from commentary — *when* a
maintainer looks for where that is decided, *then* they find one function and
two callers. Scope is deliberate, not universal: see §8 for the five sites
that legitimately do **not** migrate.

**P3 — real code is not mistaken for a comment.**
*Given* a smoke line containing `${var#prefix}`, `echo "═══ #180  add.sh …"`
or `url="…#frag"`, *when* the suite strips comments, *then* the line survives
intact.

**P4 — the boundary guard can see itself without failing.**
*Given* `run-all.sh:69`, whose grep pattern contains the very tokens it
searches for, *when* the accurate strip stops hiding that line, *then* the
check still passes — because the pattern is assembled from fragments, not
because the file is exempt from its own guard.

**Edge cases**
- Whitespace then `#` → wholly stripped. A shebang → stripped.
- ` # ` inside a quoted string → **kept** (it is not a comment).
- **Heredoc bodies are out of scope.** The suite embeds `.gitignore`, CSS,
  Markdown and Python inside heredocs — 26 lines carry a `#` that is not a
  shell comment. The strip runs per line with no cross-line state, so damage
  is bounded to the line; the rule is scoped in §5 023-R1 to *shell code*, and
  the honest statement is that heredoc bodies are not analysed.
- A file with no comments → byte-identical output. Line count always preserved.

## 3. Requirements

- **FR-001** — A basename occurring in a smoke script *only* inside a comment
  MUST NOT count as coverage.
- **FR-002** — "What counts as code in a smoke script" is spelled **once**.
  The migrating call sites are enumerated, not searched for: `audit.sh:240`
  (coverage match) and `run-all.sh:69` (FR-001 boundary). Both must call the
  shared function; neither may carry its own expression.
- **FR-003** — The strip MUST NOT truncate at a `#` that is quoted, or that is
  neither at the start of a line nor preceded by whitespace.
- **FR-004** — The strip removes a **suffix of the line and never an interior
  span**, and preserves line numbering.
- **FR-005** — `smoke-audit.sh` gains a scenario pinning FR-001: a synthetic
  smoke whose only mention of the planted file sits in a comment is reported
  as a coverage gap. **Observed failing against the pre-fix `audit.sh` before
  the fix lands.**
- **FR-006** — `run-all.sh:69`'s boundary pattern is **assembled from
  fragments** so the line does not contain the tokens it searches for. The
  file is NOT exempted from its own guard (#544 precedent;
  `smoke-toolbox.sh:38`'s `up=".."` is the in-repo template).
- **FR-007** — The heuristic is written down in `scripts/smoke/README.md`
  § "Audit heuristics", not restated in a script header. The same edit fixes
  `README.md:50`, which still describes the stale scan as walking
  `SCAN_FILES` — a variable 022 deleted.

## 4. Success criteria

- **SC-001** — On the real tree, `audit.sh`'s verdict is unchanged: exit 0,
  0 coverage gaps, before and after. *(Necessary, not sufficient — it passes
  under the naive strip too. See SC-005.)*
- **SC-002** — The FR-005 assertion is recorded red against the pre-fix script
  and green after.
- **SC-003** — `run-all.sh` is green end to end **after** FR-006. Without
  FR-006 it exits 1 before any smoke runs; that is predicted, not discovered.
- **SC-004** — Reintroducing the defect (restoring the raw `grep -qF` in
  `audit.sh`) turns `smoke-audit.sh` red. Verified by doing it.
- **SC-005** — A line carrying `${var#prefix}` and a line carrying
  `echo "═══ #180  add.sh …"` both survive the strip, asserted directly.
  Without this, FR-003 ships with **zero** coverage: SC-001 and FR-005 both
  pass under the naive expression.
- **SC-006** — After FR-006, a **planted** boundary violation is still caught
  by `run-all.sh`. An assembled pattern that stops matching is a dead guard
  that looks green.

## 5. 🔒 The decision table

Rows are namespaced `023-Rn`. **022's table is still live and its rows are
cited by number inside shipped code** — 13 citations across `_common.sh`,
`audit.sh`, `smoke-audit.sh`, `clean.sh` and `preflight.sh` read `plan.md §5
R1`, `R3`, `R4`, `R5`, `R11`, `R13` under 022's meanings. Reusing `R1`–`R5`
here would give one key two authorities in the same files.

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| **023-R1** — What counts as *shell code* in a smoke script (a comment is not an assertion; heredoc bodies are not analysed) | `scripts/smoke/_common.sh` → `smoke_code_lines()` | any inline `sed 's/#.*$//'`; a `grep -v '^[[:space:]]*#'` pre-filter; a second expression in `audit.sh` or `run-all.sh` |
| **023-R2** — The strip removes a **suffix, never an interior span**, and preserves line numbering | `smoke_code_lines()` | any caller re-deriving line numbers, or deleting lines before matching |
| **023-R3** — Where the `#` boundary sits (unquoted, at line start or preceded by whitespace) | the expression inside `smoke_code_lines()` | a caller widening or narrowing it for one case |
| **023-R4** — A guard never exempts itself from its own check; it assembles its pattern instead | `run-all.sh`'s boundary block | an exclusion list naming `run-all.sh`; a `# shellcheck`-style opt-out |
| **023-R5** — A new guard is proven by being observed red on the defect | `smoke-audit.sh`'s scenario, and the tasks that land it | a task marked done on a green run alone |
| **023-R6** — Where the audit's heuristics are written down | `scripts/smoke/README.md` § "Audit heuristics" | a script header restating a rule instead of pointing at it |

**Two askers, one decider.** `audit.sh` and `run-all.sh` ask 023-R1; neither
decides it. `smoke-toolbox.sh` is deliberately **not** an asker — see §8.

**Deliberately not a row:** "the exit code is the verdict" belongs to
**022-R5** and is cited as such in `audit.sh:23`, `audit.sh:432` and
`preflight.sh:36`. Restating it here would be the exact defect this table
forbids.

## 6. Technical context

- POSIX shell, **bash 3.2 floor**; BSD tooling (no GNU `\|` alternation, no
  `\s` in `/usr/bin/sed`, no `cat -A`, no `timeout`). An `awk` implementation
  sidesteps the `sed` portability floor.
- **`set -e` is not uniform, and the plan must not assume it is**:
  `audit.sh` and `.specnaut/release/preflight.sh` are `set -euo pipefail`;
  `run-all.sh:25` and `smoke-toolbox.sh:20` are `set -uo pipefail` — **no
  `-e`**. A `grep` matching nothing still needs `|| true` under `pipefail`.
- The invoking shell is **zsh**, which does not word-split unquoted variables.
- Surface: `scripts/smoke/` only. Nothing here ships in `templates/`, so
  `specnaut init`'s output is byte-identical before and after.

## 7. Constitution check

| Principle | Verdict |
| :--- | :--- |
| I — OSS/proprietary boundary | ✅ CLI half only; no private identifier involved. |
| II — HTTP contract is the only bridge | ✅ n/a. |
| III — monorepo holds no product code | ✅ all code lands in `apps/specnaut-cli/`. |
| IV — cross-cutting discipline | ✅ one half → one submodule commit, then the pointer bump, in that order. |
| V — merge defaults | ✅ local `--ff-only` via `scripts/land.sh cli <branch>`. No PR. |
| VI — centralised backlog routing | ✅ the follow-up ticket in §12 goes through the `product-owner` agent. |
| VII — submodule autonomy | ✅ respected. |
| VIII — documentation conventions | ⚠️ **binds FR-007.** The README edit must not pin a version, a date or a count. §1's tag references are evidence in a dated spec, which is not the same surface. |
| IX — dogfooding | ✅ this ticket is dogfooding output. |
| X — epic status | ✅ n/a. |
| XI — consumer agnosticism | ✅ no consuming project named anywhere. |

No Complexity Tracking entry.

## 8. Surface impact

- **Repo-internal tooling only.** `scripts/smoke/**` plus
  `.specnaut/release/preflight.sh`, which changes **not at all** — it branches
  on `audit.sh`'s exit code and never parses the report (022-R5).
- **CI**: `.github/workflows/smoke.yml` runs `run-all.sh` on every branch push
  and on `pull_request`.
- **No front-end surface exists in this repository**, so no visual prototyping
  section applies.
- **Interface contract**: `smoke_code_lines <file>` → stdout, one line per
  input line, unquoted trailing comment text removed.

**The five comment-aware sites that do NOT migrate, and why** — stated so the
"one home" claim is true as written rather than aspirational:

| Site | Why it stays |
| :--- | :--- |
| `audit.sh:362`, `:363` | The stale scan counts total vs negated occurrences over **raw bytes**. They migrate together or not at all — an asymmetric pair makes `[ "$total" = "$negated" ]` suppress real findings. Not at all, this cycle. |
| `audit.sh:370` | Same scan, same raw-byte read. |
| `audit.sh:172`, `:406` | `case "$line" in ''\|'#'*)` over `coverage-allowlist.txt` — a **data file**, not shell. A different rule that happens to use the same character. |
| `smoke-toolbox.sh:95-97` | Its `file:line` prefix exists only because `grep -n` was handed a glob. A per-file helper returns `lineno:code`; the filename and both exclusion filters would have to be rebuilt — ~25 lines of guarded sweep rewritten for no gain. Its comment filter and `smoke_code_lines()` were measured to select the **identical 7 deleting paths**, so there is no correctness argument for the churn either. |

## 9. Risks

- **R-1 — `run-all.sh` must change, and the plan's first draft did not know
  it.** Under an accurate strip, `run-all.sh:69` matches its own grep pattern
  and the suite exits 1 **before any smoke runs**. Both audits confirmed it;
  the security seat reproduced it on a scratch copy (`boundary_hits=0` today,
  `1` post-fix) and verified the assembled-pattern remedy restores 0 while
  still catching a planted violator. *Mitigation:* FR-006 + SC-006.
- **R-2 — can the gate get weaker? No, and it is provable.** The strip
  truncates to end-of-line, so every output line is a **prefix** of its input,
  and the substrings of a prefix are a subset of the line's substrings.
  `grep -qF` can therefore lose a match and never gain one: strictly
  fail-closed against today's unstripped behaviour. This invariant, not the
  `#` boundary, is what makes the change safe — hence 023-R2.
- **R-3 — FR-003 could ship untested.** SC-001 and FR-005 pass under the naive
  expression as readily as the accurate one, so accuracy has no natural
  witness. *Mitigation:* SC-005 exists solely to be that witness.
- **R-4 — touching a green guard for another guard's ticket.** *Mitigation:*
  SC-006 proves `run-all.sh` still catches a planted violation. Not "the suite
  is still green".
- **R-5 — process cost.** One pass per file per caller, 19 files. Immaterial
  against an 11 s suite.

## 10. Architecture audit

`architect-expert`, on this plan, before any code. **Verdict: fail** — 1
critical, 3 high, 2 medium, 1 low. Every finding was verified independently
before being accepted; none was taken on the agent's word.

| Finding | Verified | Disposition |
| :--- | :--- | :--- |
| **CRITICAL** — `run-all.sh:69` self-matches under an accurate strip; guaranteed red on first run, unpredicted by the plan | yes | **Plan changed**: FR-006, SC-003 restated, SC-006, 023-R4, §9 R-1, P4. |
| **HIGH** — 023's `R1`–`R5` collide with 022's rows, which shipped code cites by number | yes — 13 citations across 5 files | **Plan changed**: rows namespaced `023-Rn`, with the collision written into §5. |
| **HIGH** — the `smoke_code_lines <file>` contract cannot serve `smoke-toolbox.sh`; it drops file identity | yes | **Accepted**: migration cut, with the reason recorded in §8 rather than dropped in silence. |
| **HIGH** — heredocs make "one function, every caller asks it" unreachable; 5 comment-aware sites cannot migrate | yes — 26 heredoc lines | **Plan changed**: 023-R1 scoped to shell code, §8 names all five sites, the "zero idioms" absolute dropped. |
| **MEDIUM** — §1's "16 lines" understates; §6's `set -euo pipefail` false for 2 of 3 callers | yes — 201 wrongly-altered lines, not 16; `run-all.sh` and `smoke-toolbox.sh` carry no `-e` | **Plan corrected** in §1 and §6. The bad `${entry%%|*}` example (which contains no `#`) was removed. |
| **MEDIUM** — old R4 re-spelled 022-R5; FR-005's proof rule had no row; FR-002's verification grep returns 755 hits | yes — 755 confirmed | **Plan changed**: row cut, 023-R5 added, FR-002 now enumerates two sites instead of searching. |
| **LOW** — `README.md:50` cites `SCAN_FILES`, deleted in 022 | yes | **Folded into FR-007.** |

**Rejected: nothing.** The one claim I pushed back on internally — that the
three callers wanting opposite error directions argues for two functions —
the agent itself dismantled, and correctly: both callers want *accuracy*, and
§9 R-2's suffix invariant shows the direction question was mis-posed.

## 11. Security audit

`security-expert`, same dispatch, same message. **Verdict: fail** — 0
critical, 1 high, 1 medium, 1 low. Kept separate from §10 on purpose: it
answers a different question and reached the same critical finding by a
different route — execution rather than reading.

| Finding | Verified | Disposition |
| :--- | :--- | :--- |
| **HIGH** — the FR-001 boundary check flags itself and the suite stops running; reproduced on a scratch copy (`boundary_hits` 0 → 1), and the assembled-pattern remedy verified to restore 0 while still catching a planted violator | yes | Same disposition as §10's critical, plus **SC-006**, which is the security seat's addition: an assembled pattern that stops matching is a dead guard that looks green. |
| **MEDIUM** — no success criterion distinguishes a correct strip from the naive one; FR-003 would ship with zero coverage | yes — 0 coverage flips under both | **Plan changed**: SC-005. |
| **MEDIUM** — the fail-closed property was unstated; and the stale scan's `total`/`negated` pair must migrate together or not at all | yes | **Plan changed**: 023-R2 and §9 R-2 carry the suffix invariant; §8 records the pair as non-migrating. |
| **LOW** — add `--` before `"$1"`; `/usr/bin/sed` lacks `\s`; `_common.sh` is itself read by the stale scan, so a doc comment naming a `.claude/…` path self-flags | yes | Adopted into the tasks; the last point is why FR-007 puts the prose in the README and not in the header. |

**Coverage of the clean verdicts, stated so they are worth something:**
`--smoke-dir` / `--src-root` are bounded by `-n`, `-d`, then `cd && pwd`, so
always absolute — no leading-`-` smuggling; and neither flag is reachable
from the release gate (`preflight.sh:43`, `run-all.sh:116`,
`smoke-toolbox.sh:137` all invoke `audit.sh` flagless). On `pull_request` a
fork already gets arbitrary execution via `deno task bundle`, bounded by
`pull_request` rather than `pull_request_target`, `permissions: contents:
read`, `persist-credentials: false`, no secrets on the repo, no build cache,
and a 10-minute timeout. **This change moves that needle not at all** — one
function in a file the job already sources 19 times. Residual exposure is
runner minutes.

## 12. Open questions

All three answered at the plan stop, **2026-08-25**. Each is now a settled
decision and binds the implementation.

**Q1 — Scope. → `audit.sh` + `run-all.sh`.**
One function, two askers. This is what forces FR-006 and SC-006 into the
plan, and it is the reason the change touches a guard that is green today:
`run-all.sh`'s boundary check is blind to every line carrying a `#` before
its token, so migrating it closes a live blind spot rather than merely
avoiding a third spelling. `smoke-toolbox.sh` stays out (§8).

**Q2 — What counts as a comment. → quote-aware `awk`.**
State tracked per line for single and double quotes; cut at the first
unquoted `#` that is at line start or preceded by whitespace. Chosen over the
one-line `sed` because the anchored `sed` still destroys the suite's own 82
section banners (`echo "═══ #180  add.sh …"`) — 119 lines of real code lost
against 0. It also sidesteps `/usr/bin/sed`'s missing `\s`. Blind to heredoc
bodies, which 023-R1 states rather than implies.

**Q3 — The adjacent hole. → its own ticket, P1.**
Every skill's basename is `SKILL.md`, a string appearing 86 times in
`smoke-features.sh`, so the coverage test for the entire skills surface is
constant-true: **13 of the 23 shipped skills are named nowhere in that
smoke**, and a real change to `backlog-reference-contract/SKILL.md` since
`v3.0.0` was reported as covered. It is a different decision — *what a
basename must identify*, not *where a match may occur* — and fixing it moves
`SURFACES`, `resolves()` and the allowlist together. Priced **above** #545
because it is a live false-green where #545 is latent at zero flips.

### Decisions taken without asking

- **No quote-aware analysis of heredoc bodies.** #545 scopes this to comments,
  not to understanding the file. 023-R1 says so instead of implying it.
- **Rows namespaced `023-Rn`** rather than continuing 022's numbering at R14.
  Continuing would keep one flat namespace across plans and make `plan.md §5
  R7` ambiguous the moment a third plan touches this directory.
- **`README.md` is the home for the heuristic**, per #545's third acceptance
  criterion, and reinforced by the security seat: `_common.sh` is itself read
  by the stale-assertion scan, so prose there can self-flag.
- **Feature numbered `023`**; `create-new-feature.sh` does not exist in this
  repository — it ships in `templates/`, and the CLI does not scaffold itself.
