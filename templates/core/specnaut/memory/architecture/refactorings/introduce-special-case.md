> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Introduce Special Case

**Family:** Organizing data

## Trigger

Repeated checks for a missing or exceptional value, each caller inventing its own default.

## Mechanics

Create an object representing the special case that answers the same interface with sensible behaviour.

## Caution

It must be a *legitimate* case, not a failure. Using it to swallow an error is [Silent Catch](../smells/silent-catch.md) with a nicer name.
