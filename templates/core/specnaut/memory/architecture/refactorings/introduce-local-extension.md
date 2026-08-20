> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Introduce Local Extension

**Family:** Moving features between objects

## Trigger

Several foreign methods have accumulated around a type you do not own.

## Mechanics

Create a subtype or wrapper that owns them, and use it where you control construction.

## Caution

A wrapper you cannot construct everywhere leaves two representations in circulation — decide which one crosses your boundaries.
