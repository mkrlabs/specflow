> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Move Field

**Family:** Moving features between objects

## Trigger

A field used more by another type than its own, or one that belongs with data elsewhere.

## Mechanics

Move it, then update accessors. Usually paired with [Move Method](move-method.md).

## Caution

Moving a field across a boundary can change ownership and lifetime. Check who is allowed to mutate it before moving it.
