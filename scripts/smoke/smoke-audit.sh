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
#   3f. a basename that appears ONLY inside a comment is not coverage —
#       a comment resolves nothing, and one saying a file is deliberately
#       uncovered would otherwise vouch for it (#545)
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
mkdir -p templates/core/statusline src/cli
cat > templates/core/statusline/config.md <<'EOF'
# a shipped category no glob in the SURFACES map matches
EOF
# And one under src/cli/, which the diff pathspec collects but no SURFACES
# glob claims. The unmapped section was originally scoped to templates/core/
# only, so this whole root fell through in silence.
cat > src/cli/new_surface.ts <<'EOF'
// a CLI surface the audit collects but maps to nothing
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
# Both classes must be excused for the verdict to flip: the coverage gap and
# the unmapped category #549 made fatal. That one rule clears either is the
# point of the hatch.
cat > "$SYNTH_SMOKE/coverage-allowlist.txt" <<'EOF'
templates/core/agents/new-fake-agent.md  deferred on purpose, for the meta-test
templates/core/statusline/config.md  an unmapped category, excused with a reason
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

# --- Assertion 3f: a mention inside a COMMENT is not coverage -----------
# #545. The coverage test was one unanchored fixed-string match over the
# whole smoke file, so a basename occurring only in a comment counted as
# coverage — including a comment saying the file is deliberately NOT
# covered. The failure direction is the one a gate must never take: it
# reports coverage that does not exist.
#
# Planted last, and captured separately, so the counts every assertion
# above pins against `$out` are untouched.
cat > templates/core/agents/comment-only-agent.md <<'EOF'
---
name: comment-only-agent
description: mentioned by the smoke in a comment and nowhere else.
---
EOF
cat >> "$SYNTH_SMOKE/smoke-features.sh" <<'EOF'
# comment-only-agent.md is named here and nowhere else in this file.
# A comment resolves nothing and asserts nothing; it must not vouch for a file.
EOF
git add -A
git commit -q -m "plant a file mentioned only in a comment"
#
# The exit code is deliberately NOT captured here. This run is non-zero for
# the planted stale assertion whatever the coverage logic does, so an
# assertion on it would pass with the defect still in place — the vacuous
# shape #546 exists to remove from this file. The gap COUNT below is the
# assertion that can fail.
set +e
commentonly_out="$(bash "$SMOKE_DIR/audit.sh" --src-root "$SANDBOX" --smoke-dir "$SYNTH_SMOKE" --since vTEST-BASELINE 2>&1)"
set -e

# --- Assertion 3g: a skill's basename identifies nothing ----------------
# #547. Every skill file is named SKILL.md, so the basename match was
# constant-true across the whole surface and 13 shipped skills were asserted
# on by nothing. Two are planted, because the naive repair fails on the
# second: `lonely-skill` is named nowhere, and `mentioned-elsewhere` is named
# ONLY inside an assertion whose subject is a different file — the shape at
# smoke-features.sh:591 that both plan-time audits found. A token built from
# the bare skill name reports the second one covered.
mkdir -p templates/core/skills/lonely-skill templates/core/skills/mentioned-elsewhere
printf -- '---\nname: lonely-skill\n---\n' > templates/core/skills/lonely-skill/SKILL.md
printf -- '---\nname: mentioned-elsewhere\n---\n' > templates/core/skills/mentioned-elsewhere/SKILL.md
cat >> "$SYNTH_SMOKE/smoke-features.sh" <<'EOF'
[ -f .claude/skills/board/SKILL.md ] || { echo "missing board"; exit 1; }
grep -q "mentioned-elsewhere" .claude/skills/board/SKILL.md || { echo "no xref"; exit 1; }
EOF
git add -A
git commit -q -m "plant two skills, one named only in another file's assertion"
set +e
skills_out="$(bash "$SMOKE_DIR/audit.sh" --src-root "$SANDBOX" --smoke-dir "$SYNTH_SMOKE" --since vTEST-BASELINE 2>&1)"
set -e

# --- Assertion 3h: a non-ASCII path is mapped like any other -------------
# #549. git renders a path containing non-ASCII bytes as an escaped, quoted
# string, so it matched no glob in SURFACES and left through the "Unmapped
# surface" bucket — which was not fatal. A file nothing asserts on, on a green
# gate. The fix is `-c core.quotePath=false`; this pins that the file lands in
# the COVERAGE scan, not in the unmapped one.
mkdir -p templates/core/agents
printf -- '---\nname: accented\n---\n' > "templates/core/agents/agént-café.md"
git add -A
git commit -q -m "plant an agent whose name is not ASCII"
set +e
nonascii_out="$(bash "$SMOKE_DIR/audit.sh" --src-root "$SANDBOX" --smoke-dir "$SYNTH_SMOKE" --since vTEST-BASELINE 2>&1)"
set -e

# --- Assertion 3i: an unmapped file is fatal, and 022-R13 still governs ----
# The allow-list is the escape hatch for the new fatal class, and an entry
# without a written reason is not an entry — the same refusal that already
# applies to coverage gaps.
mkdir -p templates/core/nosuchcategory
echo "shipped, claimed by no glob" > templates/core/nosuchcategory/thing.md
git add -A
git commit -q -m "plant a category the SURFACES map has never heard of"
set +e
unmapped_out="$(bash "$SMOKE_DIR/audit.sh" --src-root "$SANDBOX" --smoke-dir "$SYNTH_SMOKE" --since vTEST-BASELINE 2>&1)"
unmapped_rc=$?
set -e
cat > "$SYNTH_SMOKE/coverage-allowlist.txt" <<'EOF'
templates/core/nosuchcategory/thing.md
EOF
set +e
unmapped_noreason_out="$(bash "$SMOKE_DIR/audit.sh" --src-root "$SANDBOX" --smoke-dir "$SYNTH_SMOKE" --since vTEST-BASELINE 2>&1)"
set -e
cat > "$SYNTH_SMOKE/coverage-allowlist.txt" <<'EOF'
templates/core/nosuchcategory/thing.md  a deliberate category, excused on purpose
EOF
set +e
unmapped_reason_out="$(bash "$SMOKE_DIR/audit.sh" --src-root "$SANDBOX" --smoke-dir "$SYNTH_SMOKE" --since vTEST-BASELINE 2>&1)"
set -e
rm -f "$SYNTH_SMOKE/coverage-allowlist.txt"

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
# AC4: clean_out's only reader used to be the `fail` diagnostic below, which
# runs only once this assertion has already decided. A diagnostic is not a
# reader. Assert the clean REPORT, not just the clean exit code.
# The clean scenario runs at the baseline with nothing planted, so the coverage
# scan takes its no-changes branch — NOT the "every surface change has a
# matching smoke assertion" branch, which needs a non-empty diff. Asserting the
# wrong one of the two is how this check first failed; the two lines are not
# interchangeable and the distinction is the report's, not this file's.
if grep -qE "^  ✓ no user-visible surface changes since " <<<"$clean_out" \
   && grep -qE "^  0 coverage gap\(s\)$" <<<"$clean_out" \
   && grep -qE "^  0 stale assertion\(s\)$" <<<"$clean_out"; then
  pass "a clean tree SAYS it is clean, in the report and not only in the exit code"
else
  fail "the clean report did not say what a clean tree looks like" \
       "$(grep -E 'coverage gap|stale assertion|surface change' <<<"$clean_out" | head -3)"
fi

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

# One unmapped (a shipped category — fatal) and one outside the scaffolded
# surface (src/cli — reported, not fatal). #549 split them: #544 added src/cli
# to the pathspec so it would be VISIBLE, and that stands; but the smoke suite
# does not test this repository's TypeScript, so it must not block a release.
if grep -qE "^  1 unmapped surface change\(s\)" <<<"$out"; then
  pass "audit counts the shipped unmapped category"
else
  fail "unmapped count is not 1" "$(grep -E 'unmapped' <<<"$out" | head -2)"
fi
if grep -qE "^  1 change\(s\) outside the scaffolded surface \(not fatal\)" <<<"$out"; then
  pass "and counts the src/cli change separately, as not fatal"
else
  fail "the outside-the-surface class was not counted" "$(grep -E 'outside' <<<"$out" | head -2)"
fi

if grep -q "src/cli/new_surface.ts" <<<"$out"; then
  pass "an unmapped src/cli/ change is named, not silently skipped"
else
  fail "src/cli/ change fell through in silence" "the unmapped section had its own blind spot"
fi

# Anchored to the PER-FILE line. `grep -q "allow-listed"` was satisfied by the
# summary line `N allow-listed gap(s) (not fatal)` just as readily, so the
# assertion survived the per-file report disappearing entirely.
if grep -qE "^  0 coverage gap\(s\)$" <<<"$allow_out" \
   && grep -qE "^  ~ templates/core/agents/new-fake-agent\.md \(allow-listed\)$" <<<"$allow_out"; then
  pass "an allow-listed gap with a reason is cleared and named per file"
else
  fail "the allowlist did not clear the gap" "$(grep -E 'coverage gap' <<<"$allow_out" | head -2)"
fi

# AC3 — the recorded REASON is read. Carrying it is the entire point of 022-R13
# and audit.sh prints it, but nothing had ever looked at the text.
if grep -qE "^      reason: deferred on purpose, for the meta-test$" <<<"$allow_out"; then
  pass "the allowlist entry's written reason is echoed back verbatim"
else
  fail "the recorded reason was not reported" \
       "an entry may as well carry no reason if the report never shows it (022-R13)"
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

# DELETED: an assertion named "exit code and report agree in both directions",
# written as `[ "$clean_rc" -eq 0 ] && [ "$rc" -ne 0 ]`. It was the conjunction
# of two assertions that already stand above it — "audit exits 0 on a clean
# tree" and "audit exits 1 with findings", the second of which is strictly
# stronger than `-ne 0`. It read no report and could not fail on its own.
#
# Not rewritten to pin report content, because an assertion that cannot fail is
# worse than an absent one: it is counted. Do not reinstate it — if you want the
# agreement checked, the two assertions above are where it lives.

if grep -q "comment-only-agent.md" <<<"$commentonly_out"; then
  pass "a basename occurring only in a comment is NOT coverage (#545)"
else
  fail "a comment vouched for a file" \
       "audit reported coverage for comment-only-agent.md, which no assertion names"
fi

# Asserted on the REPORT, not merely on the exit code: this run is non-zero
# for the planted stale assertion regardless, so `rc != 0` would pass even
# with the comment still counting as coverage. Pin the count instead.
if grep -qE "^  2 coverage gap\(s\)$" <<<"$commentonly_out"; then
  pass "the comment-only file is counted as a gap, not merely mentioned"
else
  fail "gap count did not reach 2 with the comment-only file planted" \
       "$(grep -E 'coverage gap' <<<"$commentonly_out" | head -1)"
fi

if grep -q "skills/lonely-skill/SKILL.md" <<<"$skills_out"; then
  pass "a skill no smoke names is a coverage gap (#547)"
else
  fail "a skill nothing asserts on was reported covered" \
       "every skill's basename is SKILL.md, so the basename match cannot fail"
fi

if grep -q "skills/mentioned-elsewhere/SKILL.md" <<<"$skills_out"; then
  pass "naming a skill inside another file's assertion is not coverage"
else
  fail "a cross-reference vouched for a skill" \
       "the token must not be the bare skill name — smoke-features.sh:591 is this shape"
fi

# Pinned as a COUNT, the way 3f is. Both greps above match substrings that the
# non-fatal "Unmapped surface" section also prints, so they would stay green if
# skills stopped being coverage-scanned at all — the section would name the same
# paths for a different reason.
if grep -qE "^  4 coverage gap\(s\)$" <<<"$skills_out"; then
  pass "both planted skills are counted as gaps, not merely named somewhere"
else
  fail "gap count is not 4 with two skills planted" \
       "$(grep -E 'coverage gap' <<<"$skills_out" | head -1)"
fi

if grep -qF "agént-café.md" <<<"$nonascii_out"; then
  pass "a non-ASCII path is seen by the scan at all (#549)"
else
  fail "a non-ASCII path was invisible" "git quotes it unless core.quotePath=false"
fi
if grep -A20 "## Coverage scan" <<<"$nonascii_out" | grep -qF "agént-café.md"; then
  pass "and it is judged by the COVERAGE scan, not swallowed as unmapped"
else
  fail "the non-ASCII file did not reach the coverage scan" \
       "$(grep -B1 -A3 'Unmapped surface' <<<"$nonascii_out" | head -5)"
fi

if [ "$unmapped_rc" -ne 0 ] && grep -qF "nosuchcategory/thing.md" <<<"$unmapped_out"; then
  pass "a changed file no glob claims is fatal, not advisory"
else
  fail "an unmapped category did not fail the audit" "rc=$unmapped_rc"
fi
# The COUNT, not the exit code: this scenario is non-zero for several unrelated
# findings, so `rc != 0` would pass with the rule regressed — the vacuous shape
# #546 removed from this file. The pair is the control: same entry, one without
# a reason and one with, and only the count distinguishes them.
if grep -qE "^  2 unmapped surface change\(s\)" <<<"$unmapped_noreason_out"; then
  pass "allow-listing it WITHOUT a reason does not excuse it (022-R13)"
else
  fail "a reasonless allowlist entry changed the unmapped count" \
       "$(grep -E 'unmapped surface change' <<<"$unmapped_noreason_out" | head -1)"
fi
if grep -qE "^  1 unmapped surface change\(s\)" <<<"$unmapped_reason_out" \
   && grep -qF "(unmapped, allow-listed)" <<<"$unmapped_reason_out"; then
  pass "and the SAME entry WITH a reason does excuse it"
else
  fail "a reasoned allowlist entry did not excuse the unmapped file" \
       "$(grep -E 'unmapped surface change|allow-listed' <<<"$unmapped_reason_out" | head -2)"
fi

finish "SMOKE-AUDIT"
