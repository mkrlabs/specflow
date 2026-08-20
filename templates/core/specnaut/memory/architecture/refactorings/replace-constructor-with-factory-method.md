> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Replace Constructor with Factory Method

**Family:** Simplifying method calls

## Trigger

Construction that needs a name, or that must choose between representations.

## Mechanics

Add a named static creator and make the constructor private.

## Caution

Adds indirection. Worth it when construction has meaning worth naming, or when it is the seam that lets a dependency be injected — not by default.
