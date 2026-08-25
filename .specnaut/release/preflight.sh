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
# The audit owns its own verdict: its exit code IS the answer (plan.md §5 R5).
# This caller must not re-derive it by parsing the report.
# Branch on WHICH non-zero. `if ! …` treated every failure as a coverage
# verdict, so a tagless or shallow clone — audit.sh exits 2 when it cannot
# resolve a baseline — aborted the release under "fix the findings", advice
# for a condition that had not occurred. Wrong diagnosis at the worst moment.
audit_rc=0
bash scripts/smoke/audit.sh || audit_rc=$?
case "$audit_rc" in
  0) ;;
  1)
    echo "❌ smoke audit is red — fix the findings, or allow-list a coverage gap"
    echo "   with a written reason in scripts/smoke/coverage-allowlist.txt."
    exit 1
    ;;
  *)
    echo "❌ smoke audit could not RUN (exit $audit_rc) — this is not a findings"
    echo "   verdict. 2 = no v*.*.* tag or unresolvable baseline (a shallow or"
    echo "   tagless clone); 3 = --src-root is not a git work tree."
    exit 1
    ;;
esac

echo "▶ deno task bundle (re-sync)"
deno task bundle
[ -z "$(git status --porcelain src/templates_bundle.ts)" ] || { echo "❌ bundle drifted — commit the regenerated src/templates_bundle.ts first"; exit 1; }

echo "▶ deno task test"
deno task test

echo "✅ preflight passed"
