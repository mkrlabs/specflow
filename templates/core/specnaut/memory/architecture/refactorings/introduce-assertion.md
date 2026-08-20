> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Introduce Assertion

**Family:** Simplifying conditional expressions

## Trigger

An assumption the code depends on, stated only in a comment or not at all.

## Mechanics

Assert it where it must hold — an assertion is a comment the runtime checks.

## Caution

Assertions state what should be *impossible*. Using one for input that can legitimately be wrong turns a user error into a crash; validate those instead.
