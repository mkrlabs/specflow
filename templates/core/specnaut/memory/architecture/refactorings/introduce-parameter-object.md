> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Introduce Parameter Object

**Family:** Simplifying method calls

## Trigger

[Long Parameter List](../smells/long-parameter-list.md), or a [Data Clump](../smells/data-clumps.md) travelling together.

## Mechanics

Create a type for the group, and move any validation that was repeated at call sites into it.

## Caution

Name it for the concept, not the call. A type called `Options` that collects unrelated values is a bag, and the next change adds a field to it.
