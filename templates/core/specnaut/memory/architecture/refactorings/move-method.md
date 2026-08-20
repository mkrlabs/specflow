> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Move Method

**Family:** Moving features between objects

## Trigger

A method used more by another type than its own — [Feature Envy](../smells/feature-envy.md).

## Mechanics

Move it to the type it envies; leave a delegating call behind if callers need time to migrate, then remove it.

## Caution

If only part of the body is envious, [Extract Method](extract-method.md) first and move the extracted part.
