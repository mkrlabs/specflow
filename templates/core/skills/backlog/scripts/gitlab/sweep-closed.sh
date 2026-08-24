#!/usr/bin/env bash
# List backlog items whose Status:: label disagrees with the issue's real state.
#
# This script REPORTS. It never moves an issue. Detection and correction are
# split on purpose: `/backlog groom` prints this output read-only, while
# `/specnaut merge` pipes the DRIFTED lines into `move.sh`.
#
# Why reconcile rather than attribute: asking "which issues did my merge close"
# reports success from its own belief about the answer, and every failure in
# that shape is silent. Asking "does the board agree with the repository" makes
# the success criterion the outcome itself.
#
# Output (machine-readable, one per line):
#
#   DRIFTED  <number> <current-status>   closed, but not labelled Status::Done
#   REOPENED <number>                    open, but labelled Status::Done
#   scanned <N>, drifted <M>, reopened <R>
#
# **Read the summary line, not the absence of DRIFTED lines.** `drifted 0` is a
# normal quiet run; `scanned 0` is a failure — the query matched nothing at all,
# which looks identical to a clean board.
#
# Unlike the GitHub backend there is no separate board object here: the
# Status:: scoped label *is* the column, and it lives on the issue. So one
# listing answers both halves, and there is no cross-repository scope to guard
# — a GitLab project is the unit.
#
# Usage: sweep-closed.sh [--since <hours>]     (default 24)
set -euo pipefail

# shellcheck source=./_config.sh
. "$(dirname "$0")/_config.sh"

SINCE_HOURS=24
while [ "$#" -gt 0 ]; do
  case "$1" in
    --since)
      SINCE_HOURS="${2:-}"
      [ -n "$SINCE_HOURS" ] || { echo 'usage: sweep-closed.sh [--since <hours>]' >&2; exit 2; }
      shift 2
      ;;
    -h | --help)
      echo 'usage: sweep-closed.sh [--since <hours>]   (default 24)' >&2
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      exit 2
      ;;
  esac
done
case "$SINCE_HOURS" in
  '' | *[!0-9]*)
    echo "--since expects a whole number of hours, got '$SINCE_HOURS'" >&2
    exit 2
    ;;
esac

SINCE="$(date -u -v-"${SINCE_HOURS}"H '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null \
  || date -u -d "${SINCE_HOURS} hours ago" '+%Y-%m-%dT%H:%M:%SZ')"

CLOSED="$(glab issue list --repo "$PROJECT_ID" --closed --per-page 500 --output json 2>/dev/null || echo '[]')"
OPEN="$(glab issue list --repo "$PROJECT_ID" --per-page 500 --output json 2>/dev/null || echo '[]')"

SCANNED="$(jq -n --argjson c "$CLOSED" --argjson o "$OPEN" '($c | length) + ($o | length)')"

status_of='([.labels[]? | select(startswith("Status::"))][0] // "(unset)") | sub("^Status::"; "")'

DRIFTED="$(jq -c -r --arg since "$SINCE" "
  [ .[] | select((.closed_at // \"\") >= \$since)
        | { number: .iid, status: ($status_of) }
        | select(.status != \"Done\") ]" <<<"$CLOSED")"
REOPENED="$(jq -c -r "[ .[] | { number: .iid, status: ($status_of) } | select(.status == \"Done\") ]" <<<"$OPEN")"

echo "$DRIFTED" | jq -r '.[] | "DRIFTED  \(.number) \(.status)"'
echo "$REOPENED" | jq -r '.[] | "REOPENED \(.number)"'
echo "scanned $SCANNED, drifted $(echo "$DRIFTED" | jq 'length'), reopened $(echo "$REOPENED" | jq 'length')"

if [ "$SCANNED" -eq 0 ]; then
  echo "error: scanned 0 issues on $PROJECT_ID — the query matched nothing, which is not the same as a clean board" >&2
  exit 1
fi
