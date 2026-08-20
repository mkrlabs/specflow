> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Extract Method

**Family:** Composing methods

## Trigger

A fragment that can be grouped and named — most reliably, one a comment already names.

## Mechanics

Move the fragment into a new function named for *what it achieves*, not how. Pass what it reads; return what it produces. If it needs many locals, the group of locals is probably a concept — see [Introduce Parameter Object](introduce-parameter-object.md).

## Caution

A name describing the implementation (`loopAndSum`) buys nothing. If you cannot name it, the fragment is not a unit — find a different seam.
