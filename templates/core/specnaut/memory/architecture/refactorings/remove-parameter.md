> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Remove Parameter

**Family:** Simplifying method calls

## Trigger

A parameter the body no longer uses, or that every caller passes the same value for.

## Mechanics

Remove it and update call sites.

## Caution

In an overload set, removing a parameter can silently change which overload resolves. Check that the call sites still bind where you expect.
