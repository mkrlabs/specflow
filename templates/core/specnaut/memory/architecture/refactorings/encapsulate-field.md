> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Encapsulate Field

**Family:** Organizing data

## Trigger

A public field, so no rule about it can be enforced.

## Mechanics

Make it private and expose only the operations callers legitimately need.

## Caution

Wrapping a field in a getter and setter that do nothing changes nothing. The value is in what you *refuse* to expose.
