#!/usr/bin/env bash
# Verify that a parent issue is safe to close — every linked sub-issue
# must already be closed. Refuses (exit 11) otherwise so the PO can
# surface the open children and finish them first.
#
# Usage:   cascade-check.sh <issue-number>
# Exit:    0  parent has no open children — safe to close
#          11 at least one child is still open — close blocked
#          12 parent is already closed — nothing to gate (short-circuit)
#          3  the parent does not exist, OR its children could not be read
#          2  usage error
#
# EVERY non-zero exit means "do not close". Exit 3 now also covers a failed
# child enumeration: this script answers a safety question, and a question it
# could not answer must never read as a yes.
set -euo pipefail

# shellcheck source=./_config.sh
. "$(dirname "$0")/_config.sh"

if [ "$#" -lt 1 ]; then
  echo 'usage: cascade-check.sh <issue-number>' >&2
  exit 2
fi
NUM="$1"

# One API call covers existence + state. Empty stdout = the issue is not
# reachable (404 or transient) — same exit-3 contract as the previous
# two-call shape, one fewer round trip.
PARENT_STATE=$(gh api "repos/$REPO_OWNER/$REPO_NAME/issues/$NUM" --jq '.state' 2>/dev/null || true)
if [ -z "$PARENT_STATE" ]; then
  echo "✗ issue #$NUM not found in $REPO_OWNER/$REPO_NAME" >&2
  exit 3
fi

# Already-closed short-circuit: callers that trust exit 0 would issue a
# redundant `gh issue close` and get a 422. Surface this explicitly so
# wrappers (PO agent, CI) treat non-zero as "stop, don't close again".
if [ "$PARENT_STATE" = "closed" ]; then
  echo "ℹ #$NUM is already closed — nothing to gate"
  exit 12
fi

# Native sub-issues endpoint (beta). Returns [] when no children exist.
#
# `--paginate` is load-bearing. Without it this read GitHub's default first
# page of 30, so a parent with more children was assessed on a fraction of
# them: the 31st child onward was never fetched, and an epic whose first page
# happened to be closed printed "safe to close" over open work.
#
# And failure is NOT zero. The previous shape ended `2>/dev/null || echo 0`,
# which substituted a count it had never read — a 403, a secondary rate limit,
# a revoked scope, a network blip and a malformed slug all rendered as a clean
# verdict, on any parent, at any size. That one needed no epic to fire.
#
# The parent lookup above already fails closed, and the `cloud` backend's
# sibling is written this way throughout (`rc=0; cmd || rc=$?`, then a check).
# This call was the one that failed open.
rc=0
CHILDREN=$(gh api --paginate "repos/$REPO_OWNER/$REPO_NAME/issues/$NUM/sub_issues" \
  --jq '.[] | "\(.state)\t#\(.number) — \(.title)"' 2>/dev/null) || rc=$?
if [ "$rc" -ne 0 ]; then
  echo "✗ could not read the children of #$NUM — refusing to answer" >&2
  echo "  This is not a verdict: the gate could not see the sub-issues." >&2
  exit 3
fi

# One read, both uses. The blocked path used to issue a SECOND unpaginated
# call to list what it had just counted, so a correctly-blocked parent still
# enumerated at most its first page.
TOTAL=$(printf '%s' "$CHILDREN" | grep -c . || true)
OPEN_LIST=$(printf '%s\n' "$CHILDREN" | sed -n 's/^open\t/  - /p')
OPEN=$(printf '%s' "$OPEN_LIST" | grep -c . || true)

if [ "$OPEN" -gt 0 ]; then
  echo "✗ #$NUM has $OPEN open child issue(s) of $TOTAL — close them first"
  printf '%s\n' "$OPEN_LIST"
  exit 11
fi

# "No child is linked at all" and "every child is closed" are different facts.
# Both are safe to close, and a caller deciding whether a cascade even applies
# could not tell them apart when they shared one sentence.
if [ "$TOTAL" -eq 0 ]; then
  echo "✓ #$NUM has no linked children — no cascade applies"
else
  echo "✓ #$NUM safe to close — all $TOTAL child issue(s) are closed"
fi
exit 0
