#!/usr/bin/env bash
# Wipe a single sandbox scenario or the entire sandbox/ tree.
# Usage:
#   clean.sh           # removes the whole sandbox/ tree
#   clean.sh <name>    # removes just sandbox/<name>/
set -euo pipefail

. "$(dirname "$0")/_common.sh"

if [ $# -eq 0 ]; then
  rm -rf "$SANDBOX_ROOT"
  echo "✓ wiped sandbox/"
else
  # Through scenario_dir, which name-checks. Building the path by hand here is
  # what plan.md §5 R11's "what would duplicate it" column names verbatim, and
  # it was written that way anyway: `clean.sh ../../../..` resolved to
  # `rm -rf` two levels above the workspace. Nine call sites feed $NAME here.
  target="$(scenario_dir "$1")"
  rm -rf "$target"
  echo "✓ removed sandbox/$1"
fi
