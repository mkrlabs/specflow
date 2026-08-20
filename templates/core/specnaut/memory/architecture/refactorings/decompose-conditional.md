> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Decompose Conditional

**Family:** Simplifying conditional expressions

## Trigger

A complicated conditional whose test and branches are all hard to read.

## Mechanics

[Extract Method](extract-method.md) the condition and each branch, naming each for its meaning.

## Caution

The names must say *why*, not restate the boolean. This is often the smallest fix that removes a conditional smell — try it before reaching for a pattern.
