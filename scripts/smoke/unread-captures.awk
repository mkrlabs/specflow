# unread-captures.awk — one lexical shape of "an assertion that cannot fail".
#
# Reads shell on stdin (already passed through smoke_code_lines, so trailing
# comments are gone) and emits one line per `name=$(...)` capture whose only
# readers sit inside a `fail` call:
#
#     <name>|<assignment line number>|<reads inside a fail>
#
# It decides three things and nothing more:
#   * a capture is `name=$(`, `name="$(`, or `local name=$(` at the start of
#     a line, leading whitespace ignored;
#   * a read is `$name` or `${name` followed by a non-word character — the
#     boundary check is why `$prefix_trapX` is not a read of `prefix_trap`;
#   * a fail context is a line whose first word is `fail`, plus every line
#     continued from it with a trailing backslash.
#
# Heredoc bodies are skipped. They are DATA — this suite embeds shell,
# Python and Markdown in them — and reading one as code invents captures
# nobody wrote. smoke_code_lines() deliberately does not track heredocs
# (README, "Known limit"); this file must, because a fixture that looks like
# an assignment is exactly what a smoke fixture is made of.
#
# 024-R4: this is lexical. It proves a captured value is READ somewhere, not
# that the comparison it feeds is meaningful.

function countrefs(s, nm,   c, p, q, rest, ch, nlen) {
  c = 0; nlen = length(nm); p = 1
  while (1) {
    q = index(substr(s, p), "$")
    if (q == 0) break
    p = p + q - 1
    rest = substr(s, p + 1)
    if (substr(rest, 1, 1) == "{") rest = substr(rest, 2)
    if (substr(rest, 1, nlen) == nm) {
      ch = substr(rest, nlen + 1, 1)
      if (ch !~ /[A-Za-z0-9_]/) c++
    }
    p = p + 1
  }
  return c
}
{ L[NR] = $0 }
END {
  # Heredoc bodies are DATA, not code. smoke_code_lines() deliberately does
  # not track them (README, "Known limit"), and this suite embeds shell,
  # Python and Markdown in heredocs — reading those as code invents captures
  # that were never written.
  inhd = 0
  for (i = 1; i <= NR; i++) {
    line = L[i]
    if (inhd) {
      t = line; sub(/^[ \t]+/, "", t)
      if (t == hdtag || line == hdtag) { inhd = 0 }
      skip[i] = 1
      continue
    }
    # `<<<` is a HERE-STRING, not a heredoc. A regex for `<<` matches inside
    # it starting at the second `<`, which opened a phantom heredoc on
    # `grep -q "$RE" <<<'scripts/smoke/audit.sh'` and swallowed the next 50
    # lines of run-all.sh — including the only real read of a variable, which
    # was then reported as an unread capture. Scan positions explicitly.
    n = length(line)
    for (k = 1; k <= n - 1; k++) {
      if (substr(line, k, 2) != "<<") continue
      if (k > 1 && substr(line, k - 1, 1) == "<") continue
      if (substr(line, k + 2, 1) == "<") continue
      tail = substr(line, k + 2)
      if (match(tail, /^-?[ \t]*["']?[A-Za-z_][A-Za-z0-9_]*/)) {
        seg = substr(tail, RSTART, RLENGTH)
        sub(/^-?[ \t]*["']?/, "", seg)
        hdtag = seg; inhd = 1
      }
      break
    }
  }
  for (i = 1; i <= NR; i++) {
    if (skip[i]) continue
    t = L[i]
    sub(/^[ \t]+/, "", t)
    sub(/^local[ \t]+/, "", t)
    # `$((` is ARITHMETIC, not command substitution. `n=$((n + 1))` is a
    # counter, and reading it as a capture reported every counter in the
    # suite — arithmetic references the name WITHOUT a `$`, so countrefs()
    # cannot see the reads and the finding looked real.
    if (t ~ /^[A-Za-z_][A-Za-z0-9_]*=["']?\$\([^(]/) {
      eq = index(t, "="); nm = substr(t, 1, eq - 1)
      if (!(nm in asg)) asg[nm] = i
    }
  }
  cont = 0; prevfail = 0
  for (i = 1; i <= NR; i++) {
    t = L[i]; sub(/^[ \t]+/, "", t)
    if (cont) isfail[i] = prevfail
    else isfail[i] = (t ~ /^fail[ \t]/) ? 1 : 0
    prevfail = isfail[i]
    cont = (L[i] ~ /\\$/) ? 1 : 0
  }
  for (nm in asg) {
    rd = 0; fr = 0
    for (i = 1; i <= NR; i++) {
      if (skip[i]) continue
      n = countrefs(L[i], nm)
      if (n == 0) continue
      if (isfail[i]) fr += n; else rd += n
    }
    if (rd == 0) printf "%s|%d|%d\n", nm, asg[nm], fr
  }
}
