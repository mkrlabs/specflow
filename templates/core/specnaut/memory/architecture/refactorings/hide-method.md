> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Hide Method

**Family:** Simplifying method calls

## Trigger

A public method nothing outside the type calls.

## Mechanics

Reduce its visibility.

## Caution

Reflection, serialisation and test helpers can call things a grep will not find. Prove non-use the way you would for [Dead Code](../smells/dead-code.md).
