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
#   0   success — the catalog on `main` was verified to list this version
#       (or was already in sync with it). The bump lands on `main` directly;
#       there is no pull request to merge, and no human step between a tag
#       and a published catalog.
#   2   non-blocking skip — missing GH_TOKEN, OR the push was denied (token
#       lacks write access / catalog repo not provisioned). Emits ::warning::
#       and is mapped to exit 0 in release.yml (mirrors the HOMEBREW_TAP_TOKEN /
#       MARKETPLACE_SYNC_TOKEN pattern)
#   1   unexpected error
set -euo pipefail

# Shared helpers — token check, mktemp workdir, git bot identity,
# idempotent PR creation. See scripts/lib/sync-helpers.sh.
# shellcheck source=./lib/sync-helpers.sh
. "$(dirname "$0")/lib/sync-helpers.sh"

# Configuration.
MARKETPLACE="specnaut/specnaut-marketplace"
BRANCH_PREFIX="specnaut-sync"
DEFAULT_BRANCH="main"

# Resolve the version to ship.
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Named in the skip warning so an unpublished channel is legible in the log.
SYNC_CHANNEL="the Claude Code / Copilot CLI marketplace catalog"
VERSION="${SPECNAUT_VERSION:-$(jq -r '.version' "$REPO_ROOT/deno.json")}"

# The plugin's name is declared once, in its own manifest. Hardcoding it is
# what broke this sync: the selector looked for `specnaut` while the published
# entry was named `specflow`, so it matched nothing, changed nothing, and fell
# into the "no changes" branch — reporting success on every release for months
# while the catalog sat fifteen versions behind. Read once, here, so the
# DRY_RUN fixture below is built from the same value the selector uses.
PLUGIN_NAME="$(jq -r '.name' "$REPO_ROOT/plugin/.claude-plugin/plugin.json")"
if [ -z "$PLUGIN_NAME" ] || [ "$PLUGIN_NAME" = "null" ]; then
  echo "::error::could not read .name from plugin/.claude-plugin/plugin.json" >&2
  exit 1
fi

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
      "name": "$PLUGIN_NAME",
      "version": "0.0.0",
      "description": "Spec-driven workflow",
      "repository": "https://github.com/specnaut/specnaut-cli"
    }
  ]
}
MARKETPLACE_JSON
  # Track the seed, so the diff preview below actually shows the patch. An
  # untracked file diffs to nothing, and a preview that previews nothing is
  # the failure this whole script is about.
  ( cd "$CLONE_TARGET" && git add -A && git -c user.email=b@b -c user.name=b commit -qm seed )
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

# A clean tree is not evidence on its own — it is what the broken version
# produced for three months. Before taking the "already up to date" exit,
# assert the catalog actually declares this version. If the tree is clean for
# any other reason, that is a failed publish and the release goes red.
if [ -z "$(git status --porcelain)" ]; then
  published="$(jq -r --arg n "$PLUGIN_NAME" \
    '.plugins[] | select(.name == $n) | .version' "$CATALOG")"
  if [ "$published" != "$VERSION" ]; then
    echo "::error::$MARKETPLACE lists $PLUGIN_NAME v${published:-<none>}, expected v$VERSION," >&2
    echo "  yet the patch produced no change. The catalog was not published." >&2
    exit 1
  fi
  echo "No changes to sync — $MARKETPLACE already lists $PLUGIN_NAME v$VERSION."
  exit 0
fi

BRANCH="$BRANCH_PREFIX/v$VERSION"
TITLE="chore: bump specnaut to v$VERSION"

if [ -n "${DRY_RUN:-}" ]; then
  echo "DRY_RUN: would commit + push \`$TITLE\` straight to $MARKETPLACE:main"
  echo ""
  echo "Catalog diff preview:"
  git diff "$CATALOG"
  exit 0
fi

git add "$CATALOG"
git commit -m "$TITLE"

# Push straight to main. This used to open a pull request, and that pull
# request is what broke the channel.
#
# On the Codex fork a PR earns its place: a human rebases it into an upstream
# repo we do not own. Here we own both sides, `main` is unprotected, and the
# diff is one generated field in a file nothing but this script writes — so
# the PR carried no review, only an unowned obligation to merge it. Two got
# merged, then nobody kept up: by v3.1.0 the catalog sat at 3.0.1 behind three
# abandoned pull requests, one of them naming a plugin that no longer existed.
#
# Every mechanical step had reported success the whole time. The failure was
# an undefined human step in the middle, so the fix is to remove the step, not
# to automate around it.
PUSH_LOG="$WORK_DIR/push.log"
if git push origin "HEAD:$DEFAULT_BRANCH" >"$PUSH_LOG" 2>&1; then
  echo "  pushed to $MARKETPLACE:$DEFAULT_BRANCH"
elif grep -qiE "protected branch|required status check|review" "$PUSH_LOG"; then
  # Branch protection may be added later. Fall back to a PR, but merge it
  # here rather than leaving it for someone — the whole point is that no
  # human step remains between a tag and a published catalog.
  echo "::notice::$DEFAULT_BRANCH is protected — falling back to a pull request"
  git checkout -b "$BRANCH"
  git push -u origin "$BRANCH"
  create_pr_idempotent "$MARKETPLACE" "$BRANCH" "$TITLE" \
    "Automated marketplace catalog bump from \`specnaut/specnaut-cli\` v$VERSION."
  gh pr merge -R "$MARKETPLACE" --squash --delete-branch --admin "$BRANCH" \
    || gh pr merge -R "$MARKETPLACE" --squash --delete-branch --auto "$BRANCH" \
    || echo "::warning::could not merge the bump PR for $BRANCH — the catalog will lag until it lands" >&2
else
  cat "$PUSH_LOG" >&2
  echo "::warning::Marketplace sync: push to $MARKETPLACE was denied — the sync token lacks write access, or the catalog repo isn't provisioned yet (specnaut-cli#309–#310). The release itself is unaffected; skipping this best-effort publish." >&2
  exit 2
fi

# Assert the OUTCOME, from the remote, not this script's exit code. A publish
# step exiting 0 proves nothing was raised; it does not prove anything shipped.
# That distinction is the entire history of this file.
PUBLISHED="$(gh api "repos/$MARKETPLACE/contents/$CATALOG" \
  --jq '.content' 2>/dev/null | base64 -d 2>/dev/null \
  | jq -r --arg n "$PLUGIN_NAME" '.plugins[] | select(.name == $n) | .version' 2>/dev/null || true)"
if [ "$PUBLISHED" != "$VERSION" ]; then
  echo "::error::$MARKETPLACE:$DEFAULT_BRANCH still lists $PLUGIN_NAME v${PUBLISHED:-<none>}, expected v$VERSION." >&2
  echo "  The push reported success but the catalog did not change." >&2
  exit 1
fi
echo "  verified: $MARKETPLACE:$DEFAULT_BRANCH lists $PLUGIN_NAME v$VERSION"

# Retire any sync branch left by the pull-request era, and close its PR.
#
# A bump branch is a snapshot of one release. Keeping it after the catalog has
# moved on means an abandoned PR keeps proposing a version that is no longer
# current — and three of them survived the rebrand still naming `specflow`,
# because nothing ever looked at branches already pushed. Best-effort: the
# release has shipped by this point and a failure to reap is never worth
# failing it. Mirrors the same block in sync-to-codex-plugin.sh.
echo "▶ reaping superseded sync branches on $MARKETPLACE"
for stale in $(gh api "repos/$MARKETPLACE/branches?per_page=100" --paginate \
  --jq '.[].name' 2>/dev/null | grep -E "^(specnaut|specflow)-sync/" || true); do
  pr="$(gh pr list -R "$MARKETPLACE" --head "$stale" --state open \
    --json number --jq '.[0].number // empty' 2>/dev/null || true)"
  if [ -n "$pr" ]; then
    gh pr close "$pr" -R "$MARKETPLACE" \
      --comment "Superseded by the v$VERSION catalog bump, which now lands on $DEFAULT_BRANCH directly. Branch deleted." >/dev/null 2>&1 || true
  fi
  gh api -X DELETE "repos/$MARKETPLACE/git/refs/heads/$stale" >/dev/null 2>&1 \
    && echo "  reaped $stale" \
    || echo "::warning::could not delete $stale on $MARKETPLACE"
done

echo "✓ Specnaut published to $MARKETPLACE (v$VERSION)"
