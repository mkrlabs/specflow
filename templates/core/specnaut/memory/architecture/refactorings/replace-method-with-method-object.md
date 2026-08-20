> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Replace Method with Method Object

**Family:** Composing methods

## Trigger

A long method whose locals are so entangled that [Extract Method](extract-method.md) cannot get a grip.

## Mechanics

Turn the method into a class whose fields are its locals. Extract freely now that the locals are fields, then reassemble.

## Caution

An intermediate step, not a destination. Stopping here leaves an object that is a method wearing a type.
