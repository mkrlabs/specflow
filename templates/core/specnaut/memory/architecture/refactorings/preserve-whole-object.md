> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Preserve Whole Object

**Family:** Simplifying method calls

## Trigger

A caller pulling several values out of one object only to pass them all separately.

## Mechanics

Pass the object.

## Caution

This couples the callee to the whole type. If it needs two fields of a large object, passing the object may be the larger coupling — judge which dependency is worse.
