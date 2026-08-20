> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Form Template Method

**Family:** Dealing with generalization

## Trigger

Sibling methods with the same sequence of steps and different details.

## Mechanics

Extract each step, align the sequences, and pull the sequence up — see [Template Method](../patterns/template-method.md).

## Caution

It locks the *order*. If a subtype needs a different order, this is the wrong axis and composition fits better.
