> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Add Parameter

**Family:** Simplifying method calls

## Trigger

A method needs information its callers have and it does not.

## Mechanics

Add the parameter and update call sites.

## Caution

The obvious move, and often the wrong one. Ask whether the callee could obtain the value itself ([Replace Parameter with Method Call](replace-parameter-with-method-call.md)), or whether the growing list is a [Data Clump](../smells/data-clumps.md).
