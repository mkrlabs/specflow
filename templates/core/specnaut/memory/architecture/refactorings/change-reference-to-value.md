> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Change Reference to Value

**Family:** Organizing data

## Trigger

A shared object that is small, immutable, and compared by content.

## Mechanics

Make it a value type with equality by content, and stop sharing instances.

## Caution

Requires immutability. Doing this to something still mutated produces defects that appear far from the change.
