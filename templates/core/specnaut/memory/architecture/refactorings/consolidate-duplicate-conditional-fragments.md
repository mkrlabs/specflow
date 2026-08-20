> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Consolidate Duplicate Conditional Fragments

**Family:** Simplifying conditional expressions

## Trigger

The same code appearing in every branch of a conditional.

## Mechanics

Move it outside the conditional, before or after as its position demands.

## Caution

Confirm the fragment truly is identical and order-independent; a subtle difference between branches is easy to miss.
