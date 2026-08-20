> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Replace Exception with Test

**Family:** Simplifying conditional expressions

## Trigger

An exception used for a condition the caller could simply check.

## Mechanics

Check the condition first and handle it as an ordinary branch.

## Caution

Only for *expected* conditions. Pre-checking a genuine failure produces a race between the check and the use, and reintroduces the failure you removed.
