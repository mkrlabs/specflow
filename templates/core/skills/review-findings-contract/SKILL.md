---
name: review-findings-contract
description: Defines the machine-readable REVIEW SUMMARY block every expert/reviewer emits once after its prose, with severity counts and a verdict. Preloaded, not user-invocable.
user-invocable: false
---

# review-findings-contract

This skill defines the **REVIEW SUMMARY** block. Agents that preload it
(`architect-expert`, `performance-expert`, `security-expert`,
`accessibility-expert`, `dependency-expert`, `code-reviewer`, `test-reviewer`, and the
`review-coordinator`) emit exactly one such block **after their prose** (and
before the WORKFLOW STATUS block when the agent also carries `workflow-contract`).
It normalizes the review's severity counts and verdict so a coordinator can
synthesize multiple seats' findings without re-reading each prose report. The
`review-coordinator` emits the same block with the **aggregated** counts summed
across every seat. The block is additive — it appends to the prose, never
replaces it.

## Format

```text
REVIEW SUMMARY
REVIEW_SCOPE: <reviewer name or gate scope>
REVIEW_VERDICT: pass | fail | needs_followup
SEATS_EXPECTED: <integer>
SEATS_REPORTED: <integer>
CRITICAL_COUNT: <integer>
HIGH_COUNT: <integer>
MEDIUM_COUNT: <integer>
LOW_COUNT: <integer>
TOP_ISSUES: <one sentence, or up to 5 lines | none>
RECOMMENDATION: <one sentence — what the next actor should do>
```

## Rules

- `REVIEW_VERDICT: pass` only when `CRITICAL_COUNT == 0` **and** `HIGH_COUNT == 0`
  **and** `SEATS_REPORTED == SEATS_EXPECTED`.
- `REVIEW_VERDICT: fail` when `CRITICAL_COUNT > 0` **or** `HIGH_COUNT > 0`
  **or** `SEATS_REPORTED < SEATS_EXPECTED`.
- **A seat that could not review is not a seat that reported.** The two counts
  exist so that "nobody looked" has an arithmetic representation, instead of
  being a prose note beside an all-zero block that reads as clean. A single
  reviewer emits `1`/`1`, or `1`/`0` when it is declaring itself unable.
- `REVIEW_VERDICT: needs_followup` when only Medium/Low findings remain.
- Every count is an explicit integer, including `0`.
- Verdict and counts must never contradict.
