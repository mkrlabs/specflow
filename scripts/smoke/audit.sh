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
#   0  clean — no stale assertion, no un-allow-listed coverage gap
#   1  findings, or an unexpected error
#   2  baseline ref could not be resolved
#   3  --src-root is not a git work tree
#
# The exit code IS the verdict (plan.md §5 R5). It used to be 0 regardless
# of findings, with `.specnaut/release/preflight.sh` re-deriving pass/fail by
# grepping this script's stdout — two spellings of one rule, and the caller
# held the authoritative one. A caller that must parse a report to learn
# whether it failed is a caller that will eventually parse it wrong.
#
# Heuristics live in `.claude/skills/test-sandbox/SKILL.md` ("Audit
# heuristics") so the rules and the script can drift together but are
# documented in exactly one place.
set -euo pipefail

# Path resolution has one home (plan.md §5 R1); this script's source tree is
# an explicit PARAMETER with a default (R2), never an ambient value.
#
# It used to be derived from the CALLER'S cwd via `git rev-parse
# --show-toplevel`, so the same invocation answered differently depending on
# where you stood. Deriving it from this file's own location instead would
# only have swapped one invisible input for another — and would have broken
# smoke-audit.sh, which points the audit at a synthetic tree. Injection
# removes the class rather than moving it.
. "$(dirname "$0")/_common.sh"

SINCE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --smoke-dir)
      SMOKE_DIR="${2:-}"
      [ -n "$SMOKE_DIR" ] || { echo "audit.sh: --smoke-dir needs a directory" >&2; exit 1; }
      [ -d "$SMOKE_DIR" ] || { echo "audit.sh: --smoke-dir '$SMOKE_DIR' is not a directory" >&2; exit 1; }
      SMOKE_DIR="$(cd "$SMOKE_DIR" && pwd)"
      shift 2
      ;;
    --src-root)
      SRC_ROOT="${2:-}"
      [ -n "$SRC_ROOT" ] || { echo "audit.sh: --src-root needs a directory" >&2; exit 1; }
      [ -d "$SRC_ROOT" ] || { echo "audit.sh: --src-root '$SRC_ROOT' is not a directory" >&2; exit 1; }
      SRC_ROOT="$(cd "$SRC_ROOT" && pwd)"
      shift 2
      ;;
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

if ! git -C "$SRC_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "audit.sh: '$SRC_ROOT' is not a git work tree" >&2
  exit 3
fi

# --- What gets scanned (plan.md §5 R3) ----------------------------------
# Membership is ENUMERATED from $SMOKE_DIR, and SUITE_FILES is checked
# against that enumeration rather than trusted as a second list.
#
# Two lists that must agree is the duplication this table exists to forbid.
# One list plus a check is not: the check is what turns "somebody added a
# smoke and never wired it into the suite" from a silent omission into a
# finding. `--smoke-dir` points this at a foreign directory (only the
# meta-test does), and there the declaration does not apply.
scanned_files=""
for _f in "$SMOKE_DIR"/smoke-*.sh; do
  [ -f "$_f" ] || continue
  scanned_files="$scanned_files$(basename "$_f")
"
done
[ -f "$SMOKE_DIR/_common.sh" ] && scanned_files="${scanned_files}_common.sh
"

membership_drift=""
if [ "$SMOKE_DIR" = "$DEFAULT_SMOKE_DIR" ]; then
  for _f in $(printf '%s' "$scanned_files" | grep -v '^_common.sh$' || true); do
    case "
$SUITE_FILES
" in
      *"
$_f
"*) ;;
      *) membership_drift="$membership_drift  - $_f exists but is not in SUITE_FILES — run-all.sh never runs it
" ;;
    esac
  done
  for _f in $SUITE_FILES; do
    [ -f "$SMOKE_DIR/$_f" ] || membership_drift="$membership_drift  - $_f is in SUITE_FILES but does not exist
"
  done
fi

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

# --- Coverage-gap allowlist (plan.md §5 R13) ----------------------------
ALLOWLIST="$SMOKE_DIR/coverage-allowlist.txt"

# Echo the recorded reason if $1 is allow-listed; return 1 otherwise.
# An entry with no reason is NOT an entry — that is what stops the file
# degrading into a list of paths somebody added to make the gate quiet.
allow_reason() {
  [ -f "$ALLOWLIST" ] || return 1
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue ;; esac
    entry="${line%%[[:space:]]*}"
    [ "$entry" = "$1" ] || continue
    reason="$(printf '%s' "${line#"$entry"}" | sed 's/^[[:space:]]*//')"
    [ -n "$reason" ] || return 1
    printf '%s' "$reason"
    return 0
  done < "$ALLOWLIST"
  return 1
}

gaps_count=0
allowed_count=0
unmapped_count=0
unmapped_list=""
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
      # This used to `continue` in silence, which is how a required gate ends
      # up printing "every surface change has a matching smoke assertion"
      # about a category it has never heard of. Reported and counted — but
      # deliberately NOT fatal: a new category with no recourse would block
      # legitimate work, and the defect here is invisibility, not the gap.
      case "$f" in
        templates/core/*)
          unmapped_count=$((unmapped_count + 1))
          unmapped_list="$unmapped_list  - $f
"
          ;;
      esac
      continue # tests/, scripts/, plugin/ and friends are genuinely out of scope
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
      if reason="$(allow_reason "$f")"; then
        allowed_count=$((allowed_count + 1))
        printf '  ~ %s (allow-listed)\n      reason: %s\n' "$f" "$reason"
      else
        gaps_count=$((gaps_count + 1))
        printf '  - %s\n      kind: %s\n      expected coverage in: %s\n' "$f" "$kind" "$smokes"
      fi
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
# Enumerated above, and it includes _common.sh: a path assertion hoisted into
# the shared header would otherwise be invisible to the very scan that exists
# to catch stale ones.
for smoke_name in $scanned_files; do
  smoke="$SMOKE_DIR/$smoke_name"
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
echo "## Unmapped surface"
echo
if [ "$unmapped_count" -eq 0 ]; then
  echo "  ✓ every changed file under templates/core/ fell under a mapped surface"
else
  printf '%s' "$unmapped_list"
  echo "      ↳ no glob in the SURFACES map matches these, so NOTHING was asserted"
  echo "        about them. Not fatal — but a green run does not cover them."
fi

# --- Allowlist staleness (plan.md §5 R13) -------------------------------
# An allow-listed path whose file is gone is the allowlist's own version of a
# stale assertion: it silently grants an exemption nothing needs any more.
echo
echo "## Suite membership"
echo
if [ -n "$membership_drift" ]; then
  printf '%s' "$membership_drift"
else
  echo "  ✓ SUITE_FILES matches the scripts on disk"
fi

echo
echo "## Allowlist scan"
echo
stale_allow_count=0
if [ -f "$ALLOWLIST" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue ;; esac
    entry="${line%%[[:space:]]*}"
    reason="$(printf '%s' "${line#"$entry"}" | sed 's/^[[:space:]]*//')"
    if [ -z "$reason" ]; then
      echo "  - $entry is allow-listed with no reason — ignored, so the gap is still fatal"
      stale_allow_count=$((stale_allow_count + 1))
      continue
    fi
    if [ ! -e "$SRC_ROOT/$entry" ]; then
      echo "  - $entry no longer exists — prune this allowlist entry"
      stale_allow_count=$((stale_allow_count + 1))
    fi
  done < "$ALLOWLIST"
fi
[ "$stale_allow_count" -eq 0 ] && echo "  ✓ no stale allowlist entries"

echo
echo "## Summary"
echo "  $gaps_count coverage gap(s)"
[ "$allowed_count" -gt 0 ] && echo "  $allowed_count allow-listed gap(s) (not fatal)"
echo "  $stale_count stale assertion(s)"
echo "  $stale_allow_count stale allowlist entr(y/ies)"
echo "  $unmapped_count unmapped surface change(s) (not fatal)"
drift_count="$(printf '%s' "$membership_drift" | grep -c '^  - ' || true)"
echo "  $drift_count suite-membership drift(s)"
echo
# The exit code IS the verdict (plan.md §5 R5). No caller re-derives it.
if [ "$gaps_count" -gt 0 ] || [ "$stale_count" -gt 0 ] || [ "$stale_allow_count" -gt 0 ] \
   || [ "$drift_count" -gt 0 ]; then
  echo "Add the missing assertions, prune the stale ones, or allow-list a gap"
  echo "with a written reason in $(basename "$ALLOWLIST"), then re-run."
  echo "(audit.sh never edits smoke scripts autonomously — that is on you.)"
  exit 1
fi
exit 0
