#!/usr/bin/env bash
# Helper: read host + project_id from .specnaut/backlog-config.yml.
# Sourced by the other gitlab-backend scripts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
CONFIG="$ROOT/.specnaut/backlog-config.yml"

if [ ! -f "$CONFIG" ]; then
  echo "error: $CONFIG not found. Fill in host + project_id first." >&2
  exit 2
fi

extract() {
  awk -v key="$1" '
    $0 ~ "^"key":" {
      sub("^"key":[[:space:]]*", "")
      gsub(/^["'"'"']|["'"'"']$/, "")
      print
      exit
    }
  ' "$CONFIG"
}

HOST=$(extract host)
PROJECT_ID=$(extract project_id)

if [ -z "$HOST" ] || [ -z "$PROJECT_ID" ]; then
  echo "error: backlog-config.yml is missing 'host' or 'project_id'." >&2
  echo "Edit $CONFIG before running this command." >&2
  exit 2
fi

# `glab` reads the host from the GITLAB_HOST env var; the --repo flag
# accepts either a numeric id or a "group/project" path.
export GITLAB_HOST="$HOST"
export PROJECT_ID

# Browser URL for one item, per `backlog-reference-contract`. Prints nothing
# when it cannot be resolved — callers degrade rather than guessing. Never
# fails: a reference must never block a workflow.
#
# `project_id` is dual-form. A "group/project" path links directly; a numeric id
# has no browser path, so it is resolved once through the API. If that lookup
# fails there is no honest URL to emit, so emit none.
_GITLAB_PATH_CACHE=""
item_url() {
  [ -n "${1:-}" ] || return 0
  local path="$PROJECT_ID"
  case "$PROJECT_ID" in
    *[!0-9]*) ;;                       # already a path — use as-is
    *)
      if [ -n "$_GITLAB_PATH_CACHE" ]; then
        path="$_GITLAB_PATH_CACHE"
      else
        path=$(glab api "projects/$PROJECT_ID" 2>/dev/null \
          | sed -n 's/.*"path_with_namespace"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
          | head -1) || path=""
        [ -n "$path" ] || return 0
        _GITLAB_PATH_CACHE="$path"
      fi
      ;;
  esac
  echo "${HOST%/}/$path/-/issues/$1"
}
