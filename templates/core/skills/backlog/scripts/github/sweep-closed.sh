#!/usr/bin/env bash
# List backlog items whose board column disagrees with the issue's real state.
#
# This script REPORTS. It never moves a card. Detection and correction are
# split on purpose: `/specnaut groom` prints this output read-only, while
# `/specnaut merge` pipes the DRIFTED lines into `move.sh`. A read-only core
# cannot mutate anything from the wrong caller, and both callers get the same
# answer to "what drifted".
#
# Why reconcile rather than attribute: asking "which issues did my merge close"
# reports success from its own belief about the answer, and every failure in
# that shape is silent. Asking "does the board agree with the repository"
# makes the success criterion the outcome itself.
#
# Output (machine-readable, one per line):
#
#   DRIFTED  <number> <current-status>   closed, but not in Done
#   REOPENED <number>                    open, but sitting in Done
#   scanned <N>, drifted <M>, reopened <R>
#
# **Read the summary line, not the absence of DRIFTED lines.** `drifted 0` is a
# normal quiet run; `scanned 0` is a failure — it means the query matched
# nothing at all, which looks identical to a clean board. That distinction is
# the whole point of the summary existing.
#
# Scope: this repository only, and issues closed within --since hours. The
# board is org-wide, so an unscoped sweep would report cards this repository's
# work never touched.
#
# `--passes 2` re-scans after a short pause and unions the results. GitHub's
# auto-close lands 1–2s after the push, so a sweep run immediately by the merge
# phase can legitimately see an issue that is not closed *yet* — and a single
# pass would report a clean board with total confidence. Grooming needs no
# second pass; a merge does.
#
# Usage: sweep-closed.sh [--since <hours>] [--passes <n>]   (default 24, 1)
set -euo pipefail

# shellcheck source=./_config.sh
. "$(dirname "$0")/_config.sh"

SINCE_HOURS=24
PASSES=1
while [ "$#" -gt 0 ]; do
  case "$1" in
    --passes)
      PASSES="${2:-}"
      [ -n "$PASSES" ] || { echo 'usage: sweep-closed.sh [--since <hours>] [--passes <n>]' >&2; exit 2; }
      shift 2
      ;;
    --since)
      SINCE_HOURS="${2:-}"
      [ -n "$SINCE_HOURS" ] || { echo 'usage: sweep-closed.sh [--since <hours>]' >&2; exit 2; }
      shift 2
      ;;
    -h | --help)
      echo 'usage: sweep-closed.sh [--since <hours>] [--passes <n>]   (default 24, 1)' >&2
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      echo 'usage: sweep-closed.sh [--since <hours>]' >&2
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
case "$PASSES" in
  '' | *[!0-9]* | 0)
    echo "--passes expects a positive whole number, got '$PASSES'" >&2
    exit 2
    ;;
esac

ALL_DRIFTED='[]'
ALL_REOPENED='[]'
SCANNED=0

pass=1
while [ "$pass" -le "$PASSES" ]; do
  [ "$pass" -gt 1 ] && sleep 5

  # One project read, then one issue-state read per repo — not per item.
  ITEMS="$(gh project item-list "$PROJECT_NUMBER" --owner "$REPO_OWNER" \
    --format json --limit 500 2>/dev/null || true)"
  if [ -z "$ITEMS" ]; then
    echo "error: could not read Project #$PROJECT_NUMBER for owner $REPO_OWNER" >&2
    exit 1
  fi

  # `.content.repository` — NOT `.repository`. Filtering on the latter silently
  # yields an empty set, which reads as "the board is clean" when it is not.
  SCOPED="$(echo "$ITEMS" | jq -c --arg repo "$REPO" '
    [ .items[]
      | select(.content.type == "Issue")
      | select((.content.repository // "") | endswith($repo))
      | { number: .content.number, status: (.status // "(unset)") } ]')"

  SCANNED="$(echo "$SCOPED" | jq 'length')"

  # Issue state is not exposed by `item-list`, so read it per repo in one call.
  CLOSED="$(gh issue list --repo "$REPO" --state closed --limit 500 \
    --search "closed:>=$(date -u -v-"${SINCE_HOURS}"H '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null \
      || date -u -d "${SINCE_HOURS} hours ago" '+%Y-%m-%dT%H:%M:%SZ')" \
    --json number --jq '[.[].number]' 2>/dev/null || echo '[]')"
  OPEN="$(gh issue list --repo "$REPO" --state open --limit 500 \
    --json number --jq '[.[].number]' 2>/dev/null || echo '[]')"

  D="$(jq -n -c --argjson items "$SCOPED" --argjson closed "$CLOSED" '
    [ $items[] | select(.status != "Done") | select(.number as $n | $closed | index($n)) ]')"
  R="$(jq -n -c --argjson items "$SCOPED" --argjson open "$OPEN" '
    [ $items[] | select(.status == "Done") | select(.number as $n | $open | index($n)) ]')"

  # Union across passes, keyed on number: a later pass can only ever add.
  ALL_DRIFTED="$(jq -n -c --argjson a "$ALL_DRIFTED" --argjson b "$D" \
    '($a + $b) | group_by(.number) | map(.[0])')"
  ALL_REOPENED="$(jq -n -c --argjson a "$ALL_REOPENED" --argjson b "$R" \
    '($a + $b) | group_by(.number) | map(.[0])')"

  pass=$((pass + 1))
done

DRIFTED="$ALL_DRIFTED"
REOPENED="$ALL_REOPENED"

echo "$DRIFTED" | jq -r '.[] | "DRIFTED  \(.number) \(.status)"'
echo "$REOPENED" | jq -r '.[] | "REOPENED \(.number)"'

echo "scanned $SCANNED, drifted $(echo "$DRIFTED" | jq 'length'), reopened $(echo "$REOPENED" | jq 'length')"

# A board with items is the precondition for this script meaning anything. Zero
# is not "nothing drifted" — it is "the query found no items", which happens
# when the project number is wrong or the repo filter matched nothing.
if [ "$SCANNED" -eq 0 ]; then
  echo "error: scanned 0 board items for $REPO — the query matched nothing, which is not the same as a clean board" >&2
  exit 1
fi
