# Plan audits — architecture and security, against the plan

Loaded by `phases/plan.md` at step 6. Both audits run **before a single line of code is written**,
dispatched **in the same message** so they execute concurrently. They judge different things and
neither substitutes for the other.

**Both are read-only and advisory.** They do not veto — the user does, at the stop that ends `plan`.
But their findings go **into `plan.md`**: either the plan changes, or it records why the objection
was accepted. An audit whose output is not written down did not happen. A clean verdict is written
down **with its coverage**, because a clean verdict is worth exactly what it covered.

## 🔒 The architecture audit

**Dispatch the `architect-expert` agent on `plan.md` before a single line is written** — here,
while changing your mind is still free, because architecture found at review time is architecture
rebuilt. The defect class it catches: a decision that must agree, spelled in more than one place, or
asked in a caller instead of at the decision. Ask four questions, in this order:

1. **Is the decision table complete?** Name any rule in the requirements with no row. A missing row
   is the defect this phase exists to prevent.
2. **Is each home the right home?** A pure rule belongs in its bounded context, not in a service; a
   decision asked by two gates belongs *in* the decision, not in either caller.
3. **What is the blast radius?** How many existing call sites, routes, components or surfaces does
   each new rule touch — **counted, not estimated.** This is where the cost hides: a gate described
   in one sentence can change the behaviour of two hundred routes.
4. **What would a reviewer find in this design three cycles from now?** In writing. A design whose
   predicted findings are already known can be corrected now, for the price of an edit.

## 🛡 The security audit

**Dispatch the `security-expert` agent on `plan.md` in the same message as the architecture audit**
so both run concurrently. Neither substitutes for the other: the architect asks whether a rule has
one home, the security seat asks whether that home is reachable by someone who should not reach it.
These are the most expensive findings to fix late — a missing authorization gate is one line, but a
data model that made the gate impossible is a migration, a backfill, and every caller. Ask four
questions, in this order:

1. **Which new surface accepts input, and where does it stop?** Every route, job, webhook and upload
   path the plan adds, and the validator that bounds it. A boundary with no validator named is the
   finding.
2. **Who is allowed, and where is that decided?** One authorization decision per new capability, at
   its home. Two gates for one rule, or a gate in a caller rather than at the decision, is the
   architect's defect class arriving through a different door.
3. **What identifiers and what bytes become reachable?** Enumerable ids, a path that skips its
   access check, a field that should never leave the server.
4. **What does this let an authenticated stranger do to somebody else's account?** In writing.
   "Nothing" is acceptable only when it names what was checked.
