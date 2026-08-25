#!/usr/bin/env bash
# Audit smoke-test coverage by diffing the working tree against the last
# release tag. Reports two lists:
#
#   1. Coverage gaps   — user-visible surface changed since <baseline> but
#                        no smoke-*.sh references the new file's basename.
#   2. Stale assertions — smoke scripts mention runtime paths whose source
#                         counterpart under templates/core/ no longer exists.
#
# Output only — never edits smoke scripts. The maintainer decides what to do
# with each finding (add a check, prune a stale one, or accept the gap).
#
# Usage:
#   audit.sh                 # diff against the most recent v*.*.* tag
#   audit.sh --since <ref>   # override baseline (e.g. another tag, sha, branch)
#
# Exit codes:
#   0  audit ran (regardless of findings — stdout is the report)
#   2  baseline ref could not be resolved
#   3  not running inside a git work tree
#   1  unexpected error
#
# Heuristics live in `.claude/skills/test-sandbox/SKILL.md` ("Audit
# heuristics") so the rules and the script can drift together but are
# documented in exactly one place.
set -euo pipefail

SINCE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --since)
      SINCE="${2:-}"
      [ -n "$SINCE" ] || { echo "audit.sh: --since needs a ref" >&2; exit 1; }
      shift 2
      ;;
    -h|--help)
      sed -n '2,/^set -/p' "$0" | sed 's/^# \{0,1\}//;/^set -/d'
      exit 0
      ;;
    *)
      echo "audit.sh: unknown flag '$1' (try --help)" >&2
      exit 1
      ;;
  esac
done

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "audit.sh: not inside a git work tree" >&2
  exit 3
fi

ROOT="$(git rev-parse --show-toplevel)"
# Source tree = where templates/ and the release tags live. In the monorepo the
# CLI is a submodule (apps/specnaut-cli) with its own tags; on a flat repo or the
# synthetic self-test, it's the toplevel itself.
if [ -d "$ROOT/apps/specnaut-cli/templates" ]; then
  SRC_ROOT="$ROOT/apps/specnaut-cli"
else
  SRC_ROOT="$ROOT"
fi
# Smoke scripts live next to THIS script (the monorepo .claude/ tree), which is
# a different location than SRC_ROOT under the monorepo layout.
SMOKE_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -z "$SINCE" ]; then
  SINCE=$(git -C "$SRC_ROOT" tag -l 'v[0-9]*.[0-9]*.[0-9]*' --sort=-version:refname | head -1 || true)
  if [ -z "$SINCE" ]; then
    echo "audit.sh: no v*.*.* tag found and no --since override" >&2
    exit 2
  fi
fi

if ! git -C "$SRC_ROOT" rev-parse --verify "$SINCE^{commit}" >/dev/null 2>&1; then
  echo "audit.sh: ref '$SINCE' could not be resolved" >&2
  exit 2
fi

HEAD_SHORT=$(git -C "$SRC_ROOT" rev-parse --short HEAD)
BASE_SHORT=$(git -C "$SRC_ROOT" rev-parse --short "$SINCE^{commit}")

echo "test-sandbox audit"
echo "  baseline: $SINCE ($BASE_SHORT)"
echo "  head:     HEAD ($HEAD_SHORT)"
echo

# --- Surface map ----------------------------------------------------------
# Each entry: <glob>|<smoke-script-list>|<kind>. The audit walks the diff,
# matches each changed file against the first glob it fits, and asserts that
# at least one of the listed smoke scripts mentions the file's basename. If
# none do, that's a coverage gap.
SURFACES=(
  'templates/core/agents/*.md|smoke-features.sh smoke-all-harnesses.sh|bundled-agent'
  'templates/core/commands/*.md|smoke-features.sh|bundled-command'
  'templates/core/skills/*/SKILL.md|smoke-features.sh|bundled-skill'
  'templates/core/skills/specnaut/phases/*.md|smoke-features.sh|phase-doc'
  'templates/core/skills/specnaut/scripts/*|smoke-tag-release.sh|tag-release-script'
  'templates/core/skills/board/scripts/github/*|smoke-backlog-github.sh|github-backlog-script'
  'templates/core/skills/board/scripts/gitlab/*|smoke-backlog-gitlab.sh|gitlab-backlog-script'
  'templates/core/skills/board/scripts/local/*|smoke-backlog-local.sh|local-backlog-script'
  'templates/core/hooks/*|smoke-hooks.sh|bundled-hook'
  'templates/core/specnaut/scripts/*/*|smoke-features.sh|specnaut-helper-script'
  'templates/core/specnaut/LABELS.md|smoke-features.sh smoke-backlog-github.sh smoke-backlog-gitlab.sh|labels-doc'
)

CHANGED=$(git -C "$SRC_ROOT" diff --name-only --diff-filter=AMR "$SINCE..HEAD" -- \
  'templates/core/' 'templates/manifest.json' 'src/cli/' 2>/dev/null || true)

gaps_count=0
echo "## Coverage scan"
echo
if [ -z "$CHANGED" ]; then
  echo "  ✓ no user-visible surface changes since $SINCE"
else
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    matched_glob=""
    smokes=""
    kind=""
    for entry in "${SURFACES[@]}"; do
      glob="${entry%%|*}"
      rest="${entry#*|}"
      candidate_smokes="${rest%%|*}"
      candidate_kind="${rest##*|}"
      # shellcheck disable=SC2254
      case "$f" in
        $glob)
          matched_glob="$glob"
          smokes="$candidate_smokes"
          kind="$candidate_kind"
          break
          ;;
      esac
    done
    if [ -z "$matched_glob" ]; then
      continue # outside the audit's surface map (tests, scripts/, plugin/, etc.)
    fi
    base="$(basename "$f")"
    covered=0
    for s in $smokes; do
      if [ -f "$SMOKE_DIR/$s" ] && grep -qF "$base" "$SMOKE_DIR/$s"; then
        covered=1
        break
      fi
    done
    if [ "$covered" -eq 0 ]; then
      gaps_count=$((gaps_count + 1))
      printf '  - %s\n      kind: %s\n      expected coverage in: %s\n' "$f" "$kind" "$smokes"
    fi
  done <<<"$CHANGED"
  if [ "$gaps_count" -eq 0 ]; then
    echo "  ✓ every surface change has a matching smoke assertion"
  fi
fi

echo
echo "## Stale-assertion scan"
echo

# Map each runtime path to its candidate source paths under templates/.
# If NO candidate exists, the smoke is asserting against a moved/deleted file.
# Returns 0 (path resolves) or 1 (stale).
#
# `.claude/...` paths can scaffold from EITHER templates/core/ OR
# templates/harness-specific/<harness>/ (the harness-specific tree wins on
# overlap). The resolver checks both.
resolves() {
  local rt="$1"
  # Strip trailing slash — directory references in `[ -d ... ]` checks are
  # not stale signals; they're shape assertions on the runtime tree.
  case "$rt" in */) return 0 ;; esac
  case "$rt" in
    .claude/agents/*.md)
      local n="${rt#.claude/agents/}"
      [ -f "$SRC_ROOT/templates/core/agents/$n" ] && return 0
      find "$SRC_ROOT/templates/harness-specific" -path "*/agents/$n" 2>/dev/null | grep -q .
      ;;
    .claude/commands/*.md)
      local n="${rt#.claude/commands/}"
      [ -f "$SRC_ROOT/templates/core/commands/$n" ] && return 0
      find "$SRC_ROOT/templates/harness-specific" -path "*/commands/$n" 2>/dev/null | grep -q .
      ;;
    .claude/skills/*/SKILL.md)
      local n="${rt#.claude/skills/}"
      n="${n%/SKILL.md}"
      [ -f "$SRC_ROOT/templates/core/skills/$n/SKILL.md" ] && return 0
      find "$SRC_ROOT/templates/harness-specific" -path "*/skills/$n/SKILL.md" 2>/dev/null | grep -q .
      ;;
    .claude/skills/specnaut/phases/*.md)
      local n="${rt#.claude/skills/specnaut/phases/}"
      [ -f "$SRC_ROOT/templates/core/skills/specnaut/phases/$n" ]
      ;;
    .claude/hooks/*)
      local n="${rt#.claude/hooks/}"
      [ -e "$SRC_ROOT/templates/core/hooks/$n" ] && return 0
      find "$SRC_ROOT/templates/harness-specific" -path "*/hooks/$n" 2>/dev/null | grep -q .
      ;;
    .claude/scripts/*)
      local n="${rt#.claude/scripts/}"
      [ -e "$SRC_ROOT/templates/core/scripts/$n" ] && return 0
      find "$SRC_ROOT/templates/harness-specific" -path "*/scripts/$n" 2>/dev/null | grep -q .
      ;;
    .claude/loop.md)
      [ -f "$SRC_ROOT/templates/core/loop.md" ] && return 0
      find "$SRC_ROOT/templates/harness-specific" -name "loop.md" 2>/dev/null | grep -q .
      ;;
    .claude/settings.json|.claude/settings.local.json)
      return 0 # merged at init time from per-harness logic; no single source file
      ;;
    .specnaut/scripts/backlog/*)
      local n="${rt#.specnaut/scripts/backlog/}"
      find "$SRC_ROOT/templates/core/skills/board/scripts" -name "$(basename "$n")" 2>/dev/null | grep -q .
      ;;
    .specnaut/scripts/bash/*|.specnaut/scripts/powershell/*)
      local n="${rt#.specnaut/scripts/}"
      [ -e "$SRC_ROOT/templates/core/specnaut/scripts/$n" ]
      ;;
    .specnaut/LABELS.md)
      [ -f "$SRC_ROOT/templates/core/specnaut/LABELS.md" ]
      ;;
    .specnaut/installed.lock|.specnaut/backlog-config.yml|.specnaut/feature.json|.specnaut/logs/*|.specnaut/specs/*|.specnaut/backlog.md|.specnaut/backlog/*)
      return 0 # generated at runtime, not in source tree
      ;;
    *)
      return 0 # outside the resolver's known map — don't false-flag
      ;;
  esac
}

stale_count=0
for smoke in "$SMOKE_DIR"/smoke-*.sh; do
  [ -f "$smoke" ] || continue
  smoke_name="$(basename "$smoke")"
  # The audit's own meta-test plants deliberately-fake `.claude/agents/baseline-*.md`
  # references inside heredocs to verify the staleness scan reports them. Audit-ing
  # the auditor would always flag those as a false positive — skip it.
  [ "$smoke_name" = "smoke-audit.sh" ] && continue
  while IFS= read -r path_ref; do
    [ -z "$path_ref" ] && continue
    if ! resolves "$path_ref"; then
      # A path the smoke ONLY ever asserts the absence of is not stale — it is
      # the correct assertion for a deliberately removed artefact, and the
      # scan used to forbid writing it. `#533` retired two command shims and
      # the right check became `[ ! -e … ]`; flagging that as staleness leaves
      # a removal with no assertion at all, which is how a file comes back.
      #
      # Counted per occurrence, not per line: one line legitimately asserts
      # that groom.md is present in its new home AND absent from its old one.
      esc="$(printf '%s' "$path_ref" | sed 's/[.[\*^$]/\\&/g')"
      # `|| true` on both: this script runs under `set -euo pipefail`, and a
      # grep that matches nothing exits 1, which pipefail propagates and `set
      # -e` turns into an abort. The first version had it only where a match
      # was guaranteed, so the scan died on the first path nothing negated —
      # printing its header, no findings, and no summary. Zero findings and a
      # dead scan look identical unless you count the summary lines.
      total="$( { grep -oF -- "$path_ref" "$smoke" || true; } | wc -l | tr -d ' ')"
      negated="$( { grep -oE "! *-[efdsx] +$esc|! *grep[^&|]*$esc" "$smoke" || true; } | wc -l | tr -d ' ')"
      if [ "$total" = "$negated" ]; then
        continue
      fi
      stale_count=$((stale_count + 1))
      printf '  - %s references %s\n      no source file under templates/core/\n' "$smoke_name" "$path_ref"
    fi
  done < <(grep -hoE "(\\.specnaut|\\.claude)/[A-Za-z0-9._/-]+" "$smoke" 2>/dev/null | sort -u)
done

if [ "$stale_count" -eq 0 ]; then
  echo "  ✓ no stale assertions detected"
fi

echo
echo "## Summary"
echo "  $gaps_count coverage gap(s)"
echo "  $stale_count stale assertion(s)"
echo
if [ "$gaps_count" -gt 0 ] || [ "$stale_count" -gt 0 ]; then
  echo "Add the missing assertions or prune the stale ones, then re-run."
  echo "(audit.sh never edits smoke scripts autonomously — that is on you.)"
fi
