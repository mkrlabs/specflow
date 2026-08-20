> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Push Down Field

**Family:** Dealing with generalization

## Trigger

A supertype field only one subtype uses.

## Mechanics

Move it down.

## Caution

Same check as above: persistence mappings and serialisers often reference fields by the declaring type.
