# Shared helpers for `scripts/sync-to-*.sh` — Specnaut's marketplace
# / fork sync scripts.
#
# Source from a sync script with:
#   . "$(dirname "$0")/lib/sync-helpers.sh"
#
# All helpers assume the caller has already run `set -euo pipefail` and
# defined any required configuration variables.
#
# Sync-script convention (Epic #270 / C3 #285):
#
#   - **Deterministic** — running the script twice in a row against the
#     same source state produces an identical destination state (no
#     timestamps, no random IDs, no machine-dependent paths). Rsync
#     with `--delete` and jq-based JSON patches are both deterministic;
#     avoid anything that injects `date +%s`, `uuidgen`, or `$RANDOM`.
#
#   - **Skip-on-missing-token** — if the auth secret is unset, emit a
#     `::warning::` and exit 2. The release.yml workflow translates
#     exit 2 into a non-blocking skip, the same way `HOMEBREW_TAP_TOKEN`
#     skips when absent.
#
#   - **DRY_RUN mode** — set `DRY_RUN=1` to print all destructive
#     actions without performing them (no clone, no push, no PR).
#     Useful for local development and as a smoke test in CI before
#     turning on the real sync.
#
#   - **Idempotent PR creation** — if a PR with the same head branch
#     already exists on the destination, the script logs and exits 0
#     rather than failing (the same content has already been pushed
#     by a previous run; nothing to do).
#
# When adding a new sync script for a new harness, follow this
# convention. The helpers below cover the boilerplate so each new
# script focuses on the harness-specific bits (rsync excludes,
# JSON patches, file paths).

# require_gh_token <SECRET_NAME>
#
# Validate that GH_TOKEN is set (CI passes the per-harness secret as
# GH_TOKEN before invoking the script). If unset AND we're not in
# DRY_RUN, emit a workflow warning and exit 2 so the calling workflow
# step can translate it into a non-blocking skip.
#
# Arguments:
#   $1 — secret name (for the warning message, e.g. MARKETPLACE_SYNC_TOKEN)
require_gh_token() {
  local secret_name="${1:-GH_TOKEN}"
  if [ -z "${GH_TOKEN:-}" ] && [ -z "${DRY_RUN:-}" ]; then
    # Name the consequence, not just the cause. "skipping sync" reads as
    # housekeeping; what actually happened is that a distribution channel did
    # not receive this release, and nothing downstream will say so.
    echo "::warning::${secret_name} not set — ${SYNC_CHANNEL:-this channel} did NOT receive this release. The release itself is unaffected; the channel is now behind." >&2
    exit 2
  fi
}

# mktemp_workdir <label>
#
# Make a temp directory and set up a trap to clean it up on script
# exit. Prints the directory path so the caller can capture it:
#
#   WORK_DIR=$(mktemp_workdir specnaut-codex-sync)
#
# Arguments:
#   $1 — label (for the mktemp -t prefix)
mktemp_workdir() {
  local label="${1:-specnaut-sync}"
  local dir
  dir="$(mktemp -d -t "${label}-XXXXXX")"
  # shellcheck disable=SC2064 # we want $dir expanded NOW, not at trap time
  trap "rm -rf '$dir'" EXIT
  printf '%s' "$dir"
}

# git_bot_identity
#
# Set the local git identity for an automated commit. Must be called from
# inside the destination clone (after `cd` into it).
#
# THIS IS THE ONE IDENTITY FOR EVERY AUTOMATED COMMIT IN THIS REPO. If you
# add another path that commits on our behalf, call this — do not invent a
# third. `scripts/bump-tap-formula.ts` sets the same name and address
# directly, because it is TypeScript and cannot source this file; keep the
# two in step.
#
# It is GitHub's own bot identity, which is what makes it the right choice:
# these commits are pushed to public repositories, the forge renders the
# author as a bot rather than a person, and it needs no address that has to
# be owned, routed or kept alive. The previous value was a hand-picked
# address on a domain unrelated to any of the destination repos — nothing
# was broken by it, but it meant two identities to recognise in `git log`
# and two to allowlist wherever bot authorship is checked (#473).
git_bot_identity() {
  git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
  git config user.name "github-actions[bot]"
}

# wire_gh_token_to_remote
#
# Rewrite the `origin` remote URL to embed GH_TOKEN as a URL credential
# so a bare `git push` works on a headless CI runner. `gh repo clone`
# authenticates the clone itself but writes a plain
# `https://github.com/...` remote, so the subsequent `git push` has no
# credentials and fails with exit 128 ("could not read Username for
# 'https://github.com'"). Call from inside the destination clone, after
# `git_bot_identity` and before any `git push`. No-op in DRY_RUN and
# when the remote already carries credentials (re-run, or a non-HTTPS
# remote) so the helper is safe to call unconditionally.
wire_gh_token_to_remote() {
  [ -n "${DRY_RUN:-}" ] && return 0
  local current_url
  current_url="$(git remote get-url origin)"
  if [[ "$current_url" == *"@github.com"* ]]; then
    return 0
  fi
  git remote set-url origin \
    "${current_url/https:\/\/github.com/https:\/\/x-access-token:${GH_TOKEN}@github.com}"
}

# create_pr_idempotent <repo> <branch> <title> <body>
#
# Open a PR on <repo> from <branch> against main. If a PR with the same head
# already exists, log it and return 0 (an earlier run already pushed the same
# content; nothing to do). ANY OTHER failure returns non-zero and prints what
# `gh` actually said.
#
# It used to swallow everything: `gh pr create … 2>/dev/null` with `if !`, and
# a single reassuring "PR already exists" line for every non-zero exit. A rate
# limit, a revoked token scope, a missing base branch and a genuine
# already-exists were indistinguishable to the caller and to the release log —
# all of them printed the same sentence and returned success (#523).
#
# That is how a publish channel stays green for eighteen months without
# publishing anything: when opening the PR is the last step, a lie here is the
# last word. Idempotency is now something this function VERIFIES rather than
# something it assumes from an exit code it never read.
#
# Arguments:
#   $1 — repo (e.g. specnaut/specnaut-marketplace)
#   $2 — branch (e.g. specnaut-sync/v1.8.0)
#   $3 — PR title
#   $4 — PR body (multi-line OK)
create_pr_idempotent() {
  local repo="$1" branch="$2" title="$3" body="$4"
  local err rc=0

  err="$(gh pr create --repo "$repo" --base main --head "$branch" \
    --title "$title" --body "$body" 2>&1 >/dev/null)" || rc=$?
  [ "$rc" -eq 0 ] && return 0

  # Benign only if a PR for this head genuinely exists. `gh pr list` failing
  # here (its own rate limit, a bad token) leaves `existing` empty, so the
  # failure propagates rather than being read as idempotency.
  local existing
  existing="$(gh pr list --repo "$repo" --head "$branch" --state open \
    --json number --jq '.[0].number // empty' 2>/dev/null || true)"
  if [ -n "$existing" ]; then
    echo "PR #$existing already exists for $branch on $repo; skipping create."
    return 0
  fi

  echo "::error::gh pr create failed for $branch on $repo (exit $rc), and no open PR exists for that head." >&2
  # The captured stderr is the whole point — it names the cause the old
  # `2>/dev/null` threw away.
  [ -n "$err" ] && printf '%s\n' "$err" >&2
  return "$rc"
}
