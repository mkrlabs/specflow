> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Separate Query from Modifier

**Family:** Simplifying method calls

## Trigger

A method that both returns a value and changes state, so callers cannot ask without causing.

## Mechanics

Split it into a query with no side effects and a separate command.

## Caution

Some operations are atomic by necessity — a pop, a compare-and-swap. Splitting those introduces a race that did not exist.
