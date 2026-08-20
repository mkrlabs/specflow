> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Rename Method

**Family:** Simplifying method calls

## Trigger

A name that does not say what the method does — or that says what it no longer does.

## Mechanics

Rename it and every call. Where callers are outside your control, keep the old name delegating and mark it for removal.

## Caution

The cheapest fix in this catalogue and the most under-used. A wrong name misleads every future reader; a rename costs one mechanical change.
