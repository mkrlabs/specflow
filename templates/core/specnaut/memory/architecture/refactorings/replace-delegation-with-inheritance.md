> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Replace Delegation with Inheritance

**Family:** Dealing with generalization

## Trigger

A type delegating nearly every method of one field, with no narrowing.

## Mechanics

Inherit instead and delete the pass-throughs.

## Caution

The rarer direction, and the riskier one. It only holds if the type genuinely *is* the other and honours its whole contract — otherwise you have created [Refused Bequest](../smells/refused-bequest.md) to remove a [Middle Man](../smells/middle-man.md).
