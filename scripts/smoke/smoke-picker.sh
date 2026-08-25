#!/usr/bin/env bash
# Drive the interactive arrow-key picker over a real PTY so
# `Deno.stdin.isTerminal()` returns true and the TUI code path runs.
# Sends arrow-down + enter sequences to verify navigation + selection
# render correctly and the resulting init landed the right harness +
# backlog backend.
#
# Usage: smoke-picker.sh <name>
set -euo pipefail

NAME="${1:?usage: smoke-picker.sh <name>}"
. "$(dirname "$0")/_common.sh"
DIR="$(scenario_dir "$NAME")"

# Trap-based cleanup: wipe the scenario directory on every exit path
# (success OR failure) so the sandbox/ tree never accumulates orphans.
trap 'bash "$SMOKE_DIR/clean.sh" "$NAME" >/dev/null 2>&1 || true' EXIT

bash "$SMOKE_DIR/bootstrap-empty.sh" "$NAME" >/dev/null

if ! command -v python3 >/dev/null 2>&1; then
  echo "❌ python3 not on PATH — needed to allocate a PTY for this test"
  exit 1
fi

# Python driver: forks a PTY-attached child running specnaut init,
# scripts arrow-down/enter keystrokes, captures all output.
out="$(PROJECT_DIR="$DIR" MAIN_TS="$CLI/src/main.ts" python3 - <<'PYEOF'
import os
import signal, pty, select, sys, time

PROJECT_DIR = os.environ["PROJECT_DIR"]
MAIN_TS = os.environ["MAIN_TS"]
ARGS = ["deno", "run", "--allow-all", MAIN_TS, "init", "--here", "--no-git"]
# The keystrokes below must cover EVERY interactive step of `init`, in order.
# When a step is added upstream and this list is not, the extra prompt gets no
# input, init blocks forever, and every later assertion fails against a
# project that was never written — which reads like five product defects
# instead of one missing "\r". That has now happened twice (#257, and the
# spec picker below). If you add a prompt to init, add a keystroke here.
#
#   1. harness picker         2× down + enter  → Codex CLI
#   2. backlog backend        2× down + enter  → GitHub Issues
#      (#406 order: cloud, local, github, gitlab — cloud is the default)
#   3. versioning scheme      enter            → default   (#257)
#   4. spec storage           enter            → default   ← was missing
#   5. kanban URL prompt      enter            → skip      (#147)
SCRIPT = [
    (0.5, b"\x1b[B"),
    (0.2, b"\x1b[B"),
    (0.3, b"\r"),
    (0.5, b"\x1b[B"),
    (0.2, b"\x1b[B"),
    (0.3, b"\r"),
    (0.5, b"\r"),
    (0.5, b"\r"),
    (0.5, b"\r"),
]

os.chdir(PROJECT_DIR)
pid, fd = pty.fork()
if pid == 0:
    os.execvp(ARGS[0], ARGS)

captured = bytearray()
# A hang must fail fast and SAY it hung. The previous version burned 25s and
# then reported four assertion failures about a missing .specnaut/ directory,
# which points at the product rather than at this script.
TIMEOUT = float(os.environ.get("PICKER_TIMEOUT", "20"))
deadline = time.time() + TIMEOUT
script = list(SCRIPT)
next_at = time.time() + (script[0][0] if script else 0)
while time.time() < deadline:
    r, _, _ = select.select([fd], [], [], 0.1)
    if r:
        try:
            chunk = os.read(fd, 4096)
        except OSError:
            break
        if not chunk:
            break
        captured.extend(chunk)
    if script and time.time() >= next_at:
        _, payload = script.pop(0)
        os.write(fd, payload)
        if script:
            next_at = time.time() + script[0][0]
    try:
        done_pid, _status = os.waitpid(pid, os.WNOHANG)
    except ChildProcessError:
        break
    if done_pid == pid:
        break

os.close(fd)
timed_out = time.time() >= deadline
if timed_out:
    # Reap before returning: the child is still running on this path, and the
    # caller's EXIT trap rm -rf's the tree it may still be writing into.
    try:
        os.kill(pid, signal.SIGKILL)
        os.waitpid(pid, 0)
    except (ProcessLookupError, ChildProcessError):
        pass
    captured.extend(b"\n__SMOKE_PICKER_TIMEOUT__\n")
sys.stdout.buffer.write(bytes(captured))
PYEOF
)"


# The capture is a raw PTY buffer: ANSI/OSC control sequences, and on a public
# repository the CI log is world-readable and served raw. Strip the escapes and
# cap the tail before any of it becomes a failure detail — smoke-hooks.sh:108
# already has the right instinct with `head -1`.
detail() { printf '%s' "$out" | sed $'s/\x1b\[[0-9;?]*[A-Za-z]//g' | tail -25; }

# #550: every assertion below reads `$out` through a here-string, never
# `printf … | grep -q`. This script runs under `pipefail`, and `grep -q` exits
# the moment it matches — which SIGPIPEs the producer and makes the PIPELINE
# report 141 for a run that FOUND the string. The assertion then decides on
# the writer's death rather than on the content, and it decides wrong in the
# direction that reports a defect where there is none. A here-string is not a
# pipeline, so there is no producer to kill.
#
# The hang check comes FIRST: when init never completed, every assertion below
# fails for that one reason, and reporting them as five findings is how a
# missing keystroke reads like a product defect.
if grep -q "__SMOKE_PICKER_TIMEOUT__" <<<"$out"; then
  fail "init never completed — the keystroke script is short a step" \
       "add the missing prompt to SCRIPT; see the numbered list in this file"
  # Short-circuit. `fail` does not exit, so every assertion below used to run
  # and fail for this one cause — one missing keystroke reported as ten
  # findings, which reads like a product defect instead of a script defect.
  # The comment above has said this for a while; the code did not do it.
  finish "PICKER"
fi

grep -q "Choose your AI harness" <<<"$out" \
  && pass "harness picker prompt rendered" \
  || fail "harness prompt missing" "$(detail)"

grep -q "❯ Codex CLI" <<<"$out" \
  && pass "highlight reached Codex CLI after 2 arrow-downs" \
  || fail "❯ never reached Codex CLI" "$(detail)"

grep -q "Choose your backlog backend" <<<"$out" \
  && pass "backlog picker prompt rendered" \
  || fail "backlog prompt missing" "$(detail)"

# Since #406: Specnaut Cloud is listed first and marked recommended (default).
grep -q "Specnaut Cloud.*recommended (default)" <<<"$out" \
  && pass "Specnaut Cloud marked recommended (default)" \
  || fail "Cloud not marked recommended (default)" "$(detail)"

# This slot used to assert a separate "hosted online Kanban" benefit note.
# That note no longer exists — it was folded into the backend's display name,
# which the check above already covers. Rather than delete the assertion, it
# now covers the SPEC PICKER: the step whose addition is what broke this
# script, and which had no assertion of its own.
grep -q "Choose where your specs are stored" <<<"$out" \
  && pass "spec-storage picker prompt rendered" \
  || fail "spec-storage picker missing" "$(detail)"

grep -q "❯ GitHub Issues" <<<"$out" \
  && pass "highlight reached GitHub backend after two arrow-downs (new cloud-first order)" \
  || fail "❯ never reached GitHub backend" "$(detail)"

grep -q "Open the project in Codex CLI" <<<"$out" \
  && pass "init resolved harness = Codex CLI (selected harness honored)" \
  || fail "init did not pick Codex CLI" "$(detail)"

[ -f "$DIR/.specnaut/backlog-config.yml" ] \
  && pass "backlog-config.yml written (github backend honored)" \
  || fail "backlog-config.yml missing" "$(ls "$DIR/.specnaut" 2>&1 || echo none)"

[ -f "$DIR/.specnaut/installed.lock" ] \
  && pass "installed.lock written" \
  || fail "installed.lock missing" "$(ls "$DIR/.specnaut" 2>&1 || echo none)"

finish "PICKER"
