> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Replace Subclass with Fields

**Family:** Organizing data

## Trigger

Subtypes that differ only by constant values returned from methods.

## Mechanics

Collapse them into one type with fields set at construction — see [Collapse Hierarchy](collapse-hierarchy.md).

## Caution

If any subtype has real behaviour, this flattens a distinction that matters.
