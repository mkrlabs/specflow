> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Duplicate Observed Data

**Family:** Organizing data

## Trigger

Domain data living inside a presentation component, so it cannot be used or tested without the UI.

## Mechanics

Move the data to a domain object and let the view observe it — see [Observer](../patterns/observer.md).

## Caution

Two copies of state need a synchronisation rule. Say which side wins, or you have created a drift you cannot debug.
