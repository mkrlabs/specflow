> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Extract Superclass

**Family:** Dealing with generalization

## Trigger

Two types with similar features and no shared ancestor.

## Mechanics

Create a supertype and pull the shared parts up.

## Caution

Shared *shape* is not shared *meaning*. Inheriting for code reuse alone couples two things that may have no reason to change together — prefer [Extract Class](extract-class.md) and delegation.
