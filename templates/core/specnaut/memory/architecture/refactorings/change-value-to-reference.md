> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Change Value to Reference

**Family:** Organizing data

## Trigger

Many equal copies of an object that should be one shared, updatable thing.

## Mechanics

Introduce a way to look up the single instance by identity and hand that out.

## Caution

Introduces shared mutable state and a lifetime question. Be sure identity, not equality, is what the domain means.
