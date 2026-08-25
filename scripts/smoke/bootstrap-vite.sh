#!/usr/bin/env bash
# Bootstrap a Vite React-TS project under sandbox/<name>/ for Specnaut UX testing.
# Skips `npm install` — deps are not needed to test specnaut's filesystem ops,
# and skipping keeps the scenario fast and small.
# Usage: bootstrap-vite.sh <name>
set -euo pipefail

NAME="${1:?usage: bootstrap-vite.sh <name>}"
. "$(dirname "$0")/_common.sh"
SANDBOX_DIR="$CLI/sandbox/$NAME"

rm -rf "$SANDBOX_DIR"
mkdir -p "$CLI/sandbox"
cd "$CLI/sandbox"

npm create vite@latest "$NAME" -- --template react-ts >/dev/null

echo "✓ bootstrapped Vite React-TS at sandbox/$NAME/"
echo "  (skipped npm install — not needed for specnaut UX tests)"
