> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Remove Assignments to Parameters

**Family:** Composing methods

## Trigger

A parameter reassigned inside the body, so its name no longer means what the caller passed.

## Mechanics

Introduce a local for the changing value and leave the parameter untouched.

## Caution

In languages with reference semantics, distinguish reassigning the parameter from mutating what it points at — they are different problems.
