#!/usr/bin/env bash
# Sync Specnaut → specnaut/specnaut-plugins fork (of openai/plugins).
#
# Triggered from .github/workflows/release.yml on every `v*` tag push,
# after the binary build + Homebrew tap bump. Mirrors the upstream
# pattern from obra/superpowers (scripts/sync-to-codex-plugin.sh,
# MIT-licensed) — deterministic rsync into a fork, then `gh pr create`
# against that fork's main. A human (Kevin) later merges that fork
# into the upstream openai/plugins marketplace.
#
# Required environment:
#   GH_TOKEN     — fine-grained PAT with Contents:write + Pull
#                  requests:write on specnaut/specnaut-plugins.
#                  Set via the CODEX_SYNC_TOKEN repo secret in
#                  release.yml (parallel to HOMEBREW_TAP_TOKEN).
#
# Optional environment:
#   SPECNAUT_VERSION — defaults to deno.json `version`. CI passes the
#                      tag-derived version explicitly.
#   DRY_RUN          — set to any non-empty value to print actions
#                      without pushing or opening a PR.
#
# Exit codes:
#   0   success (or "no changes — sync skipped" — the script bails
#       early if rsync produces an empty diff in the destination)
#   2   non-blocking skip — missing GH_TOKEN, OR the push was denied (token
#       lacks write access / fork not provisioned). Emits ::warning:: and is
#       mapped to exit 0 in release.yml (mirrors the HOMEBREW_TAP_TOKEN pattern)
#   1   unexpected error
set -euo pipefail

# Shared helpers — token check, mktemp workdir, git bot identity,
# idempotent PR creation. See scripts/lib/sync-helpers.sh for the
# sync-script convention.
# shellcheck source=./lib/sync-helpers.sh
. "$(dirname "$0")/lib/sync-helpers.sh"

# Configuration — change FORK / DEST_REL if the marketplace topology shifts.
FORK="specnaut/specnaut-plugins"
UPSTREAM="openai/plugins"
DEST_REL="plugins/specnaut"
BRANCH_PREFIX="specnaut-sync"

# Resolve the version to ship.
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Named in the skip warning so an unpublished channel is legible in the log.
SYNC_CHANNEL="the Codex marketplace fork"
VERSION="${SPECNAUT_VERSION:-$(jq -r '.version' "$REPO_ROOT/deno.json")}"

require_gh_token "CODEX_SYNC_TOKEN"

echo "specnaut → codex plugin sync (v$VERSION)"
echo "  fork:     $FORK"
echo "  dest:     $DEST_REL"
echo "  upstream: $UPSTREAM"

WORK_DIR="$(mktemp_workdir specnaut-codex-sync)"

if [ -n "${DRY_RUN:-}" ]; then
  echo "DRY_RUN: would clone $FORK into $WORK_DIR/fork"
  CLONE_TARGET="$WORK_DIR/fork"
  mkdir -p "$CLONE_TARGET/$DEST_REL"
  ( cd "$CLONE_TARGET" && git init -q )
else
  echo "Cloning $FORK..."
  gh repo clone "$FORK" "$WORK_DIR/fork" -- --depth 1
  CLONE_TARGET="$WORK_DIR/fork"
fi

cd "$CLONE_TARGET"

git_bot_identity
wire_gh_token_to_remote

# What ships to the Codex marketplace — an ALLOW-list, not a deny-list.
#
# This was a deny-list: rsync copied the whole repo and excluded ~30 named
# paths. That inverts the risk. Every directory added to this repo afterwards
# shipped to a public fork by default, and the only thing standing between a
# new directory and publication was someone remembering to add a line here.
#
# Nobody remembered for `examples/` — 254 files of a consuming project's
# scaffolded workspace, its `.claude/`, its `.specify/`, its backlog. It was
# purged from this repo and its history months ago; the fork kept serving it
# until 2026-08-21 because nothing ever looked there. Constitution § XI.
#
# An allow-list cannot fail that way. A new directory is invisible to the sync
# until someone names it, and naming it is a deliberate act.
INCLUDES=(
  ".codex-plugin"
  "assets"
  "plugin"
  "hooks"
  "packaging"
  "DESIGN.md"
)

# Guard against the opposite failure: an entry that silently stops existing
# would shrink the published plugin with no signal at all.
for item in "${INCLUDES[@]}"; do
  if [ ! -e "$REPO_ROOT/$item" ]; then
    echo "::error::sync allow-list names '$item', which does not exist in $REPO_ROOT." >&2
    echo "  Either restore it or remove it from INCLUDES — do not ship a partial plugin." >&2
    exit 1
  fi
done

# `--delete` still applies, so anything previously published and no longer in
# the allow-list is removed from the fork on the next sync.
rsync -av --delete --delete-excluded \
  $(printf -- '--include=/%s ' "${INCLUDES[@]}") \
  $(printf -- '--include=/%s/*** ' "${INCLUDES[@]}") \
  --exclude='/*' \
  --exclude='**/.DS_Store' --exclude='**/node_modules/' --exclude='**/__pycache__/' \
  "$REPO_ROOT/" "$CLONE_TARGET/$DEST_REL/"

# Detect "no changes" early — superpowers' pattern, avoids opening
# empty PRs on no-op releases.
if [ -z "$(git status --porcelain)" ]; then
  echo "No changes to sync — $FORK is already in sync with v$VERSION."
  exit 0
fi

BRANCH="$BRANCH_PREFIX/v$VERSION"
TITLE="chore(specnaut): sync to v$VERSION"
BODY=$(cat <<EOF
Automated sync from \`specnaut/specnaut-cli\` v$VERSION.

This PR mirrors the latest Specnaut plugin content into
\`plugins/specnaut/\` of this marketplace fork. A human reviewer
should rebase + merge this PR into upstream \`$UPSTREAM\` after
sanity-checking the diff.

Generated by \`scripts/sync-to-codex-plugin.sh\` in
[specnaut/specnaut-cli](https://github.com/specnaut/specnaut-cli).
EOF
)

if [ -n "${DRY_RUN:-}" ]; then
  echo "DRY_RUN: would create branch $BRANCH"
  echo "DRY_RUN: would commit + push to $FORK"
  echo "DRY_RUN: would open PR with title: $TITLE"
  exit 0
fi

git checkout -b "$BRANCH"
git add -A
git commit -m "$TITLE"
# The push can be denied (HTTP 403) when the sync token lacks write access to
# the fork, or the fork isn't provisioned yet (see specnaut-cli#298–#300). That
# is an external-provisioning gap, not a release defect — treat it as a
# non-blocking skip (exit 2 → the release.yml wrapper maps it to exit 0) rather
# than letting `set -e` red the whole release build.
if ! git push -u origin "$BRANCH"; then
  echo "::warning::Codex sync: push to $FORK was denied — the sync token lacks write access, or the fork isn't provisioned yet (specnaut-cli#298–#300). The release itself is unaffected; skipping this best-effort publish." >&2
  exit 2
fi

create_pr_idempotent "$FORK" "$BRANCH" "$TITLE" "$BODY"

# Retire every earlier sync branch and its PR.
#
# One branch and one PR were created per release and neither was ever closed.
# By v3.0.1 that was 15 branches and 18 open PRs on a *public* fork — and the
# eight oldest still carried a `plugins/specnaut/examples/` tree that had been
# purged from this repo's own history months earlier. The rewrite here never
# reached them, because nothing was looking at branches already pushed.
#
# So this is not tidiness. A sync branch is a snapshot of what shipped at one
# tag; keeping it forever means every past mistake stays published even after
# it is fixed at the source. Only the current one has any purpose — a human
# rebases it into upstream `openai/plugins`.
#
# Best-effort throughout: the release has already shipped by this point, and a
# failure to reap is never worth failing it.
#
# The filter matches the PRE-REBRAND prefix too. It did not, and that one-word
# gap is how the leak above outlived its own remediation: `specflow-sync/v1.12.0`,
# `/v1.13.0` and `/v1.13.1` were invisible to a reaper grepping `specnaut-sync/`
# only, and each went on serving `plugins/specflow/examples/` from a public fork
# for months after the tree was purged here. Its sibling in sync-to-marketplace.sh
# already matched both prefixes; this one did not, so nothing reconciled them.
# Deleted out of band on 2026-08-22. Constitution § XI.
echo "▶ reaping superseded sync branches on $FORK"
for stale in $(gh api "repos/$FORK/branches?per_page=100" --paginate \
  --jq '.[].name' 2>/dev/null | grep -E "^(specnaut|specflow)-sync/" | grep -vx "$BRANCH" || true); do
  pr="$(gh pr list -R "$FORK" --head "$stale" --state open \
    --json number --jq '.[0].number // empty' 2>/dev/null || true)"
  if [ -n "$pr" ]; then
    gh pr close "$pr" -R "$FORK" \
      --comment "Superseded by the v$VERSION sync. Branch deleted." >/dev/null 2>&1 || true
  fi
  gh api -X DELETE "repos/$FORK/git/refs/heads/$stale" >/dev/null 2>&1 \
    && echo "  reaped $stale" \
    || echo "::warning::could not delete $stale on $FORK"
done

echo "✓ Specnaut synced to $FORK:$BRANCH (v$VERSION)"
