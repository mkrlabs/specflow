#!/usr/bin/env bash
# Wipe a single sandbox scenario or the entire sandbox/ tree.
# Usage:
#   clean.sh           # removes the whole sandbox/ tree
#   clean.sh <name>    # removes just sandbox/<name>/
set -euo pipefail

. "$(dirname "$0")/_common.sh"

if [ $# -eq 0 ]; then
  rm -rf "$CLI/sandbox"
  echo "✓ wiped sandbox/"
else
  rm -rf "$CLI/sandbox/$1"
  echo "✓ removed sandbox/$1"
fi
