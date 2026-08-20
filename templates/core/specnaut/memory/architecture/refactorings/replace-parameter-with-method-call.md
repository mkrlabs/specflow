> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Replace Parameter with Method Call

**Family:** Simplifying method calls

## Trigger

A parameter whose value the callee could obtain itself.

## Mechanics

Remove it and let the callee ask.

## Caution

Only if the callee can reach it *without* new coupling. Trading a parameter for a dependency on a global is [Implicit Global](../smells/implicit-global.md).
