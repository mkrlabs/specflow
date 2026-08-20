> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Parameterize Method

**Family:** Simplifying method calls

## Trigger

Several methods doing the same thing with different constant values.

## Mechanics

Merge them into one taking the value as a parameter.

## Caution

If the bodies differ in more than a value, the merged method needs a flag — and a flag parameter is [Replace Parameter with Explicit Methods](replace-parameter-with-explicit-methods.md) run backwards.
