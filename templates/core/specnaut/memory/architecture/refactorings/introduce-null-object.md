> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Introduce Null Object

**Family:** Simplifying method calls

## Trigger

Repeated null checks around one absent value, each caller inventing its own default.

## Mechanics

Substitute an object with neutral behaviour satisfying the same interface. See [Introduce Special Case](introduce-special-case.md), of which this is the classic instance.

## Caution

The neutral behaviour must be *correct*, not merely quiet. A null object that silently does nothing where an error mattered is [Silent Catch](../smells/silent-catch.md).
