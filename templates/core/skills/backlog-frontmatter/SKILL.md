---
name: backlog-frontmatter
description: The canonical task-file frontmatter schema for the local Markdown backlog backend — every field, its allowed values, and which are mandatory. Preloaded, not user-invocable.
user-invocable: false
---

# backlog-frontmatter

Preloaded by `product-owner`, which owns this schema. Split out of that agent
under #562: the seat had 76 characters of room and no duplication left to
reclaim, and a field schema is a reference worth reading on its own rather than
a passage inside a role description.

**Nothing was cut in the move.**

```yaml
---
id: NNN                # zero-padded 3 digits, globally unique within this project
title: string
category: string       # free-form, but consistent across tasks
priority: critical | high | medium | low
complexity: 1 | 2 | 3 | 5 | 8 | 13 | 21   # Fibonacci
status: todo | in_progress | done | deferred | blocked
parent: "#NNN" | null  # local task id of the parent epic, if this is a sub-task
depends_on: [string]   # other task titles or ids
spec: string | null    # Specnaut spec id if attached
tags: [string]
created: YYYY-MM-DD
---
```

`parent: "#NNN"` is the local-Markdown sub-task convention (grep-friendly);
missing or `null` means a top-level task or an epic, legacy tasks included.
