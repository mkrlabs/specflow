> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Hide Delegate

**Family:** Moving features between objects

## Trigger

[Message Chains](../smells/message-chains.md): a caller navigating through one object to reach another.

## Mechanics

Add a method on the first object that answers the caller's actual question, and hide the path.

## Caution

Applied indiscriminately this produces [Middle Man](../smells/middle-man.md). Add the method callers need, not one per delegate method.
