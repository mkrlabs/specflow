> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Remove Control Flag

**Family:** Simplifying conditional expressions

## Trigger

A boolean used purely to break out of a loop or skip the rest of a body.

## Mechanics

Use the language's own `break`, `continue` or early `return`.

## Caution

In deeply nested loops an early exit can skip cleanup. Check what the flag was protecting before deleting it.
