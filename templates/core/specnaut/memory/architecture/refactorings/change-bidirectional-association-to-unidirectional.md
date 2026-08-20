> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Change Bidirectional Association to Unidirectional

**Family:** Organizing data

## Trigger

A two-way link where one direction is unused — often behind [Inappropriate Intimacy](../smells/inappropriate-intimacy.md).

## Mechanics

Remove the unused direction and let callers navigate the remaining way.

## Caution

Confirm the direction really is unused, including through serialisation and reflection, before removing it.
