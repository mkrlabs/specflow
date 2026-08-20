> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Remove Middle Man

**Family:** Moving features between objects

## Trigger

A type that mostly delegates — the over-application of [Hide Delegate](hide-delegate.md).

## Mechanics

Let callers talk to the real object and delete the pass-throughs.

## Caution

Do not remove a deliberate [Facade](../patterns/facade.md) or [Adapter](../patterns/adapter.md). Ask what the hop *constrains* before deleting it.
