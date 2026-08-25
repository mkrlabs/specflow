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

`scripts/smoke/{smoke-audit,smoke-hooks,smoke-picker,smoke-features,run-all}.sh`.
`.specnaut/release/preflight.sh` unchanged — it branches on the exit code and never parses the
report (022-R5). No front-end surface exists in this repository.

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

_Pending._

## 11. Security audit

_Pending._

## 12. Open questions

**None.** Every decision this feature needs was settled by Kevin on 2026-08-25 — the ten answers
recorded in the issue body and in this session. Per his standing instruction the chain does not stop
here; anything genuinely new that his answers do not cover is taken with a stated assumption,
recorded, and reported at the end rather than asked mid-loop.
