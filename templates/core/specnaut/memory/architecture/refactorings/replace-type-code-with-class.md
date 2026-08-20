> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Replace Type Code with Class

**Family:** Organizing data

## Trigger

A type code as a bare primitive, with no validation of which values are legal.

## Mechanics

Introduce a type whose instances are the legal values.

## Caution

If behaviour varies by code, go further — [Replace Type Code with Subclasses](replace-type-code-with-subclasses.md) or [State/Strategy](replace-type-code-with-state-strategy.md).
