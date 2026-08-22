#!/usr/bin/env bash
# Specnaut CLI release postflight. Verifies the GitHub Release shipped end-to-end.
# Invoked AFTER the tag has been pushed and release.yml has been triggered.
# Usage: postflight.sh <tag>
set -euo pipefail

TAG="${1:?usage: postflight.sh <tag>}"
REPO="specnaut/specnaut-cli"

echo "▶ finding release.yml run for $TAG"
# release.yml is push-tag-triggered; the GitHub Actions API can take 5-30s to
# register a new run, so poll with retries before giving up. Search up to 20
# entries so back-to-back releases don't push our run off the page. The
# substitution is wrapped with `|| true` so transient gh failures (auth
# blip, rate limit during the post-release surge) don't kill the loop —
# they just count as "not found yet" and we retry.
run_id=""
for i in 1 2 3 4 5 6 7 8 9 10; do
  run_id="$(gh run list --workflow release.yml --limit 20 --json databaseId,headBranch --jq ".[] | select(.headBranch == \"$TAG\") | .databaseId" 2>/dev/null | head -1 || true)"
  [ -n "$run_id" ] && break
  echo "  waiting for release.yml run to appear ($i/10)…"
  sleep 15
done
[ -n "$run_id" ] || { echo "❌ no release.yml run found for $TAG after 150s of polling"; exit 1; }
echo "  run id: $run_id"

echo "▶ watching release.yml until completion"
gh run watch "$run_id" --exit-status

echo "▶ verifying GitHub Release exists with assets"
asset_count="$(gh api "repos/$REPO/releases/tags/$TAG" --jq '.assets | length')"
[ "$asset_count" -ge 10 ] || { echo "❌ release has $asset_count assets (expected ≥10: 5 binaries + 5 checksums)"; exit 1; }

echo "▶ verifying Homebrew tap formula bumped to ${TAG#v}"
# Match the exact commit-message template used by scripts/bump-tap-formula.ts
# instead of a bare version glob — catches both message-template drift and
# tag-not-bumped cases. Soft-warn (don't exit), since the bump can land slightly
# after the release.yml run completes. We track the soft-warn so the final
# status differentiates "all green" from "release shipped but tap unverified".
homebrew_warned=0
formula_msg="$(gh api repos/specnaut/homebrew-tap/commits/main --jq '.commit.message' | head -1)"
expected_prefix="chore: bump specnaut to ${TAG#v}"
if [[ "$formula_msg" != "$expected_prefix"* ]]; then
  echo "⚠ Homebrew formula tip message != '$expected_prefix*': '$formula_msg'"
  homebrew_warned=1
fi

# The docs site derives `version.json` from the latest CLI release at *build*
# time, and it only builds on a push to its own repo or on a nightly cron. So
# every release left the site announcing the previous version for up to a day
# — and `version.json` is exactly what the `specnaut-guide` agent reads to
# answer "am I up to date?". It answered "yes" to users who were not.
#
# Soft-warn, never fail: the release itself has already shipped by this point,
# and a docs rebuild that did not fire is a stale page, not a broken binary.
docs_warned=0
echo "▶ refreshing the docs site (version.json tracks the latest release)"
dispatch_err="$(gh workflow run pages.yml -R specnaut/specnaut-web 2>&1 >/dev/null)" && dispatch_ok=1 || dispatch_ok=0
if [ "$dispatch_ok" -eq 1 ]; then
  # `gh workflow run` exits 0 the moment GitHub *accepts* the request; it never
  # observes the resulting run. Dispatching therefore proves only that we have
  # permission. Poll the artefact itself — version.json is the thing the
  # `specnaut-guide` agent reads to answer "am I up to date?", so it is the
  # signal that matters, and checking it beats watching the job.
  echo "  dispatched specnaut-web pages.yml — waiting for version.json"
  published=""
  for _ in $(seq 1 18); do
    sleep 5
    published="$(curl -fsSL https://specnaut.com/version.json 2>/dev/null | grep -o '"version"[^,}]*' | grep -o '[0-9][^"]*' || true)"
    [ "$published" = "${TAG#v}" ] && break
  done
  if [ "$published" = "${TAG#v}" ]; then
    echo "  specnaut.com/version.json now reports ${TAG#v}"
  else
    echo "⚠ specnaut.com/version.json still reports '${published:-unreachable}' after 90s."
    echo "  The rebuild was dispatched; it may still be running, or it failed."
    docs_warned=1
  fi
else
  echo "⚠ could not dispatch specnaut-web pages.yml: ${dispatch_err:-no error output}"
  echo "  specnaut.com/version.json will report the previous version until the"
  echo "  nightly rebuild."
  docs_warned=1
fi

# Verify the marketplace catalog by reading the PUBLISHED file, not by trusting
# the sync step's exit code. That step reported `success` on every release from
# 2026-05-22 to 2026-08-21 while publishing nothing: its jq selector matched no
# entry, the tree stayed clean, and it took its "already up to date" branch.
#
# SOFT-WARN, not a hard failure: by this point the tag is pushed, the binaries
# are published and the Homebrew formula is bumped. A stale catalog means one
# distribution channel is behind — worth shouting about, not worth reporting the
# whole release as failed. The hard gate lives in the sync script itself, which
# now exits non-zero when it cannot prove it published.
marketplace_warned=0
echo "▶ verifying the marketplace catalog was published"
catalog_version="$(gh api repos/specnaut/specnaut-marketplace/contents/.claude-plugin/marketplace.json \
  --jq '.content' 2>/dev/null | base64 -d 2>/dev/null \
  | jq -r '.plugins[0].version' 2>/dev/null || true)"
if [ "$catalog_version" = "${TAG#v}" ]; then
  echo "  catalog lists ${TAG#v}"
else
  echo "⚠ marketplace catalog lists '${catalog_version:-unreadable}', expected ${TAG#v}."
  echo "  Claude Code / Copilot CLI marketplace users are on the previous version."
  marketplace_warned=1
fi

# Soft-warn, like the two above. A self-update failure says the *operator's*
# binary is stale — `.specnaut/release/README.md` documents exactly that case,
# where the installed binary predates a fix to self-update itself. That is a
# different page at 3am from "the release is broken", and letting `set -e` abort
# here would throw away the tap and docs verdicts already computed.
selfupdate_warned=0
echo "▶ refreshing local binary"
if specnaut self-update; then
  local_version="$(specnaut --version | awk '{print $2}')"
  if [ "v$local_version" != "$TAG" ]; then
    echo "⚠ local binary at v$local_version, expected $TAG"
    selfupdate_warned=1
  fi
else
  echo "⚠ specnaut self-update failed — your local binary is not $TAG."
  echo "  This does not affect the published release; reinstall to catch up."
  selfupdate_warned=1
fi

# `|| true` is load-bearing: under `set -e` a bare `[ … ] && arr+=(…)` is exempt
# only while it is not the final command of the script. That makes the block
# position-dependent, and the next edit that moves it turns a green release red.
warnings=()
[ "$homebrew_warned" -eq 1 ] && warnings+=("tap bump unverified, re-check in ~60s") || true
[ "$docs_warned" -eq 1 ] && warnings+=("docs site stale, specnaut.com/version.json not updated") || true
[ "$marketplace_warned" -eq 1 ] && warnings+=("marketplace catalog stale, that channel is behind") || true
[ "$selfupdate_warned" -eq 1 ] && warnings+=("local binary not refreshed (does not affect the release)") || true

if [ "${#warnings[@]}" -gt 0 ]; then
  # `${warnings[*]}` joins on the FIRST character of IFS only, so `IFS='; '`
  # yields `;` with no space. Each warning already contains commas, so the
  # run-together form is genuinely hard to read. printf keeps the separator.
  joined="$(printf '%s; ' "${warnings[@]}")"
  echo "✅ release shipped — $TAG is live (⚠ ${joined%; })"
else
  echo "✅ postflight passed — $TAG is live"
fi
