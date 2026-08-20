> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Encapsulate Collection

**Family:** Organizing data

## Trigger

A method returns a mutable collection, letting callers change internal state behind the owner's back.

## Mechanics

Return a read-only view or a copy, and add explicit add/remove operations that can enforce invariants.

## Caution

Copying a large collection on every read is a cost — prefer an immutable view where the language offers one.
