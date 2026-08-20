> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Replace Conditional with Polymorphism

**Family:** Simplifying conditional expressions

## Trigger

[Switch Statements](../smells/switch-statements.md) on a type, especially the same switch in more than one place.

## Mechanics

Move each branch into an override on a type per case, and let dispatch replace the switch.

## Caution

One switch at a boundary is where polymorphism is *created* and must remain. Also weigh the cost: a type per case is heavier than a named conditional when there are two cases.
