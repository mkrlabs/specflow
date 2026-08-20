> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Extract Subclass

**Family:** Dealing with generalization

## Trigger

Features used only by some instances, usually with a [Temporary Field](../smells/temporary-field.md) marking which.

## Mechanics

Create a subtype for the variant and move those features into it.

## Caution

Only when the variation is fixed for an instance's lifetime. Otherwise composition — [Strategy](../patterns/strategy.md) — handles it without a type per combination.
