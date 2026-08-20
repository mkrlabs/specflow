> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Extract Variable

**Family:** Composing methods

## Trigger

An expression too dense to read, especially a compound condition.

## Mechanics

Assign the sub-expression to a well-named variable and use the name.

## Caution

The name must state the *meaning*, not restate the syntax. `isEligible` helps; `condition1` does not.
