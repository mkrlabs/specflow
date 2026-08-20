> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Remove Setting Method

**Family:** Simplifying method calls

## Trigger

A field that should be set once at construction but has a public setter.

## Mechanics

Remove the setter and set the value in the constructor.

## Caution

Frameworks that construct objects reflectively may need the setter. Confirm nothing outside your code path depends on it.
