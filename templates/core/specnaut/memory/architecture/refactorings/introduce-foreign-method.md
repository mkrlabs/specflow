> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Introduce Foreign Method

**Family:** Moving features between objects

## Trigger

You need a method on a type you cannot modify, and you need it in one or two places.

## Mechanics

Write it as a function taking that type as its first argument, and mark clearly that it belongs elsewhere.

## Caution

A stopgap. Once several accumulate, promote them with [Introduce Local Extension](introduce-local-extension.md).
