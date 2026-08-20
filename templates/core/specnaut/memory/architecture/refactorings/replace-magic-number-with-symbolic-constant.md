> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Replace Magic Number with Symbolic Constant

**Family:** Organizing data

## Trigger

A literal with meaning, appearing in code where its meaning is not stated.

## Mechanics

Name it as a constant, at the level where the meaning belongs.

## Caution

Naming a literal that is only itself (`0`, `1` as an increment) adds indirection for nothing. If two constants share a value coincidentally, keep them separate.
