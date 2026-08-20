> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Pull Up Constructor Body

**Family:** Dealing with generalization

## Trigger

Subtype constructors starting with the same initialisation.

## Mechanics

Move the shared part to the supertype constructor and call it.

## Caution

Initialisation order across a hierarchy is subtle; a supertype constructor calling an overridable method sees a half-built subtype.
