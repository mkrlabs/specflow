> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Replace Type Code with State/Strategy

**Family:** Organizing data

## Trigger

A behaviour-determining type code that *can* change during an object's life.

## Mechanics

Extract the varying behaviour into [State](../patterns/state.md) or [Strategy](../patterns/strategy.md) objects and delegate.

## Caution

Distinguish the two: [State](../patterns/state.md) objects know their successors; [Strategy](../patterns/strategy.md) objects are chosen from outside and do not.
