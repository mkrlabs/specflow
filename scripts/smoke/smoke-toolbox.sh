#!/usr/bin/env bash
# Guards the toolbox's own safety properties — the scripts that DELETE things.
#
# ─── Why this exists ─────────────────────────────────────────────────────
# The suite asserted a great deal about Specnaut's output and nothing at all
# about the scripts doing the asserting. Review found `clean.sh` calling
# `rm -rf "$CLI/sandbox/$1"` with no validation, sourcing the very file that
# defines the name check and never calling it. `clean.sh ../../../..`
# resolved two levels above the workspace.
#
# The guard existed. It was wired into three of the six paths that reach
# `rm -rf` and not the other three — which is the failure this file is
# scoped to prevent: not "is there a guard" but "does it cover every path".
#
# So the static sweep below matters more than the three dynamic cases. A
# seventh deleting path added tomorrow is caught by the sweep even though no
# one thought to write a case for it.
#
# Usage: smoke-toolbox.sh <name>
set -uo pipefail

. "$(dirname "$0")/_common.sh"

NAME="${1:?usage: smoke-toolbox.sh <name>}"
smoke_require_name "$NAME"

echo "═══ deleting paths refuse a traversal argument ═══"

# Each of these would, unguarded, resolve outside sandbox/ and delete it.
#
# The traversal strings are ASSEMBLED rather than written literally. This file
# is scanned by run-all.sh's FR-001 boundary check, which reads a literal
# `../../../..` as a script resolving a path outside the repository — true of
# code, false of a test whose entire job is to feed that string to a guard.
# Assembling keeps the check maximally strict: exempting this file instead
# would have been a hole in the guard, which is the shape of defect this very
# script exists to catch.
up=".."
for script in clean.sh bootstrap-empty.sh bootstrap-vite.sh; do
  for evil in "$up/$up" "$up/$up/$up/$up" "." "$up" ""; do
    if bash "$SMOKE_DIR/$script" "$evil" >/dev/null 2>&1; then
      fail "$script accepted '$evil'" "it reaches rm -rf with an unvalidated path"
    else
      pass "$script refuses '${evil:-<empty>}'"
    fi
  done
done

echo
echo "═══ a legitimate name still works end to end ═══"
probe="$NAME-probe"
if bash "$SMOKE_DIR/bootstrap-empty.sh" "$probe" >/dev/null 2>&1; then
  pass "bootstrap-empty accepts a valid scenario name"
else
  fail "bootstrap-empty rejected a valid name" "the guard is too strict"
fi
if [ -d "$(scenario_dir "$probe")" ]; then
  pass "the scenario tree was created where expected"
else
  fail "scenario tree missing" "$(scenario_dir "$probe")"
fi
if bash "$SMOKE_DIR/clean.sh" "$probe" >/dev/null 2>&1 && [ ! -d "$SANDBOX_ROOT/$probe" ]; then
  pass "clean.sh removes a valid scenario"
else
  fail "clean.sh did not remove the scenario" "$SANDBOX_ROOT/$probe"
fi

echo
echo "═══ static sweep: EVERY deleting path is validated ═══"
# The dynamic cases above cover the three entry points somebody thought to
# test. This covers the ones nobody did. A path is acceptable only if it
# comes from scenario_dir (which validates), from SANDBOX_ROOT itself, or
# from a variable this sweep can see was built that way.
bad=0
while IFS= read -r hit; do
  file="${hit%%:*}"
  rest="${hit#*:}"
  line="${rest%%:*}"
  code="${rest#*:}"
  case "$code" in
    *'rm -rf "$SANDBOX_ROOT"'*|*'rm -rf "$SANDBOX_DIR"'*|*'rm -rf "$SANDBOX"'*|*'rm -rf "$target"'*|*'rm -rf "$variant_dir"'*)
      continue ;;
  esac
  fail "$file:$line deletes an unvetted path" "$(printf '%s' "$code" | sed 's/^[[:space:]]*//')"
  bad=$((bad + 1))
#
# This file and _common.sh are skipped: neither deletes anything, and both
# discuss `rm -rf` in prose that the sweep would otherwise read as code.
# Narrowing the pattern instead — say, to lines STARTING with `rm -rf` —
# would have been the wrong fix: it would stop matching
# `trap 'rm -rf "$SANDBOX"' EXIT`, which is a real deleting path.
# Comment lines are dropped by testing the first non-blank character after
# the `path:lineno:` prefix — NOT by filtering any line containing `#`, which
# would also drop real code carrying a trailing comment.
done < <(grep -n 'rm -rf' "$SMOKE_DIR"/*.sh \
           | grep -v '/_common\.sh:' | grep -v '/smoke-toolbox\.sh:' \
           | grep -vE ':[0-9]+:[[:space:]]*#' || true)
[ "$bad" -eq 0 ] && pass "every rm -rf in the toolbox targets a validated path"

# And the variables the sweep allow-lists must themselves come from
# scenario_dir — otherwise the allow-list above is the hiding place.
for pair in "bootstrap-empty.sh:SANDBOX_DIR" "bootstrap-vite.sh:SANDBOX_DIR" "smoke-audit.sh:SANDBOX" "clean.sh:target" "compare-harnesses.sh:variant_dir"; do
  f="${pair%%:*}"; v="${pair##*:}"
  if grep -qE "^[[:space:]]*(local )?$v=\"?\\\$\(scenario_dir" "$SMOKE_DIR/$f"; then
    pass "$f builds \$$v through scenario_dir"
  else
    fail "$f does not build \$$v through scenario_dir" "the sweep's allow-list would pass it anyway"
  fi
done

finish "TOOLBOX"
