> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Self-Encapsulate Field

**Family:** Organizing data

## Trigger

A type reads its own field directly, and a subtype needs to compute it instead.

## Mechanics

Route internal reads through an accessor so subtypes can override it.

## Caution

Pure ceremony where no subtype exists — accessors on every field make code longer without making it safer.
