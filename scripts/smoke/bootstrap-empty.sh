#!/usr/bin/env bash
# Bootstrap an empty greenfield project under sandbox/<name>/ for Specnaut UX
# testing. Stub package.json so it looks like a real (just-created) project.
# Usage: bootstrap-empty.sh <name>
set -euo pipefail

NAME="${1:?usage: bootstrap-empty.sh <name>}"
. "$(dirname "$0")/_common.sh"
SANDBOX_DIR="$(scenario_dir "$NAME")"

rm -rf "$SANDBOX_DIR"
mkdir -p "$SANDBOX_DIR"
cd "$SANDBOX_DIR"
git init -q
cat >package.json <<EOF
{
  "name": "$NAME",
  "version": "0.0.0",
  "private": true
}
EOF

echo "✓ bootstrapped empty greenfield project at sandbox/$NAME/"
