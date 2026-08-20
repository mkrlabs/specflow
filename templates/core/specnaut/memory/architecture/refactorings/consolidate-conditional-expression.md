> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Consolidate Conditional Expression

**Family:** Simplifying conditional expressions

## Trigger

Several separate conditions with the same result.

## Mechanics

Combine them into one expression and extract it into a named test.

## Caution

Only when they are one concept. Merging genuinely independent checks hides which one fired, which matters when the answer must be explained.
