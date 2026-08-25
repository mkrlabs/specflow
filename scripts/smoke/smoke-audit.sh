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

if [ "$rc" -ne 0 ]; then
  pass "audit exits non-zero with findings (exit $rc) — the verdict is the exit code"
else
  fail "audit exited 0 WITH findings" "the exit code is not the verdict; preflight would pass a red audit"
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

if [ "$noreason_rc" -ne 0 ]; then
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
