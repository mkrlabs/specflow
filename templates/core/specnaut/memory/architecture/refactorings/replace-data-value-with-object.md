> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Replace Data Value with Object

**Family:** Organizing data

## Trigger

[Primitive Obsession](../smells/primitive-obsession.md): a primitive carrying a domain concept with a rule attached.

## Mechanics

Introduce a type for the concept, move the validation into its construction, and use it in signatures.

## Caution

Only where a rule exists. Wrapping a value with no invariant is [Speculative Generality](../smells/speculative-generality.md). Keep primitives at the wire boundary.
