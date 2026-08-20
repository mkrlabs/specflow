# Triage — what counts, and what source cannot tell you

Read this before anything else. It sets the scope of the review, the gate a
finding has to pass, the severity rubric, and the finding format.

## Scope

**WCAG 2.1, Level A and AA.** Level AAA criteria are out of scope: they are
not the conformance target of the vast majority of projects, and reporting
them as failures makes the report unactionable. If a AAA criterion is worth
mentioning, mention it in `Out of scope`, never as a finding.

Accessibility is not a property of source code. It is a property of what a
person encounters — rendered, focused, announced, magnified. You are reading
source. That gap is the single largest source of wrong accessibility findings,
and the whole of this catalogue is built around it.

## The gate — three questions before any finding

**1. Can this be established from source at all?**

Some criteria are decidable from source (an `<img>` has an `alt` attribute or
it does not). Some are decidable only at runtime. If it is the second kind,
you are not making a finding — you are naming something to verify.

Not decidable from source alone:

| Looks decidable | Why it is not |
| :--- | :--- |
| Colour contrast through design tokens | The token's value depends on theme, cascade, and inherited state. |
| Focus order | The DOM order at runtime, after portals and conditional rendering, is not the source order. |
| What a screen reader announces | The accessibility tree is computed; it is not the markup. |
| Reflow at 320px | Depends on the whole cascade at that width. |
| Whether an image is decorative | Depends on what the image *means* in context, which is an editorial fact. |

**2. Is the accessible outcome actually broken, or merely spelled unusually?**

Native HTML carries semantics you can neither see in a diff nor improve by
adding ARIA. `<button>` already has `role="button"`, keyboard activation, and
focusability. A great deal of correct markup looks bare because it *is* using
the platform.

**3. Who is blocked, and how badly?**

Name the user and the failure. "Fails 1.1.1" is not a finding. "A screen
reader user hears the filename instead of the product name" is a finding that
happens to be 1.1.1.

## Severity rubric

- **CRITICAL** — a user of an assistive technology or the keyboard alone
  cannot complete the task at all. A keyboard trap, a control unreachable
  without a mouse, a form that cannot be submitted.
- **HIGH** — the task is completable but the experience is materially
  degraded or the information is unavailable. An unlabelled control, an
  informative image with no text alternative, focus lost after a dialog
  closes.
- **MEDIUM** — real, confirmed, but the user can recover. A heading skip, a
  missing skip link, a redundant announcement.
- **LOW** — correct but improvable, or a confirmed defect on a surface almost
  nobody reaches. Also the ceiling for anything you could not fully establish
  from source.
- **INFO** — worth the reader's attention, not a defect.

**A finding you could not establish from source is capped at LOW** and must
say what would settle it. This is not hedging: it is the difference between a
report a team can act on and one it learns to skim.

## Finding format

```
FINDING <severity>: <one-line summary — the user and the failure>
  Path: <file:line>
  Criterion: <e.g. 1.3.1 Info and Relationships (A)>
  Source: <which catalogue file you relied on>
  Rationale: <2-3 sentences — what breaks, for whom>
  Suggested fix: <sketch or pointer>
```

Cite the criterion by **number and name**, not by number alone. A reader who
does not have the numbering memorised — which is most readers — otherwise
cannot tell what you are claiming without a second tab.

## Normative source

The criteria are defined at <https://www.w3.org/TR/WCAG21/>. That document is
the authority; the prose in this catalogue is not. Where this catalogue and
the specification disagree, the specification wins and this catalogue is a
bug.
