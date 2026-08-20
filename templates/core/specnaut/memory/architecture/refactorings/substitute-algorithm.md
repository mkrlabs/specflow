> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Substitute Algorithm

**Family:** Composing methods

## Trigger

An algorithm that a clearer or better one can replace outright.

## Mechanics

Get the existing behaviour under test first, then swap the body and run them.

## Caution

Without tests this is a rewrite, not a refactoring. Confirm the old behaviour is *specified* somewhere before replacing it — edge cases are the part that is not obvious.
