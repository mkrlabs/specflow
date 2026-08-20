> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Replace Inheritance with Delegation

**Family:** Dealing with generalization

## Trigger

[Refused Bequest](../smells/refused-bequest.md): a subtype that wants some behaviour but not the contract.

## Mechanics

Hold an instance instead of extending it, and expose only what is genuinely offered.

## Caution

You lose substitutability where callers relied on it. Check the call sites that hold the supertype first.
