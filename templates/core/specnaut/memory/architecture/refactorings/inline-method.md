> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Inline Method

**Family:** Composing methods

## Trigger

A method whose body is as clear as its name, adding a hop and nothing else.

## Mechanics

Replace every call with the body, then delete the method.

## Caution

Do not inline something polymorphic, or anything outside your control — callers you cannot see depend on it.
