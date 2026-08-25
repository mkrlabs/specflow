#!/usr/bin/env bash
# Smoke test for `audit.sh` itself. Builds a self-contained synthetic repo,
# plants one of each finding type the audit is supposed to detect, and runs
# the REAL audit.sh against it.
#
# ─── Why it no longer copies audit.sh ────────────────────────────────────
# The previous version copied audit.sh alone into the synthetic tree and ran
# the copy. That made the meta-test depend on audit.sh deriving its source
# tree from wherever the file happened to sit — so the moment audit.sh
# gained a shared header (_common.sh), the single-file copy would have died
# at its first `source`, and any location-based derivation would have
# silently pointed it at the wrong directory.
#
# The audit's source tree and smoke directory are now explicit parameters,
# so this test points the real script at a synthetic tree instead of
# relocating it. That also deletes the question "is the copy still the same
# as the original" — there is no copy.
#
# ─── What it asserts ─────────────────────────────────────────────────────
#   1. a new bundled file with no assertion is reported (coverage gap)
#   2. an assertion referencing a deleted file is reported (staleness)
#   3. the summary counts exactly one of each
#   3b. a changed file under NO mapped surface is reported as unmapped
#       rather than passing in silence — and is not fatal by itself
#   3c. the allowlist escape actually works AND actually flips the verdict —
#       an untested escape hatch is how a gate quietly stops gating
#   3d. a stale allowlist entry — one whose file is gone — is reported, so
#       the allowlist cannot outlive what it excuses
#   3e. the exit codes that mean "could not run" (2, 3) are distinct from the
#       one that means "found things" (1); .specnaut/release/preflight.sh
#       branches on that difference and would otherwise blame a shallow clone
#       for coverage gaps
#   4. the EXIT CODE is the verdict: 0 on a clean tree, non-zero with
#      findings. The old version wrapped the call in `|| true` and grepped
#      only stdout, so it passed identically whether audit.sh exited 0, 1 or
#      99 — it could not have detected the contract it exists to guard.
#
# Usage: smoke-audit.sh <name>
set -euo pipefail

. "$(dirname "$0")/_common.sh"

NAME="${1:?usage: smoke-audit.sh <name>}"
SANDBOX="$(scenario_dir "$NAME")"
SYNTH_SMOKE="$SANDBOX/scripts/smoke"

trap 'rm -rf "$SANDBOX"' EXIT

rm -rf "$SANDBOX"
mkdir -p "$SANDBOX"
cd "$SANDBOX"

# --- Synthetic baseline state -------------------------------------------
git init -q -b main
git config user.email "smoke-audit@local"
git config user.name "smoke-audit"

mkdir -p templates/core/agents \
         templates/core/skills/board/scripts/github \
         templates/harness-specific/claude/hooks \
         "$SYNTH_SMOKE"

# Baseline content the smoke ALREADY covers, so the audit has a happy path
# alongside the planted gap.
cat > templates/core/agents/baseline-agent.md <<'EOF'
---
name: baseline-agent
description: existed in the baseline tag and is referenced by the smoke.
---
EOF

cat > "$SYNTH_SMOKE/smoke-features.sh" <<'EOF'
#!/usr/bin/env bash
# Synthetic smoke for the audit meta-test. Asserts the baseline agent is
# present. Does NOT mention the planted "new" agent — that's the gap.
set -euo pipefail
[ -f .claude/agents/baseline-agent.md ] || { echo "missing baseline"; exit 1; }
EOF
chmod +x "$SYNTH_SMOKE/smoke-features.sh"

git add -A
git commit -q -m "baseline"
git tag vTEST-BASELINE

# --- Assertion 4a: a clean tree exits 0 ---------------------------------
# Run before anything is planted. Same baseline, same HEAD: no surface
# change, no stale reference, so the verdict must be clean AND the exit code
# must say so on its own.
set +e
clean_out="$(bash "$SMOKE_DIR/audit.sh" --src-root "$SANDBOX" --smoke-dir "$SYNTH_SMOKE" --since vTEST-BASELINE 2>&1)"
clean_rc=$?
set -e

# --- Plant the two findings ---------------------------------------------
# 1. New bundled agent with no smoke assertion → coverage gap.
cat > templates/core/agents/new-fake-agent.md <<'EOF'
---
name: new-fake-agent
description: shipped after the baseline tag with zero smoke coverage.
---
EOF

# 2. Smoke referencing a runtime path whose source is missing → stale.
#    (`baseline-deleted-agent.md` never existed under templates/core/agents/.)
cat > "$SYNTH_SMOKE/smoke-stale.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
[ -f .claude/agents/baseline-deleted-agent.md ] || { echo "stale ref"; exit 1; }
EOF
chmod +x "$SYNTH_SMOKE/smoke-stale.sh"

# 3. A file under a category the SURFACES map has never heard of. It is not a
#    coverage gap (no glob claims it) and it must not be silently skipped —
#    silence here is how a required gate reports "every surface change has a
#    matching smoke assertion" about something it never looked at.
mkdir -p templates/core/statusline
cat > templates/core/statusline/config.md <<'EOF'
# a shipped category no glob in the SURFACES map matches
EOF

git add -A
git commit -q -m "plant audit findings"

# --- Run the audit against the planted tree -----------------------------
set +e
out="$(bash "$SMOKE_DIR/audit.sh" --src-root "$SANDBOX" --smoke-dir "$SYNTH_SMOKE" --since vTEST-BASELINE 2>&1)"
rc=$?
set -e

# --- Assertion 3c: the allowlist escape ---------------------------------
# Allow-list the planted gap WITH a reason, and separately WITHOUT one. The
# first must clear the gap and flip the exit code; the second must not,
# because an entry with no reason is not an entry.
#
# The stale smoke is taken off disk first, so the gap is genuinely the ONLY
# finding. Without this the exit code stays 1 for the stale assertion and the
# flip proves nothing — which is exactly what the first version of this test
# asserted, and it failed for the right reason.
rm -f "$SYNTH_SMOKE/smoke-stale.sh"
cat > "$SYNTH_SMOKE/coverage-allowlist.txt" <<'EOF'
templates/core/agents/new-fake-agent.md  deferred on purpose, for the meta-test
EOF
set +e
allow_out="$(bash "$SMOKE_DIR/audit.sh" --src-root "$SANDBOX" --smoke-dir "$SYNTH_SMOKE" --since vTEST-BASELINE 2>&1)"
allow_rc=$?
set -e

cat > "$SYNTH_SMOKE/coverage-allowlist.txt" <<'EOF'
templates/core/agents/new-fake-agent.md
EOF
set +e
noreason_out="$(bash "$SMOKE_DIR/audit.sh" --src-root "$SANDBOX" --smoke-dir "$SYNTH_SMOKE" --since vTEST-BASELINE 2>&1)"
noreason_rc=$?
set -e
rm -f "$SYNTH_SMOKE/coverage-allowlist.txt"

# Put the stale smoke back: the assertions below read `$out`, captured while
# it was present.
cat > "$SYNTH_SMOKE/smoke-stale.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
[ -f .claude/agents/baseline-deleted-agent.md ] || { echo "stale ref"; exit 1; }
EOF
chmod +x "$SYNTH_SMOKE/smoke-stale.sh"

# --- Assertion 3d: a stale allowlist entry ------------------------------
cat > "$SYNTH_SMOKE/coverage-allowlist.txt" <<'EOF'
templates/core/agents/this-file-was-deleted-long-ago.md  excuses a file that no longer exists
EOF
set +e
staleallow_out="$(bash "$SMOKE_DIR/audit.sh" --src-root "$SANDBOX" --smoke-dir "$SYNTH_SMOKE" --since vTEST-BASELINE 2>&1)"
staleallow_rc=$?
set -e
rm -f "$SYNTH_SMOKE/coverage-allowlist.txt"

# --- Assertion 3e: "could not run" is not "found things" ----------------
set +e
bash "$SMOKE_DIR/audit.sh" --src-root "$SANDBOX" --smoke-dir "$SYNTH_SMOKE" --since v99.99.99-does-not-exist >/dev/null 2>&1
baseline_rc=$?
# A directory that EXISTS but is in no git work tree. Anything under $SANDBOX
# is inside the synthetic repo, and a path that does not exist exits 1 from
# the flag validation — neither would reach the exit-3 branch.
notgit_dir="$(mktemp -d)"
bash "$SMOKE_DIR/audit.sh" --src-root "$notgit_dir" --smoke-dir "$SYNTH_SMOKE" --since vTEST-BASELINE >/dev/null 2>&1
notgit_rc=$?
rmdir "$notgit_dir"
set -e

echo "$out"
echo
echo "── assertions ──"

if grep -q "new-fake-agent.md" <<<"$out"; then
  pass "audit reports the planted coverage gap (new-fake-agent.md)"
else
  fail "audit did NOT report the planted coverage gap"
fi

if grep -q "baseline-deleted-agent.md" <<<"$out"; then
  pass "audit reports the planted stale assertion (baseline-deleted-agent.md)"
else
  fail "audit did NOT report the planted stale assertion"
fi

if grep -qE "^  1 coverage gap\(s\)$" <<<"$out"; then
  pass "audit summary counts exactly 1 coverage gap"
else
  fail "audit summary did NOT count exactly 1 coverage gap"
fi

if grep -qE "^  1 stale assertion\(s\)$" <<<"$out"; then
  pass "audit summary counts exactly 1 stale assertion"
else
  fail "audit summary did NOT count exactly 1 stale assertion"
fi

# The contract this file exists to guard (plan.md §5 R5, FR-004/FR-005).
if [ "$clean_rc" -eq 0 ]; then
  pass "audit exits 0 on a clean tree"
else
  fail "audit exited $clean_rc on a clean tree" "$(tail -6 <<<"$clean_out")"
fi

# Exactly 1, not merely non-zero: 2 and 3 mean "could not run", and a test
# that accepts any non-zero would go green on an audit that never ran.
if [ "$rc" -eq 1 ]; then
  pass "audit exits 1 with findings — the verdict is the exit code"
else
  fail "audit exited $rc WITH findings, expected 1" "1 means findings; 2 and 3 mean it could not run"
fi

if grep -q "prune this allowlist entry" <<<"$staleallow_out" && [ "$staleallow_rc" -ne 0 ]; then
  pass "an allowlist entry whose file is gone is reported and fatal"
else
  fail "stale allowlist entry not reported" "the allowlist can outlive what it excuses"
fi

if [ "$baseline_rc" -eq 2 ]; then
  pass "an unresolvable baseline exits 2, not 1 (could-not-run, not findings)"
else
  fail "unresolvable baseline exited $baseline_rc, expected 2" "preflight would blame a shallow clone for coverage gaps"
fi

if [ "$notgit_rc" -eq 3 ]; then
  pass "a non-git --src-root exits 3, not 1"
else
  fail "non-git src-root exited $notgit_rc, expected 3" "could-not-run is being reported as findings"
fi

if grep -q "templates/core/statusline/config.md" <<<"$out"; then
  pass "audit reports the unmapped surface (templates/core/statusline/)"
else
  fail "audit did NOT report the unmapped surface" "it passed in silence"
fi

if grep -qE "^  1 unmapped surface change\(s\)" <<<"$out"; then
  pass "audit summary counts exactly 1 unmapped surface change"
else
  fail "audit summary did NOT count exactly 1 unmapped surface change"
fi

if grep -qE "^  0 coverage gap\(s\)$" <<<"$allow_out" \
   && grep -q "allow-listed" <<<"$allow_out"; then
  pass "an allow-listed gap with a reason is cleared and shown as allow-listed"
else
  fail "the allowlist did not clear the gap" "$(grep -E 'coverage gap' <<<"$allow_out" | head -2)"
fi

if [ "$allow_rc" -eq 0 ]; then
  pass "allow-listing the only finding flips the exit code to 0"
else
  fail "allow-listed gap still exited $allow_rc" "the escape hatch does not actually work"
fi

# Asserted on the REPORT, not only on the exit code. audit.sh reaches
# non-zero here by two independent routes — the gap staying fatal, and the
# reasonless entry being itself a finding — so `rc != 0` would still pass if
# allow_reason regressed to accept an empty reason. Pin the gap count.
if grep -qE "^  1 coverage gap\(s\)$" <<<"$noreason_out" && [ "$noreason_rc" -ne 0 ]; then
  pass "an allowlist entry with NO reason does not grant an exemption"
else
  fail "a reasonless allowlist entry silenced the gap" \
       "$(grep -E 'coverage gap' <<<"$noreason_out" | head -1)"
fi

# A finding must not be inferable only from stdout: assert the two agree.
if [ "$clean_rc" -eq 0 ] && [ "$rc" -ne 0 ]; then
  pass "exit code and report agree in both directions"
else
  fail "exit code and report disagree" "clean_rc=$clean_rc findings_rc=$rc"
fi

finish "SMOKE-AUDIT"
