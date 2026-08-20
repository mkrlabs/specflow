> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Extract Class

**Family:** Moving features between objects

## Trigger

A type with two reasons to change, or a subset of fields touched only by a subset of methods.

## Mechanics

Create the new type, move the field/method partition into it, and have the original hold a reference.

## Caution

The partition must be by *responsibility*. Splitting by size produces two types that still change together — that is worse than one.
