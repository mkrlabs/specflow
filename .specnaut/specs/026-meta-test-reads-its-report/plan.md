# 026 — The auditor's own test reads the auditor's report

**Issue:**
[#546 — The smoke meta-test does not read its own report](https://github.com/specnaut/specnaut-cli/issues/546)
**Branch:** `026-meta-test-reads-its-report`

The issue body carries the why, the ten acceptance criteria and Kevin's settled decisions of
2026-08-25. This document does not restate them; it carries what the issue does not — the decision
table, the surfaces, and the audits.

## 1. Why this exists

`smoke-audit.sh` guards `audit.sh`, the coverage gate every release depends on, and asserts on exit
codes while capturing reports it never reads. An auditor whose own test does not read the auditor's
report fails in exactly the way it exists to catch elsewhere: silently.

**Measured on the tree before touching anything**, because the issue asks for re-enumeration rather
than trust:

- Six `*_out` captures, matching the issue's count.
- Five are read by an assertion on their content. **`clean_out` is not** — its only reader is
  `fail "audit exited …" "$(tail -6 <<<"$clean_out")"`, a diagnostic inside the failure branch. A
  diagnostic is not an assertion; it runs only once the assertion has already decided.
- The AC2 target is real: `grep -q "allow-listed" <<<"$allow_out"` is satisfied by `audit.sh`'s
  summary line `N allow-listed gap(s) (not fatal)` exactly as readily as by the per-file
  `~ <path> (allow-listed)`.
- `setup-plan` appears in no smoke script, so AC9's two gaps are live.

## 2. User scenarios

**P1 — a captured report is read, or it is not captured.** _Given_ any `*_out` in `smoke-audit.sh`,
_when_ the suite runs, _then_ at least one assertion reads its **content**, or the capture is gone.

**P2 — an assertion distinguishes the line it names from the summary.** _Given_ `audit.sh` prints
both a per-file and a summary form of the same word, _when_ the meta-test asserts on that word,
_then_ it fails if the per-file line disappears and the summary remains.

**P3 — a failure names one cause, not five.** _Given_ `smoke-picker.sh` times out on one keystroke,
_when_ it reports, _then_ one finding is reported rather than the nine that follow from it.

**P4 — a suite script reports through the suite's contract.** _Given_ `run-all.sh` aborts on its own
boundary check, _when_ it exits, _then_ it goes through `fail`/`finish` like everything else.

**Edge cases** — a fixture whose lock is moved aside must be restored even on abort (AC6); an
assertion that genuinely cannot be written must say so in the file rather than be quietly dropped
(AC5).

## 3. Requirements

The ten acceptance criteria in the issue are the requirements. This plan adds one:

- **FR-011** — Every assertion added or rewritten here is **observed failing** against the defect it
  pins, before the fix that makes it pass. 023-R5 already binds this; it is restated because AC9
  names it explicitly and AC1–AC8 do not.

## 4. Success criteria

- **SC-001** — `audit.sh` on the real baseline still exits 0; `run-all.sh` green.
- **SC-002** — Over the `v1.0.0` window, zero un-allow-listed gaps remain on the
  `specnaut-helper-script` surface (AC10). That window is the only one that exercises the two
  `setup-plan` files.
- **SC-003** — Deleting AC1's assertion changes no verdict anywhere: proven by running the suite
  before and after that single deletion.
- **SC-004** — Each new assertion is recorded red on its own defect (FR-011), with the output kept
  in `tasks.md`.
- **SC-005** — `smoke-picker.sh` on a deliberately broken keystroke sequence reports **one**
  finding, not nine.

## 5. 🔒 The decision table

Rows are namespaced `026-Rn`. 022's `R1`–`R13`, 023's and 024's rows are all live and cited by
number in these files.

| The decision                                                                                             | Its single home                               | What would duplicate it                                                                  |
| :------------------------------------------------------------------------------------------------------- | :-------------------------------------------- | :--------------------------------------------------------------------------------------- |
| **026-R1** — A captured report is either read by an assertion on its content, or not captured            | `smoke-audit.sh`, at each capture site        | a capture kept "for the failure message"; a `fail` diagnostic counted as the reader      |
| **026-R2** — An assertion names the **specific line shape** it depends on, never a word both forms share | the assertion's own grep pattern              | an unanchored `grep -q` over a report that prints per-file and summary forms of one word |
| **026-R3** — A failure that makes later assertions meaningless short-circuits                            | `smoke-picker.sh`'s timeout branch            | `fail` followed by continued execution; a second "did it time out" test downstream       |
| **026-R4** — A suite script reports through `fail`/`finish`                                              | `_common.sh`'s harness, asked by every script | a bare `exit` in a suite member; a second closing banner                                 |
| **026-R5** — Fixture state moved aside is restored by a trap, not by the next line                       | the `trap` at each move site                  | a paired `mv` back with no trap between them                                             |

**026-R4 was cut.** It re-spelled **022-R4** (_"How a check reports pass/fail → `_common.sh`
(pass/fail/counter/banner)"_) word for word. AC8 is therefore a **conformance defect against an
already-owned row**, not a new rule — `run-all.sh`'s bare `exit 1` violates 022-R4 and is cited that
way.

**Deliberately not a row:** "a guard is proven by being observed red" is **023-R5**; "an assertion
must name what a file promises" is **024-R4**'s neighbour and is cited by AC9. Neither is restated
here.

## 6. Technical context

bash 3.2 floor, BSD tooling, `set -euo pipefail` in `audit.sh` and `smoke-audit.sh`; `run-all.sh`
and `smoke-toolbox.sh` carry `-uo` only. The suite runs on every branch push and `pull_request`.
Nothing here ships in `templates/` except the two `setup-plan` assertions' targets, which are read,
not modified.

## 7. Constitution check

I/II/III ✅ CLI half only. IV ✅ one submodule commit then the pointer. V ✅ local `--ff-only` via
`land.sh`. VI ✅ board through the `product-owner`. VII ✅. VIII ⚠️ binds any prose added to
`scripts/smoke/README.md` — no counts, versions or dates. IX ✅ dogfooding. X ✅ n/a. XI ✅ no
consuming project named.

## 8. Surface impact

`scripts/smoke/{smoke-audit,smoke-hooks,smoke-picker,smoke-features,run-all}.sh`. Plus
`scripts/smoke/coverage-allowlist.txt` (022-R13 is AC10's only lever if an assertion cannot close a
gap) and `scripts/smoke/README.md` (§7's constitution clause anticipates prose there; 024-R4's home
is that file). `.specnaut/release/preflight.sh` unchanged — it branches on the exit code and never
parses the report (022-R5). No front-end surface exists in this repository.

## 9. Risks

- **R-1 — deleting an assertion is the one change a reviewer will challenge.** _Mitigation:_ SC-003
  proves it changes no verdict, and the replacing comment records why it cannot simply be
  reinstated.
- **R-2 — AC5 invites a green assertion that asserts nothing**, which is the defect this ticket is
  about. _Mitigation:_ if the contract genuinely cannot be asserted, the file must say why — the
  issue permits that explicitly, and silence is not one of the two options.
- **R-3 — nine one-line fixes across five files invite a green run as evidence.** _Mitigation:_
  FR-011. A green suite proves nothing about an assertion nobody has seen fail.

## 10. Architecture audit

`architect-expert`, on the plan. **Verdict: fail** — 0 critical, 2 high, 2 medium, 1 low. Every
finding verified by hand before acceptance.

| Finding                                                                                                                                                                     | Verified                                                                                                                                                                              | Disposition                                                                                                                                                                                                                        |
| :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **HIGH** — 026-R4 re-spells 022-R4 verbatim                                                                                                                                 | yes, read side by side                                                                                                                                                                | **Row cut.** AC8 recited as a conformance defect against 022-R4.                                                                                                                                                                   |
| **HIGH** — §8 omits `coverage-allowlist.txt` and `README.md`, which AC10 and §7 require                                                                                     | yes                                                                                                                                                                                   | **§8 extended.**                                                                                                                                                                                                                   |
| **MEDIUM** — 026-R1's `*_out` glob is structurally blind                                                                                                                    | yes, and my own check was blind too: my pattern required `out=$(` and missed `out="$("`. Correctly counted, **16** captures across three files are invisible to the glob (3 + 11 + 2) | **Accepted, scope held.** AC4 is implemented as written (the six `*_out` in `smoke-audit.sh`). A lexical detector is the better fix and is in no AC and in none of Kevin's answers — filed as a follow-up rather than smuggled in. |
| **MEDIUM** — AC5's premise is half wrong: `smoke-hooks.sh:104-105` _does_ assert `ec=0`; the unasserted part is the bare `echo` at `:108`, and the disjunction is queryable | yes — `command -v gh` appears nowhere in the file                                                                                                                                     | **Plan changed.** AC5 is satisfied by branching on `command -v gh`, not by the escape hatch. The hatch is not used.                                                                                                                |
| **LOW** — AC6 names one mutation pair; `sed -i.bak` at `:100-103` is a second; SC-005's "nine" is ten                                                                       | yes                                                                                                                                                                                   | **Both folded in**; SC-005 pinned by observation rather than by a counted number.                                                                                                                                                  |

## 11. Security audit

`security-expert`, same dispatch. **Verdict: needs_followup** — 0 critical, 0 high, 1 medium, 3 low.

| Finding                                                                                                                                                                                                                                                                                  | Verified                                         | Disposition                                                                                                                    |
| :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------- |
| **MEDIUM** — AC6's real leak is `/tmp/spec-lock-backup-$$`, not the fixture (the EXIT trap at `:14` already wipes the tree). The name is PID-predictable in a world-writable directory; on a cross-filesystem `/tmp`, `mv` degrades to copy+unlink and **follows a destination symlink** | yes, and I had independently found the trap half | **Plan changed.** The backup moves **inside `$DIR`**, which the existing trap already covers.                                  |
| **MEDIUM, second half** — bash cannot append traps, so a `trap … EXIT` added for AC6 would **silently replace** the `clean.sh` trap and leak every scenario tree                                                                                                                         | yes                                              | **Binding on the implementation: no second trap in `smoke-hooks.sh`.** This is the finding I was most likely to walk into.     |
| **LOW** — AC8 has no restore hazard (the `exit` precedes the backup and its trap), but `fail` without an adjacent `finish` continues into `deno task bundle` on a tree just declared out of bounds                                                                                       | yes                                              | `fail` and `finish` land adjacently.                                                                                           |
| **LOW** — AC7's Python driver orphans the PTY child on the deadline path: it closes the fd and returns with no `kill`/`waitpid`                                                                                                                                                          | yes                                              | Reap in the driver before returning, then `fail` + `finish`.                                                                   |
| **AC1** — deletion confirmed harmless, **but the plan's stated ground is wrong**: 3f pins `commentonly_out`, a different scenario. The real ground is `:279` (`clean_rc -eq 0`) and `:287` (`rc -eq 1`, strictly stronger)                                                               | yes                                              | **Corrected.** The replacing comment cites those two, not 3f. This came from the issue body and I carried it without checking. |

## 12. Open questions

**None.** Every decision this feature needs was settled by Kevin on 2026-08-25 — the ten answers
recorded in the issue body and in this session. Per his standing instruction the chain does not stop
here; anything genuinely new that his answers do not cover is taken with a stated assumption,
recorded, and reported at the end rather than asked mid-loop.
