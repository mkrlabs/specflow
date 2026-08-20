> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Extract Interface

**Family:** Dealing with generalization

## Trigger

Several clients using the same subset of a type's members, or a dependency that must be inverted for testing or for a [Layer Violation](../smells/layer-violation.md).

## Mechanics

Declare the subset as an interface, in the layer that *needs* it, and depend on that.

## Caution

The interface belongs to the consumer, not the implementer — declaring it beside the implementation leaves the dependency pointing the same way it did before.
