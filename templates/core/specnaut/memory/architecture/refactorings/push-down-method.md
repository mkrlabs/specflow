> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Push Down Method

**Family:** Dealing with generalization

## Trigger

A supertype method only one subtype uses — a partial [Refused Bequest](../smells/refused-bequest.md).

## Mechanics

Move it down to the subtype that needs it.

## Caution

Confirm no external caller relies on reaching it through the supertype.
