> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Replace Nested Conditional with Guard Clauses

**Family:** Simplifying conditional expressions

## Trigger

[Deep Nesting](../smells/deep-nesting.md) where the nesting is a chain of preconditions.

## Mechanics

Return early for each exceptional case, leaving the main path unindented at the end.

## Caution

Works when cases are genuinely exceptional. Where branches are equally normal alternatives, guard clauses hide that symmetry.
