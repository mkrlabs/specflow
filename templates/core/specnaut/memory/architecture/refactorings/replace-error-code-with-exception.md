> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Replace Error Code with Exception

**Family:** Simplifying method calls

## Trigger

A method returning a sentinel that callers can, and do, ignore.

## Mechanics

Throw instead, so the failure cannot be dropped silently.

## Caution

Only for genuinely exceptional cases. Using exceptions for expected outcomes makes ordinary control flow expensive and hard to follow — the inverse technique is [Replace Exception with Test](replace-exception-with-test.md).
