> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Inline Class

**Family:** Moving features between objects

## Trigger

A [Lazy Class](../smells/lazy-class.md) that no longer earns its own file.

## Mechanics

Move its members back into its only caller and delete it.

## Caution

Do not inline a boundary type whose value is the interface it presents — a one-method port is thin on purpose.
