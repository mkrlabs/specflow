#!/usr/bin/env bash
# The suite's single entry point. Runs every script in SUITE_FILES against
# the working tree and exits non-zero if any of them is red.
#
# Usage:
#   run-all.sh                 # the whole suite
#   run-all.sh --list          # print the suite membership and exit
#   run-all.sh --only <script> # one script (name from --list)
#   run-all.sh --no-bundle     # skip the re-bundle (see below — rarely right)
#
# ─── Why it bundles first ────────────────────────────────────────────────
# `specnaut init` scaffolds from the GENERATED src/templates_bundle.ts, not
# from templates/ on disk. Verified: a marker appended to a file under
# templates/core/ without re-bundling does not appear in the scaffolded
# output at all.
#
# So a suite that does not bundle first asserts against whatever the bundle
# held when it was last regenerated — it would go green on a change it never
# saw. That is the same defect the suite exists to catch, one level up: a
# mechanism reporting success without having read what it claims to cover.
#
# The regenerated file is restored on exit, because it is a TRACKED file and
# `.specnaut/release/preflight.sh` aborts on a dirty tree. Running the suite
# must not leave the repository in a state that fails an unrelated gate.
set -uo pipefail

. "$(dirname "$0")/_common.sh"

DO_BUNDLE=1
ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --list)
      printf '%s\n' "$SUITE_FILES"
      exit 0
      ;;
    --only)
      ONLY="${2:-}"
      [ -n "$ONLY" ] || die "--only needs a script name (see --list)"
      case "
$SUITE_FILES
" in
        *"
$ONLY
"*) ;;
        *) die "--only '$ONLY' is not in the suite (see --list)" ;;
      esac
      shift 2
      ;;
    --no-bundle) DO_BUNDLE=0; shift ;;
    -h|--help)
      sed -n '2,/^set -/p' "$0" | sed 's/^# \{0,1\}//;/^set -/d'
      exit 0
      ;;
    *) die "unknown flag '$1' (try --help)" ;;
  esac
done

# --- FR-001: the suite guards its own boundary --------------------------
# Every script must resolve its paths inside this repository. This used to be
# a grep a person ran once, for a defect whose entire history is that it
# rots; running it here makes a green run the evidence.
#
# Comments are stripped first: _common.sh documents the old workspace climb
# by quoting it, and a comment resolves nothing. The rule is about what the
# code DOES, not what it mentions.
boundary_hits=0
for f in "$SMOKE_DIR"/*.sh; do
  n="$(sed 's/#.*$//' "$f" | grep -c '\.\./\.\./\.\./\.\.\|apps/specnaut-cli' || true)"
  if [ "$n" -gt 0 ]; then
    echo "❌ $(basename "$f") resolves $n path(s) outside this repository"
    boundary_hits=$((boundary_hits + n))
  fi
done
if [ "$boundary_hits" -gt 0 ]; then
  echo "   The suite must run from a bare clone of this repository (FR-001)."
  exit 1
fi

# --- Re-bundle, and put it back afterwards ------------------------------
BUNDLE="$CLI/src/templates_bundle.ts"
if [ "$DO_BUNDLE" -eq 1 ]; then
  BUNDLE_BAK="$(mktemp)"
  cp "$BUNDLE" "$BUNDLE_BAK"
  # shellcheck disable=SC2064
  trap "cp '$BUNDLE_BAK' '$BUNDLE'; rm -f '$BUNDLE_BAK'" EXIT
  echo "▶ deno task bundle (so the suite reads the working tree, not the committed bundle)"
  ( cd "$CLI" && deno task bundle ) >/dev/null || die "deno task bundle failed"
fi

# --- Run ----------------------------------------------------------------
# Serial, on purpose. clean.sh with no argument wipes the whole sandbox tree,
# and every script traps a cleanup on exit; running them concurrently would
# let one script's trap delete another's fixture mid-run. If this ever needs
# to be parallel, the scenario namespace has to be separated first.
to_run="$SUITE_FILES"
[ -n "$ONLY" ] && to_run="$ONLY"

failed=""
for script in $to_run; do
  stem="${script#smoke-}"; stem="${stem%.sh}"
  scenario="runall-$stem-$$"
  smoke_require_name "$scenario"
  echo
  echo "▶ $script"
  if bash "$SMOKE_DIR/$script" "$scenario"; then
    pass "$script"
  else
    fail "$script" "exit $?"
    failed="$failed $script"
  fi
done

echo
echo "▶ audit"
if bash "$SMOKE_DIR/audit.sh"; then
  pass "audit.sh"
else
  fail "audit.sh" "exit $?"
  failed="$failed audit.sh"
fi

echo
[ -n "$failed" ] && echo "red:$failed"
finish "SUITE"
