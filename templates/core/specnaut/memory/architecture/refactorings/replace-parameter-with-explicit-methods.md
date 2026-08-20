> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Replace Parameter with Explicit Methods

**Family:** Simplifying method calls

## Trigger

A parameter — usually a boolean or an enum — that selects entirely different behaviour.

## Mechanics

Split into one method per behaviour, each named for what it does.

## Caution

Only when the set is small and fixed. With many cases this multiplies the surface; [Strategy](../patterns/strategy.md) is the better answer there.
