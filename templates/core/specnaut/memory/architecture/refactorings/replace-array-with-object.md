> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Replace Array with Object

**Family:** Organizing data

## Trigger

An array whose positions mean different things — index 0 is the name, index 1 the count.

## Mechanics

Replace it with a type whose fields are named.

## Caution

Homogeneous collections are not this smell; the trigger is *positional meaning*.
