#!/usr/bin/env bash
# Sync Specnaut → specnaut/specnaut-marketplace catalog.
#
# Triggered from .github/workflows/release.yml on every `v*` tag push,
# after the binary build + Homebrew tap + Codex marketplace sync. The
# marketplace repo's `.claude-plugin/marketplace.json` catalog gets a
# version bump (and any other metadata refresh) on every release.
#
# The marketplace serves BOTH Claude Code and Copilot CLI users via
# the shared `.claude-plugin/marketplace.json` format:
#
#   - Claude Code: `/plugin marketplace add specnaut/specnaut-marketplace`
#                  + `/plugin install specnaut@specnaut-marketplace`
#   - Copilot CLI: `copilot plugin marketplace add specnaut/specnaut-marketplace`
#                  + `copilot plugin install specnaut@specnaut-marketplace`
#
# (Closes Epic #270 / B5 #281 — Copilot CLI marketplace entry.)
#
# Required environment:
#   GH_TOKEN — fine-grained PAT with Contents:write + Pull
#              requests:write on specnaut/specnaut-marketplace.
#              Set via the MARKETPLACE_SYNC_TOKEN repo secret in
#              release.yml.
#
# Optional environment:
#   SPECNAUT_VERSION — defaults to deno.json `version`. CI passes the
#                      tag-derived version explicitly.
#   DRY_RUN          — set to any non-empty value to print actions
#                      without pushing or opening a PR.
#
# Exit codes:
#   0   success (or "no changes — sync skipped" if the catalog is
#       already in sync with the current version)
#   2   non-blocking skip — missing GH_TOKEN, OR the push was denied (token
#       lacks write access / catalog repo not provisioned). Emits ::warning::
#       and is mapped to exit 0 in release.yml (mirrors the HOMEBREW_TAP_TOKEN /
#       CODEX_SYNC_TOKEN pattern)
#   1   unexpected error
set -euo pipefail

# Shared helpers — token check, mktemp workdir, git bot identity,
# idempotent PR creation. See scripts/lib/sync-helpers.sh.
# shellcheck source=./lib/sync-helpers.sh
. "$(dirname "$0")/lib/sync-helpers.sh"

# Configuration.
MARKETPLACE="specnaut/specnaut-marketplace"
BRANCH_PREFIX="specnaut-sync"

# Resolve the version to ship.
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${SPECNAUT_VERSION:-$(jq -r '.version' "$REPO_ROOT/deno.json")}"

require_gh_token "MARKETPLACE_SYNC_TOKEN"

echo "specnaut → marketplace sync (v$VERSION)"
echo "  marketplace: $MARKETPLACE"

WORK_DIR="$(mktemp_workdir specnaut-marketplace-sync)"

if [ -n "${DRY_RUN:-}" ]; then
  echo "DRY_RUN: would clone $MARKETPLACE into $WORK_DIR/marketplace"
  CLONE_TARGET="$WORK_DIR/marketplace"
  mkdir -p "$CLONE_TARGET/.claude-plugin"
  ( cd "$CLONE_TARGET" && git init -q )
  # Seed with a minimal marketplace.json so the update step has
  # something to patch in DRY_RUN mode.
  cat > "$CLONE_TARGET/.claude-plugin/marketplace.json" <<MARKETPLACE_JSON
{
  "plugins": [
    {
      "name": "specnaut",
      "version": "0.0.0",
      "description": "Spec-driven workflow",
      "repository": "https://github.com/specnaut/specnaut-cli"
    }
  ]
}
MARKETPLACE_JSON
else
  echo "Cloning $MARKETPLACE..."
  gh repo clone "$MARKETPLACE" "$WORK_DIR/marketplace" -- --depth 1
  CLONE_TARGET="$WORK_DIR/marketplace"
fi

cd "$CLONE_TARGET"

git_bot_identity
wire_gh_token_to_remote

# Update the specnaut entry's version in the catalog. The catalog
# JSON shape is canonical Claude Code marketplace format
# (.claude-plugin/marketplace.json): a top-level object with a
# `plugins` array. Each plugin entry has at minimum `name`, `version`,
# `description`, `repository`. We patch only the `version` field of
# the entry whose `name == "specnaut"`; everything else is preserved.
CATALOG=".claude-plugin/marketplace.json"
if [ ! -f "$CATALOG" ]; then
  echo "::error::$CATALOG not found in $MARKETPLACE — initialize the marketplace catalog first (see issue #281 follow-up tasks)" >&2
  exit 1
fi

# The plugin's name is declared once, in its own manifest. Hardcoding it here
# is what broke this sync: the selector looked for `specnaut` while the
# published entry was still named `specflow`, so it matched nothing, changed
# nothing, and fell into the "no changes" branch below — reporting success on
# every release since 2026-05-22 while the catalog sat fifteen versions behind.
PLUGIN_NAME="$(jq -r '.name' "$REPO_ROOT/plugin/.claude-plugin/plugin.json")"
if [ -z "$PLUGIN_NAME" ] || [ "$PLUGIN_NAME" = "null" ]; then
  echo "::error::could not read .name from plugin/.claude-plugin/plugin.json" >&2
  exit 1
fi

# Assert the selector matches BEFORE relying on the diff. "Nothing to update"
# and "nothing matched" produce an identical clean tree, and only one of them
# is success. This is the check whose absence let the failure run for months.
matches="$(jq --arg n "$PLUGIN_NAME" '[.plugins[] | select(.name == $n)] | length' "$CATALOG")"
if [ "$matches" -eq 0 ]; then
  echo "::error::no plugin named '$PLUGIN_NAME' in $CATALOG." >&2
  echo "  The catalog lists: $(jq -r '[.plugins[].name] | join(", ")' "$CATALOG")" >&2
  echo "  A rename on either side silently stops this sync — fix the catalog entry" >&2
  echo "  or plugin/.claude-plugin/plugin.json so the names agree." >&2
  exit 1
fi

jq --arg v "$VERSION" --arg n "$PLUGIN_NAME" \
  '(.plugins[] | select(.name == $n) | .version) = $v' \
  "$CATALOG" > "$CATALOG.tmp"
mv "$CATALOG.tmp" "$CATALOG"

# A clean tree here now means one thing only: the catalog already declares this
# version. The no-match case exited above.
if [ -z "$(git status --porcelain)" ]; then
  echo "No changes to sync — $MARKETPLACE already lists $PLUGIN_NAME v$VERSION."
  exit 0
fi

BRANCH="$BRANCH_PREFIX/v$VERSION"
TITLE="chore: bump specnaut to v$VERSION"
BODY=$(cat <<EOF
Automated marketplace catalog bump from \`specnaut/specnaut-cli\` v$VERSION.

Patches \`.claude-plugin/marketplace.json\` so users on Claude Code
and Copilot CLI installing via the marketplace get the latest version
metadata. A maintainer rebases and merges this PR (or auto-merges
via branch protection rules).

Generated by \`scripts/sync-to-marketplace.sh\` in
[specnaut/specnaut-cli](https://github.com/specnaut/specnaut-cli).
EOF
)

if [ -n "${DRY_RUN:-}" ]; then
  echo "DRY_RUN: would create branch $BRANCH"
  echo "DRY_RUN: would commit + push to $MARKETPLACE"
  echo "DRY_RUN: would open PR with title: $TITLE"
  echo ""
  echo "Catalog diff preview:"
  git diff "$CATALOG"
  exit 0
fi

git checkout -b "$BRANCH"
git add "$CATALOG"
git commit -m "$TITLE"
# The push can be denied (HTTP 403) when the sync token lacks write access to
# the catalog repo, or it isn't provisioned yet (see specnaut-cli#309–#310).
# That is an external-provisioning gap, not a release defect — treat it as a
# non-blocking skip (exit 2 → the release.yml wrapper maps it to exit 0) rather
# than letting `set -e` red the whole release build.
if ! git push -u origin "$BRANCH"; then
  echo "::warning::Marketplace sync: push to $MARKETPLACE was denied — the sync token lacks write access, or the catalog repo isn't provisioned yet (specnaut-cli#309–#310). The release itself is unaffected; skipping this best-effort publish." >&2
  exit 2
fi

create_pr_idempotent "$MARKETPLACE" "$BRANCH" "$TITLE" "$BODY"

echo "✓ Specnaut synced to $MARKETPLACE:$BRANCH (v$VERSION)"
