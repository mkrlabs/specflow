#!/usr/bin/env bash
# Fire each bundled Claude hook with a synthetic stdin payload, verify
# the side effects, and confirm exit codes are 0 (soft warn-only).
#
# Usage: smoke-hooks.sh <name>
set -euo pipefail

NAME="${1:?usage: smoke-hooks.sh <name>}"
. "$(dirname "$0")/_common.sh"
DIR="$(scenario_dir "$NAME")"

# Trap-based cleanup: wipe the scenario directory on every exit path
# (success OR failure) so the sandbox/ tree never accumulates orphans.
trap 'bash "$SMOKE_DIR/clean.sh" "$NAME" >/dev/null 2>&1 || true' EXIT

bash "$SMOKE_DIR/bootstrap-vite.sh" "$NAME" >/dev/null
(cd "$DIR" && deno run --allow-all "$CLI/src/main.ts" \
  init --here --no-git --ai claude --backlog local >/dev/null 2>&1)

cd "$DIR"

echo "═══ protect-generated.sh ═══"

# Lock edit → soft warn, exit 0
# `ec=$?` on its own line is unreachable under `set -e`: a non-zero hook makes
# the ASSIGNMENT non-zero, errexit fires, and the script dies before $? is read
# — so ec was always 0 by the time the assertion ran. Capturing the status
# inside the substitution is the idiom this file already uses below.
out=$(echo '{"tool_input":{"file_path":"/x/.specnaut/installed.lock"}}' \
  | bash .claude/hooks/protect-generated.sh 2>&1; echo "ec=$?")
echo "$out" | grep -q "ec=0" && pass "exit code 0 on lock edit (soft warn)" \
  || fail "non-zero exit on lock edit" "$out"
echo "$out" | grep -q "warn:" \
  && pass "warning emitted on lock edit" \
  || fail "missing warning text" "$out"

# Unrelated file → silent, exit 0
out=$(echo '{"tool_input":{"file_path":"/x/random.txt"}}' \
  | bash .claude/hooks/protect-generated.sh 2>&1)
[ -z "$out" ] && pass "silent on unrelated file" \
  || fail "unexpected output on unrelated file" "$out"

# Empty stdin → silent, exit 0
out=$(echo "" | bash .claude/hooks/protect-generated.sh 2>&1; echo "ec=$?")
echo "$out" | grep -q "ec=0" \
  && pass "exit 0 on empty stdin" \
  || fail "non-zero exit on empty stdin" "$out"

echo
echo "═══ log-subagent.sh ═══"

rm -f .specnaut/logs/agents.jsonl
echo '{"session_id":"sess-A","subagent_name":"product-owner"}' \
  | bash .claude/hooks/log-subagent.sh start
[ -f .specnaut/logs/agents.jsonl ] \
  && pass "agents.jsonl created" \
  || fail "log file not created" "$(ls .specnaut/logs/ 2>&1 || echo none)"

line=$(cat .specnaut/logs/agents.jsonl)
echo "$line" | grep -q '"event":"start"' \
  && pass 'event field = "start"' \
  || fail "wrong event field" "$line"
echo "$line" | grep -q '"agent":"product-owner"' \
  && pass "agent field extracted" \
  || fail "agent field missing" "$line"
echo "$line" | grep -q '"session":"sess-A"' \
  && pass "session field extracted" \
  || fail "session field missing" "$line"

# Second event appends
echo '{"session_id":"sess-A","subagent_name":"product-owner"}' \
  | bash .claude/hooks/log-subagent.sh stop
count=$(wc -l < .specnaut/logs/agents.jsonl | tr -d ' ')
[ "$count" = "2" ] && pass "stop event appended (2 lines total)" \
  || fail "expected 2 lines, got $count" "$(cat .specnaut/logs/agents.jsonl)"

# Missing payload fields → "unknown" defaults
echo '{}' | bash .claude/hooks/log-subagent.sh start
last=$(tail -1 .specnaut/logs/agents.jsonl)
echo "$last" | grep -q '"agent":"unknown"' \
  && pass "agent defaults to 'unknown' when missing" \
  || fail "did not default to 'unknown'" "$last"

echo
echo "═══ check-backlog-prereqs.sh (local backend) ═══"

# Capturing the status inside the substitution appends an `ec=N` line, so the
# hook's OWN output is everything except that last line. Asserting silence
# against the raw capture would compare against a string that is never empty.
out=$(echo "{}" | bash .claude/hooks/check-backlog-prereqs.sh 2>&1; echo "ec=$?")
hook_out="$(printf '%s' "$out" | sed '$d')"
echo "$out" | grep -q "ec=0" && pass "exit 0 on local backend" \
  || fail "non-zero exit" "$out"
[ -z "$hook_out" ] && pass "silent on local backend (no warn)" \
  || fail "unexpected output on local backend" "$hook_out"

echo
echo "═══ check-backlog-prereqs.sh (github backend, gh present) ═══"
# Patch the lock to simulate the github backend
sed -i.bak 's/backlog_backend: local/backlog_backend: github/' \
  .specnaut/installed.lock
out=$(echo "{}" | bash .claude/hooks/check-backlog-prereqs.sh 2>&1; echo "ec=$?")
mv .specnaut/installed.lock.bak .specnaut/installed.lock
echo "$out" | grep -q "ec=0" && pass "exit 0 on github backend" \
  || fail "non-zero exit" "$out"
# If gh is installed + auth'd, no warning. If not, warning. Either is OK
# as long as exit 0 and no crash.
echo "(github-backend output: $(echo "$out" | head -1))"

echo
echo "═══ no lock present (e.g. uninitialised project) ═══"
mv .specnaut/installed.lock /tmp/spec-lock-backup-$$
out=$(echo '{"tool_input":{"file_path":"/x/.specnaut/installed.lock"}}' \
  | bash .claude/hooks/protect-generated.sh 2>&1; echo "ec=$?")
echo "$out" | grep -q "ec=0" \
  && pass "protect-generated exits 0 with no lock" \
  || fail "protect-generated crashed" "$out"
out=$(echo "{}" | bash .claude/hooks/check-backlog-prereqs.sh 2>&1; echo "ec=$?")
echo "$out" | grep -q "ec=0" \
  && pass "check-backlog-prereqs exits 0 with no lock" \
  || fail "check-backlog-prereqs crashed" "$out"
mv /tmp/spec-lock-backup-$$ .specnaut/installed.lock

finish "HOOKS"
