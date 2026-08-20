> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Pull Up Method

**Family:** Dealing with generalization

## Trigger

Identical methods in sibling subtypes — [Duplicate Code](../smells/duplicate-code.md).

## Mechanics

Move one to the supertype and delete the copies.

## Caution

If bodies differ slightly, unify them first, or use [Form Template Method](form-template-method.md) instead of forcing a merge.
