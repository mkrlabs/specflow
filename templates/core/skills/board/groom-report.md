# Groom report — the output contract

Loaded by the board skill's `groom` pass at its end. Split out of `groom.md`
under #562: the pass and the shape of its report change for different reasons,
and the report is a contract worth reading on its own.

End with a single summary block. **The per-ticket lines and the
size/priority-missing escalation block are mandatory contract output,
not optional** — they are how the user verifies the sizing + priority
contract was honoured.

Per-ticket lines should note when a value was persisted as a label
fallback rather than a native field — typically because the project
has no `Priority` / `Size` field, or because `priority:P3` does not
match a 3-level field. This makes the field-vs-label routing visible
in the report.

```
specnaut-groom report
─────────────────────
⚠  groom completed with <K> un-sized/un-prioritised tickets — re-run or fix manually
    (only emitted when K > 0, at the very top of the summary)

Backlog:    <N> items reviewed, <P> promoted to Ready, <C> awaiting clarification
            <R> body rewrites, <S> sized, <Z> prioritised

Per-ticket:
  ↳ <backlog-reference> → promoted/comment/closure-recommended
       size=<X> + priority=<P> (field)
  ↳ <backlog-reference> → comment
       size=<X> (field) + priority=P3 (label fallback — no native option)
  ↳ ...

⚠ size / priority missing:
  ↳ <backlog-reference> — <reason: e.g. gh label create failed (rate-limited)>
  ↳ ...
  (omit this whole section when K == 0)

⚠ Roadmap dates missing (GitHub backend, soft):
  ↳ <backlog-reference> — Ready since <date>, no target date set
  ↳ <backlog-reference> — In progress, no start date set
  ↳ ...
  (omit this whole section when TARGETDATE_FIELD_ID / STARTDATE_FIELD_ID from
   detect-fields.sh is empty — the board has no such field, so nothing is
   missing — and when the fields exist but no dates are missing)

Stale PRs:  <S> open PRs idle > 48h
Orphan specs: <O> spec directories missing the next artefact

Next action: <one-line recommendation, or "no action needed">
```

If nothing needed action, say so explicitly. The point of the skill is
to be a **no-op when the project is healthy**.

