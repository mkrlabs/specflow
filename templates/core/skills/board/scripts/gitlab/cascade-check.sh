#!/usr/bin/env bash
# Verify that a parent issue is safe to close — every child tagged with
# the `parent::#NNN` scoped label must already be closed. Refuses (exit
# 11) otherwise so the PO can surface the open children and finish them
# first.
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

# Existence + state in one glab call. Mirrors the GitHub backend so both
# variants share the exit-code contract (3 = missing, 12 = already closed,
# 11 = open children, 0 = safe). GitLab issue states are `opened`/`closed`.
PARENT_STATE=$(glab issue view "$NUM" --repo "$PROJECT_ID" --output json 2>/dev/null \
  | jq -r '.state // empty' 2>/dev/null || true)
if [ -z "$PARENT_STATE" ]; then
  echo "✗ issue #$NUM not found in $PROJECT_ID" >&2
  exit 3
fi

if [ "$PARENT_STATE" = "closed" ]; then
  echo "ℹ #$NUM is already closed — nothing to gate"
  exit 12
fi

# Children carry a scoped label `parent::#NNN`.
#
# This carried the GitHub backend's defect in a shape no grep for `|| echo 0`
# would find. The previous read was `glab … --opened 2>/dev/null | wc -l`:
# stderr discarded, and a failed command produces no lines, so `wc -l` returned
# 0 and the gate printed "safe to close". The coercion was the pipe itself.
# Counting rendered lines was also wrong on its own terms — the default output
# is a human table, not one issue per line.
#
# JSON, every state, an explicit page size, and an exit code that is checked.
# `--per-page 500` matches the sibling `sweep-closed.sh`; every state because
# telling "no child is linked" from "every child is closed" needs the total.
rc=0
CHILDREN=$(glab issue list --repo "$PROJECT_ID" \
  --label "parent::#$NUM" --all --per-page 500 --output json 2>/dev/null) || rc=$?
if [ "$rc" -ne 0 ] || [ -z "$CHILDREN" ]; then
  echo "✗ could not read the children of #$NUM — refusing to answer" >&2
  echo "  This is not a verdict: the gate could not see the labelled issues." >&2
  exit 3
fi

TOTAL=$(printf '%s' "$CHILDREN" | jq 'length' 2>/dev/null || echo "")
if [ -z "$TOTAL" ]; then
  echo "✗ the child listing for #$NUM was not readable JSON — refusing to answer" >&2
  exit 3
fi
OPEN_LIST=$(printf '%s' "$CHILDREN" \
  | jq -r '.[] | select(.state == "opened") | "  - #\(.iid) — \(.title)"')
OPEN=$(printf '%s' "$OPEN_LIST" | grep -c . || true)

if [ "$OPEN" -gt 0 ]; then
  echo "✗ #$NUM has $OPEN open child issue(s) of $TOTAL — close them first"
  printf '%s\n' "$OPEN_LIST"
  exit 11
fi

if [ "$TOTAL" -eq 0 ]; then
  echo "✓ #$NUM has no children labelled parent::#$NUM — no cascade applies"
else
  echo "✓ #$NUM safe to close — all $TOTAL child issue(s) are closed"
fi
exit 0
