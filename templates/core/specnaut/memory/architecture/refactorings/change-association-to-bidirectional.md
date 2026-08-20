> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Change Unidirectional Association to Bidirectional

**Family:** Organizing data

## Trigger

One side needs to navigate to the other and currently cannot.

## Mechanics

Add the back-reference, and give exactly one side ownership of keeping both ends consistent.

## Caution

Two-way links are far harder to keep correct. Prefer a query over a stored back-reference where one is possible.
