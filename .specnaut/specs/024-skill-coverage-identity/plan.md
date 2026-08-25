# 024 — A basename that names 22 files identifies none of them

**Issue:**
[#547 — audit.sh's coverage test is constant-true for the whole skills surface](https://github.com/specnaut/specnaut-cli/issues/547)
**Branch:** `024-skill-coverage-identity`

## 1. Why this exists

`audit.sh` decides coverage by matching a changed file's **basename** against the smoke mapped to
its surface. Every bundled skill lives at `templates/core/skills/<name>/SKILL.md`, so across that
entire surface the basename is the constant string `SKILL.md` — which occurs 86 times in
`smoke-features.sh`. The test cannot fail for any skill.

Measured, on the working tree:

- **13 of the 22 shipped skills are named nowhere in `smoke-features.sh`**: `a11y-audit`,
  `alias-example`, `arch-audit`, `backlog-reference-contract`, `code-audit`, `dep-audit`,
  `handoff-protocol`, `perf-audit`, `qa-report-contract`, `review-findings-contract`, `sec-audit`,
  `status-audit`, `workflow-contract`.
- Demonstrated end to end: `backlog-reference-contract/SKILL.md` changed since `v3.0.0`, nothing
  asserts on it, and `audit.sh --since v3.0.0` prints
  `✓ every surface change has a matching smoke assertion`.

This is [#545](https://github.com/specnaut/specnaut-cli/issues/545)'s failure direction — reporting
coverage that does not exist — but **live** where #545 was latent.

## 2. The constraint that decides the design

The obvious fix is to match the **runtime path** a source file scaffolds to
(`.claude/skills/<name>/SKILL.md`) instead of its basename. `audit.sh`'s `resolves()` already
encodes that mapping for the staleness scan, so the machinery exists.

**It is the wrong fix, and the suite says so in its own words.** `smoke-backlog-gitlab.sh:33-38`:

> Names carry their `.sh` so the coverage scan can find them. `audit.sh` greps each smoke file for a
> literal basename; a name assembled from a loop variable is invisible to it, so this loop covered
> six scripts while being reported as six gaps.

The smokes assert in loops — `for s in list.sh view.sh add.sh …`,
`for agent_md
in code-reviewer.md developer.md …` — and their **lists were written out literally to
satisfy the basename heuristic**. The heuristic is not sloppiness the suite tolerates; it is a
contract the suite has been authored against.

Measured cost of ignoring that: matching runtime paths reports **9 gaps out of 44** mapped changes
at the `v3.1.0` baseline, and hand-checking them shows they are false — `developer.md` is asserted
by the loop at `smoke-features.sh:385`, `view.sh` by the loop at `smoke-backlog-gitlab.sh:40`. A
discriminator that cannot see a loop breaks the very convention the smokes adopted for it.

So the defect is **not** "basenames are the wrong identifier". It is that one surface has a basename
that identifies nothing, and only that surface.

## 3. Requirements

- **FR-001** — A change to a skill that no smoke asserts on is reported as a coverage gap.
- **FR-002** — The identifier for a changed file is decided in **one** place. For
  `templates/core/skills/<name>/SKILL.md` it is the skill name; for every other surface it stays the
  basename, because the suite's loop lists are written to satisfy exactly that.
- **FR-003** — No new false gap. Verified against every mapped surface change back to `v1.0.0`, not
  against an example.
- **FR-004** — The 13 skills above are either genuinely asserted on, or allow-listed with a written
  reason. An allow-list entry with no reason is already ignored by `audit.sh`, so silence is not
  reachable.
- **FR-005** — `smoke-audit.sh` gains a scenario: a planted skill that no synthetic smoke names is
  reported as a gap, **observed failing against the unfixed script first**.
- **FR-006** — The identifier rule is recorded in `scripts/smoke/README.md` beside the other
  heuristics, including the loop-list contract that rules out runtime-path matching — otherwise the
  next reader re-proposes it.

## 4. Success criteria

- **SC-001** — Against the real baseline the audit's verdict is unchanged: exit 0. Measured — at
  `v4.0.1` one skill changed and it is asserted, so the fix does not turn the gate red on landing.
- **SC-002** — The FR-005 assertion is recorded red before the fix and green after.
- **SC-003** — Replaying every mapped surface change from `v1.0.0`, `v2.0.0`, `v3.0.0`, `v3.1.0` and
  `v4.0.0` produces **no gap that hand-checking shows to be false**. The historical gap counts are
  the evidence, and they are recorded.
- **SC-004** — Reintroducing the defect (basename for the skills glob) turns `smoke-audit.sh` red.
- **SC-005** — After FR-004, `audit.sh --since v1.0.0` reports zero un-allow-listed skill gaps. That
  is the widest window the repository has, and it is the only one that exercises all 13.

## 5. 🔒 The decision table

Rows are namespaced `024-Rn`. 022's `R1`–`R13` and 023's `023-Rn` are both live and cited by number
in shipped code.

| The decision                                                                                                                             | Its single home                                                      | What would duplicate it                                                                                                     |
| :--------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------- |
| **024-R1** — What token identifies a changed file for coverage                                                                           | one function in `scripts/smoke/audit.sh`                             | a second `basename` call in the coverage loop; a per-surface special case written inline; a parallel rule in `preflight.sh` |
| **024-R2** — The token must be greppable as a **literal** in a smoke, because the smokes' loop lists are authored to carry literal names | the same function, and `scripts/smoke/README.md` § Audit heuristics  | any matcher that resolves a name the smoke never spells — runtime-path mapping, glob expansion, parsing the smoke           |
| **024-R3** — Which surface uses which token                                                                                              | the `SURFACES` map entry, beside the glob that already decides scope | a lookup table elsewhere keyed on the same globs                                                                            |
| **024-R4** — A guard is proven by being observed red on the defect                                                                       | the `smoke-audit.sh` scenario and the tasks that land it             | a task marked done on a green run alone                                                                                     |

**Deliberately not a row:** "the exit code is the verdict" is **022-R5**, and "a comment is not an
assertion" is **023-R1**. Both are cited in these files already.

## 6. Technical context

bash 3.2 floor, BSD tooling, `set -euo pipefail` in `audit.sh`. The suite runs on every branch push
and `pull_request`. Nothing here ships in `templates/`, so `specnaut init`'s output is unchanged.

## 7. Constitution check

| Principle    | Verdict                                                               |
| :----------- | :-------------------------------------------------------------------- |
| I / II / III | ✅ CLI half only, no private identifier, no product code at the root. |
| IV           | ✅ one submodule commit, then the pointer bump, in that order.        |
| V            | ✅ local `--ff-only` via `scripts/land.sh cli`.                       |
| VI           | ✅ backlog mutations through the `product-owner`.                     |
| VII          | ✅ respected.                                                         |
| VIII         | ⚠️ binds FR-006 — no versions, dates or counts in the README prose.   |
| IX           | ✅ dogfooding output.                                                 |
| X            | ✅ n/a.                                                               |
| XI           | ✅ no consuming project named.                                        |

## 8. Surface impact

Repo-internal tooling only: `scripts/smoke/**`. `.specnaut/release/preflight.sh` is untouched — it
branches on the exit code and never parses the report (022-R5). CI runs the suite on every push and
PR.

## 9. Risks

- **R-1 — a new false gap is worse than the hole it replaces.** A gate that cries wolf gets
  allow-listed into silence. _Mitigation:_ SC-003 replays five baselines and hand-checks, rather
  than trusting one.
- **R-2 — FR-004 is the bulk of the work and the least interesting part.** Writing assertions for 13
  skills invites box-ticking (`[ -f … ]` and nothing more). _Mitigation:_ each assertion must name
  something the skill actually promises, the way the existing ones do.
- **R-3 — the fix is invisible on the landing baseline.** At `v4.0.1` it changes no verdict, so a
  green run proves nothing about it. _Mitigation:_ SC-005 uses the `v1.0.0` window, which is the
  only one that exercises all 13.

## 10. Architecture audit

_Pending — step 6._

## 11. Security audit

_Pending — step 6._

## 12. Open questions

_Pending — step 8._

---

## Amendments after the two audits (2026-08-25)

Both seats ran on the plan before any code. Both returned **fail**, and both reached the same HIGH
independently — by different routes, one reading and one executing. Every finding below was verified
by hand before being accepted.

### The token, settled by measurement

| token                    | skills reported uncovered | the flagship case   |
| :----------------------- | ------------------------: | :------------------ |
| bare `<name>`            |                        12 | **falsely covered** |
| `skills/<name>/`         |                        13 | correctly a gap     |
| `skills/<name>/SKILL.md` |                        13 | correctly a gap     |

**024-R1's token is `skills/<name>/SKILL.md`.** FR-002 originally said "the skill name", which is
the first column — and under it `backlog-reference-contract` matches `smoke-features.sh:591`, an
assertion whose subject is **board's** `SKILL.md`. Delete the skill and that assertion still passes.
The plan's own end-to-end demonstration survived the plan's own fix.

### Findings and disposition

| Finding                                                                                                             | Seat                                                                                         | Verified                                                                               | Disposition                                                                                                                                                                                        |
| :------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **HIGH** — the motivating example survives the fix under FR-002 as written                                          | both, independently                                                                          | yes, measured                                                                          | **Plan changed**: token anchored to the runtime path suffix.                                                                                                                                       |
| **HIGH** — a name mentioned inside an assertion _about another file_ counts as coverage                             | both                                                                                         | yes — `smoke-features.sh:591-592`                                                      | **New row 024-R4.** Not fixed: requiring the assertion's subject to be the file means parsing the smoke, which is the line this suite has repeatedly declined to cross. Recorded as a known limit. |
| **HIGH** — 024-R4 (old) re-spelled 023-R5 word for word                                                             | architect                                                                                    | yes                                                                                    | **Row deleted**, moved under "Deliberately not a row".                                                                                                                                             |
| **HIGH** — the token is constant-true for `specnaut` and `board`                                                    | architect                                                                                    | partly — true for the bare name; with the anchored token both are _genuinely_ asserted | **Accepted as residual** and named in §9. `skills/specnaut/SKILL.md` matches only router assertions, so it cannot fail but its coverage is real.                                                   |
| **MEDIUM** — 22 skills, not 23                                                                                      | architect                                                                                    | yes                                                                                    | **Corrected.** The count of uncovered is 13 **under the chosen token**; it is 12 under the bare name, and stating one without the other is what made this ambiguous.                               |
| **MEDIUM** — `${rest##*                                                                                             | }`takes the LAST field, so a fourth`SURFACES`field silently becomes`kind` for all 11 entries | architect                                                                              | yes — `audit.sh:216-222`                                                                                                                                                                           |
| **MEDIUM** — `case` globs match `/`, so `skills/nest/deep/SKILL.md` matches the glob and derives a two-segment name | security                                                                                     | yes, reproduced                                                                        | **Plan changed**: FR-007.                                                                                                                                                                          |
| **MEDIUM** — FR-004 is a second ticket                                                                              | architect                                                                                    | —                                                                                      | **Open question 1.**                                                                                                                                                                               |
| **LOW** — 024-R2 gave one decision two homes, the second being 023-R6's                                             | architect                                                                                    | yes                                                                                    | **Second home dropped.**                                                                                                                                                                           |
| **LOW** — `audit.sh:262` lacks `--`; allowlist accepts `entry=""` at `:430`; `ci.yml` has no `permissions:` block   | security                                                                                     | yes                                                                                    | **Adopted into tasks**; the `ci.yml` one is pre-existing and unrelated — recorded, not fixed here.                                                                                                 |

**Clean verdicts, with their coverage.** The security seat fuzzed `allow_reason()` with 11 crafted
entries — leading whitespace, tab and vertical-tab separators, a mid-line `#`, a glob path,
duplicate keys in both orders, CRLF, no trailing newline, a 200 KB line, a whitespace-only reason —
and **every silencing case printed a visible reason**. It also committed paths containing a newline
and a quote and confirmed `git diff --name-only` quotes them, so nothing reaches a shell or a regex
position. The gate **cannot get weaker**: the old matcher is constant-true across this surface, so
no input exists where the new one reports covered and the old one reported a gap.

### One claim of mine the architect corrected, and it was right to

§2 said the smokes' loop lists "were written to satisfy the basename heuristic". Counted: **three**
such lists (`smoke-backlog-gitlab.sh:39`, `smoke-backlog-github.sh:48`, `smoke-features.sh:385`),
covering 19 files — but **five** other loops over mapped surfaces iterate bare names and satisfy it
not at all. The convention is deliberate and documented in two places, and it is a **minority**
form. The honest reason to keep basenames elsewhere is not the convention: it is that basenames
produce **zero** false gaps today while runtime paths produce **9 of 44**. Conclusion unchanged,
justification corrected.

## Additional requirements

- **FR-007** — The skill name is derived as exactly one path segment. A file at
  `templates/core/skills/a/b/SKILL.md` must not yield the name `a/b`.

## Additional decision-table rows

| The decision                                                                                  | Its single home                              | What would duplicate it                                                                 |
| :-------------------------------------------------------------------------------------------- | :------------------------------------------- | :-------------------------------------------------------------------------------------- |
| **024-R4** — Naming a file is not asserting about it; the audit measures mention, and says so | `scripts/smoke/README.md` § Audit heuristics | a claim anywhere that the audit verifies assertions; a second caveat in a script header |

**Deliberately not a row:** the observed-red proof rule is **023-R5**, and it already binds this
feature's tasks.

## 12. Open questions — answered

Both answered at the plan stop, **2026-08-25**.

**Q1 — Scope of FR-004. → Everything in this branch.** The mechanism and the 13 assertions ship
together. The alternative — 13 reasoned allow-list entries pointing at a follow-up — was recommended
and was **not** taken: the decision is that a named debt is still a hole, and the hole is the point
of the ticket. R-2 therefore becomes binding rather than advisory: **each assertion must name
something the skill actually promises.** A `[ -f … ]` presence check for all 13 would satisfy the
audit and close nothing, which is the same defect the feature exists to remove, arriving through the
door marked "done".

**Q2 — The mention-versus-assertion class. → A known limit, written down.** 024-R4 stands: the audit
measures a _mention_, and `README.md` says so. Verifying that an assertion's subject is the file
itself means parsing the smoke — the line this suite has declined to cross every time it has come
up, including in #545, whose own out-of-scope section says "stripping comments is the ask, not
understanding them". The anchored token settles the one live instance; the class is recorded, not
chased.

### Decisions taken without asking

- **Token is `skills/<name>/SKILL.md`**, not `skills/<name>/`. Both give 13 gaps today, but the
  fuller path is the one that cannot be satisfied by a phase assertion, so it stays honest as the
  suite grows.
- **The `SURFACES` map keeps three fields.** The token rule lives in the function, not in a fourth
  field, because `${rest##*|}` takes the last field and would silently turn `kind` into the token
  for all 11 entries. That parse change is not worth carrying for one surface.
