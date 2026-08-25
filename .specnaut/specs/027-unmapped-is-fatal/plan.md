# 027 — A file no glob claims stops passing on a green gate

**Issue:**
[#549 — A non-ASCII path escapes every surface glob and the gate stays green](https://github.com/specnaut/specnaut-cli/issues/549)
**Branch:** `027-unmapped-is-fatal`

**Process deviation, recorded rather than hidden.** Kevin's ceremony ruling is full chain for an M.
This document was written _after_ the implementation, and the two plan-time audits were not run
before the code. The AC6 enumeration — which is what actually decided the design — was done first,
and the review still runs before landing. Stated so the record is accurate.

## 1. What the enumeration decided

AC6 requires the unmapped population be enumerated **before** the bucket turns fatal. Doing that
first changed the shape of the work twice.

| baseline           | unmapped, before | after mapping | outside the surface |
| :----------------- | ---------------: | ------------: | ------------------: |
| `v4.0.1` (release) |                0 |             0 |                   0 |
| `v4.0.0`           |                2 |             0 |                   0 |
| `v3.1.0`           |               16 |             0 |                   4 |
| `v2.0.0`           |              165 |             0 |                   5 |
| `v1.0.0`           |              187 |             0 |                  18 |

**First correction: most unmapped categories already had smoke coverage** and simply were never
mapped — `templates/core/root/*`, the `using-specnaut` references, the scaffold templates,
`board/groom.md`. Mapping them is the work; allow-listing them would have been the lazy answer to a
question nobody asked.

**Second correction: two categories cannot be mapped, and they are not alike.**

- `templates/core/specnaut/memory/**` — scaffolded verbatim, read by agents, never executed. A smoke
  can assert the tree arrives; asserting each document's prose is a category error. **Named
  exemption in code**, the shape `templates/manifest.json` already had. Not the allow-list: that
  file matches exact paths, and a hundred entries would make it the dumping ground 022-R13 exists to
  prevent.
- `src/cli/**` — product source. #544 added it to the pathspec _precisely so it would be visible
  here_, and that decision stands. But the smoke suite tests scaffolded output, not this
  repository's TypeScript, which the 1400-test deno suite covers. Making it fatal would block most
  CLI work on the wrong grounds. **Reported in its own class: visible, never silent, never fatal.**
  Both decisions survive; only the conflation between them is gone.

## 2. 🔒 Decisions

Rows namespaced `027-Rn`. 022's, 023's, 024's and 026's rows are live.

| The decision                                                        | Its single home                              | What would duplicate it                                                                                      |
| :------------------------------------------------------------------ | :------------------------------------------- | :----------------------------------------------------------------------------------------------------------- |
| **027-R1** — What counts as a scaffolded surface the map must claim | the `SURFACES` array                         | a second list of "things we ship"; a per-category rule elsewhere                                             |
| **027-R2** — Which categories are exempt, and why                   | the named `case` arms in the unmapped branch | an allow-list entry standing in for a whole tree; a comment that states an exemption without implementing it |
| **027-R3** — What is visible but not fatal                          | the `outside_*` class in the same branch     | folding product source into the fatal count; dropping it from the pathspec to make the number go away        |

## 3. What shipped

- **AC1** `git -c core.quotePath=false` — git escaped and quoted non-ASCII paths, so they matched no
  glob and left through the bucket.
- **AC3/AC5** the bucket is fatal, and the rationale that argued the opposite is replaced. Its
  premise was false: the recourse it said did not exist is the same allow-list an uncovered mapped
  file already uses.
- **AC4** the allow-list is now **consulted** for the unmapped class. Making the bucket fatal
  without wiring it would have left the documented escape hatch unimplemented — and the witness for
  it green because the rule was never reached rather than because it worked.
- **AC2** a non-ASCII file is judged by the coverage scan, pinned by a witness observed red against
  the un-quoted diff.
- **AC7** the delta: on the release baseline the audit stays at 0/0 and exits 0. Wider windows now
  report real coverage gaps that were previously hidden in a non-fatal bucket — 18 at `v1.0.0`, 10
  at `v3.1.0`, 0 at `v4.0.0` and `v4.0.1`. **No retroactive red on the baseline the gate actually
  uses.**

## 4. Risks

- **R-1 — a new shipped category now blocks.** That is the accepted cost of Kevin's ruling; the
  escape is one allow-list line with a reason, and 022-R13 refuses it without one.
- **R-2 — `case` globs traverse `/`.** A glob like `templates/core/specnaut/*.md` swallowed the
  entire memory tree and turned 150 documents into gaps. Every glob added here is explicit for that
  reason.
- **R-3 — two destructive commands cost real work in this ticket** (`git reset --hard` and
  `git checkout --` over uncommitted edits). Mitigated after the fact by committing before any probe
  that needs a commit.
