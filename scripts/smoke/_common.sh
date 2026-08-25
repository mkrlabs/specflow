# shellcheck shell=bash
# Shared header for every script under scripts/smoke/. Source it; do not run it.
#
#   . "$(dirname "$0")/_common.sh"
#
# ─── Why this file exists ────────────────────────────────────────────────
# Fifteen scripts used to open with the same four lines:
#
#   ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
#   CLI="$ROOT/apps/specnaut-cli"
#
# — a climb that hardcoded both the workspace layout AND each file's own
# depth. It is why relocating the suite was a fifteen-file edit, and why
# the suite could not run from a bare clone of this repository. Correcting
# it fifteen times would have reproduced the defect one directory deeper.
# This file is the single home for that decision (plan.md §5 R1).
#
# ─── bash 3.2 ────────────────────────────────────────────────────────────
# macOS ships bash 3.2 and the maintainer runs this suite there.
# smoke-all-harnesses.sh:19-21 already pays that cost deliberately. So:
# no `declare -A`, no `mapfile`, no `${var,,}`, no `+=` on strings.
# Code written to bash 4 passes CI on ubuntu-latest and breaks silently on
# the one machine the interactive scenarios exist for.

# --- Paths ---------------------------------------------------------------
# Derived from THIS file's location, never from the caller's cwd. A caller
# standing anywhere gets the same answer, which is what lets smoke-audit.sh
# point the audit at a synthetic tree without relocating anything.
SMOKE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI="$(cd "$SMOKE_DIR/../.." && pwd)"
SRC_ROOT="$CLI"
SANDBOX_ROOT="$CLI/sandbox"
# audit.sh may be pointed at a foreign smoke directory (--smoke-dir); it
# compares against this to know whether SUITE_FILES applies.
DEFAULT_SMOKE_DIR="$SMOKE_DIR"

# --- Suite membership (plan.md §5 R3) ------------------------------------
# The one answer to "which scripts constitute the suite". run-all.sh runs
# SUITE_FILES; audit.sh enumerates what it scans from the smoke directory
# itself and checks THIS list against that enumeration, so a script that
# exists but is not listed is a finding rather than a silent omission.
#
# There is deliberately no second list here. An earlier revision declared a
# `SCAN_FILES` alongside this one; when audit.sh moved to enumerating the
# directory, that declaration kept its documentation and lost its only
# reader — a second spelling of membership that had stopped meaning
# anything while still reading like the source of truth.
SUITE_FILES="smoke-toolbox.sh
smoke-features.sh
smoke-backlog-local.sh
smoke-backlog-github.sh
smoke-backlog-gitlab.sh
smoke-hooks.sh
smoke-picker.sh
smoke-all-harnesses.sh
smoke-tag-release.sh
smoke-audit.sh"

# --- Failure ------------------------------------------------------------
die() { echo "❌ $*" >&2; exit 1; }

# --- Scenario names (plan.md §5 R11) ------------------------------------
# Every scenario name reaches `rm -rf "$SANDBOX_ROOT/$NAME"`, and clean.sh
# with no argument wipes the whole sandbox tree. Until run-all.sh existed
# every caller passed a literal, so nothing could go wrong; run-all.sh is
# the first programmatic caller, and `--only <name>` is the obvious next
# affordance. Validate once, here, rather than in sixteen places later.
smoke_require_name() {
  case "${1:-}" in
    "" ) die "scenario name required" ;;
    .|.. ) die "invalid scenario name: '$1'" ;;
    *[!A-Za-z0-9._-]* ) die "invalid scenario name: '$1' (allowed: A-Z a-z 0-9 . _ -)" ;;
  esac
}

# Absolute path of a scenario tree, name-checked.
scenario_dir() { smoke_require_name "${1:-}"; echo "$SANDBOX_ROOT/$1"; }

# --- Assertion harness (plan.md §5 R4) ----------------------------------
# Nine scripts each carried their own pass/fail/counter and printed one of
# twelve different closing banners. FR-013 requires that a red run NAME the
# assertion that failed; that needs one shape, not twelve.
fails=0
pass() { echo "✓ $1"; }
fail() { echo "❌ $1${2:+ — $2}"; fails=$((fails + 1)); }

# check "<description>" "<shell expression>"
# The expression is a literal from the script body — never external input.
check() {
  if eval "$2" >/dev/null 2>&1; then pass "$1"; else fail "$1" "command: $2"; fi
}

# finish "<LABEL>" — the single closing banner. Exits 0 clean, 1 with fails.
finish() {
  echo
  if [ "$fails" -eq 0 ]; then
    echo "═══ $1: ALL CHECKS PASSED ═══"
    exit 0
  fi
  echo "═══ $1: $fails CHECK(S) FAILED ═══"
  exit 1
}
