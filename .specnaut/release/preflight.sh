#!/usr/bin/env bash
# Specnaut CLI release preflight. Exit ≠ 0 ⇒ release aborts.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

echo "▶ branch check"
branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$branch" = "main" ] || { echo "❌ not on main (on $branch)"; exit 1; }

echo "▶ working tree clean"
[ -z "$(git status --porcelain)" ] || { echo "❌ working tree dirty"; git status --short; exit 1; }

echo "▶ in sync with origin/main"
git fetch origin main --quiet
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "❌ local main diverges from origin"; exit 1; }

echo "▶ CI green on HEAD"
sha="$(git rev-parse HEAD)"
# The headSha filter avoids racing on the previous commit's green run. The
# polling loop tolerates a fresh push where CI hasn't completed yet —
# symmetric to postflight's release.yml polling. 10 × 30s = up to 5 min;
# the preflight's `deno task test` runs for ~10-25 s on its own so this
# rarely fires.
conclusion=""
for i in 1 2 3 4 5 6 7 8 9 10; do
  conclusion="$(gh run list --workflow ci --branch main --limit 20 --json headSha,conclusion,status --jq "[.[] | select(.headSha == \"$sha\" and .status == \"completed\")] | .[0].conclusion")"
  [ -n "$conclusion" ] && [ "$conclusion" != "null" ] && break
  echo "  waiting for ci run on $sha to complete ($i/10)…"
  sleep 30
done
[ "$conclusion" = "success" ] || { echo "❌ CI not green on $sha (got: ${conclusion:-no-completed-run-after-5min})"; exit 1; }

echo "▶ smoke audit"
# The audit owns its own verdict now: its exit code IS the answer
# (see .specnaut/specs/022-smoke-suite-ci/plan.md §5 R5).
#
# This block used to re-derive pass/fail by grepping the audit's stdout for
# `N coverage gap`, because audit.sh exited 0 regardless of findings. That was
# two spellings of one rule with the CALLER holding the authoritative one — and
# a caller that must parse a report to learn whether it failed is a caller that
# will eventually parse it wrong.
#
# The standalone-clone skip is DELETED rather than narrowed. The scripts live in
# this repository now, so there is no clone shape in which they are absent; the
# skip could only ever have hidden a real failure. `smoke.yml` runs the same
# script on every push, so this is no longer the only place it fires either.
if ! bash scripts/smoke/audit.sh; then
  echo "❌ smoke audit is red — fix the findings, or allow-list a coverage gap"
  echo "   with a written reason in scripts/smoke/coverage-allowlist.txt."
  exit 1
fi

echo "▶ deno task bundle (re-sync)"
deno task bundle
[ -z "$(git status --porcelain src/templates_bundle.ts)" ] || { echo "❌ bundle drifted — commit the regenerated src/templates_bundle.ts first"; exit 1; }

echo "▶ deno task test"
deno task test

echo "✅ preflight passed"
