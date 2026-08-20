> **Agents depend on this file.** The architect is required to open it before
> prescribing this technique. Moving or renaming it breaks that link in silence.

# Split Temporary Variable

**Family:** Composing methods

## Trigger

One variable assigned more than once for unrelated purposes — a reused scratch slot.

## Mechanics

Introduce one variable per responsibility, each named for its own meaning, each assigned once.

## Caution

Genuine accumulators and loop counters are assigned repeatedly by design; leave them alone.
