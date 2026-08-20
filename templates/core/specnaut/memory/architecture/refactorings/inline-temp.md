> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Inline Temp

**Family:** Composing methods

## Trigger

A variable assigned once from a simple expression and used once.

## Mechanics

Replace the reference with the expression and remove the variable.

## Caution

If the expression has side effects or is expensive and used more than once, inlining changes behaviour or cost.
