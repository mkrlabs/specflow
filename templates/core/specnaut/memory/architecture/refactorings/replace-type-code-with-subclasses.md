> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Replace Type Code with Subclasses

**Family:** Organizing data

## Trigger

A type code that determines behaviour, and it never changes for an instance.

## Mechanics

Create a subtype per code and move the varying behaviour into it; the switches disappear.

## Caution

Only when the code is immutable for an instance's lifetime. If it changes, use [State/Strategy](replace-type-code-with-state-strategy.md) instead.
