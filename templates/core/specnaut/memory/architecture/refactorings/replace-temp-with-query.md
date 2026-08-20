> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Replace Temp with Query

**Family:** Composing methods

## Trigger

A temporary holding the result of an expression, blocking [Extract Method](extract-method.md) because the extracted piece would need it.

## Mechanics

Turn the expression into a method and call it where the temp was read.

## Caution

Watch the cost if the query is expensive and was being reused; measure before assuming it matters, and do not add a cache reflexively.
