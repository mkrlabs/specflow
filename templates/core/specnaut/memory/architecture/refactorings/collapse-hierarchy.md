> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Collapse Hierarchy

**Family:** Dealing with generalization

## Trigger

A supertype and subtype that no longer differ meaningfully — often after [Push Down](push-down-method.md) emptied one.

## Mechanics

Merge them into one type.

## Caution

Check for external subtypes or code that switches on the concrete type before collapsing.
