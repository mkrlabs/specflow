# ARIA and custom widgets

> **Surface** — roles, states and properties added by hand, and the composite
> widgets built out of them: tabs, menus, comboboxes, trees, dialogs,
> accordions. ARIA changes what assistive technology reports without changing
> what the browser does, which is why it is the only part of accessibility
> where adding code routinely makes things worse.
>
> **WCAG 2.1** — 4.1.2 Name, Role, Value (A) · 1.3.1 Info and Relationships
> (A) · 2.1.1 Keyboard (A)

## The rule that decides most findings here

**No ARIA is better than bad ARIA.** A `<div role="button">` with no keyboard
handling is worse than a bare `<div>`, because it promises a button and
delivers nothing. Before reporting *missing* ARIA, check whether the right
answer is a native element instead.

## Where to look

- Every `role=`, `aria-*` attribute.
- Hand-built tabs, menus, dropdowns, comboboxes, accordions, dialogs.
- `aria-labelledby` / `aria-describedby` targets.
- `aria-hidden` on anything that contains a focusable element.
- Design-system primitives that spread props onto an element.

**Search signatures.** `role="`, `aria-hidden="true"`, `aria-expanded`,
`aria-controls`, `aria-labelledby`, `aria-selected`, `aria-current`,
`role="presentation"`, `role="none"`.

## Failure modes

### An invented or misspelled role

`role="dropdown"`, `role="tab-panel"`, `role="link "`. Not in the
specification, so it is ignored and the element falls back to its native
role — usually `generic`.

*Confirm* — check the value against the ARIA role list. This is fully
decidable from source.

*Severity* — HIGH. *Criterion* — 4.1.2.

### A role with no state management

`role="tab"` without `aria-selected`, `role="checkbox"` without
`aria-checked`, `aria-expanded` that never changes. The role promises a state
the widget never reports.

*Confirm* — grep for the state attribute being *set*, not merely present in
the initial markup.

*Severity* — HIGH. *Criterion* — 4.1.2.

### A dangling reference

`aria-labelledby="x"` or `aria-controls="y"` pointing at an `id` that does
not exist, or that exists in another document fragment.

*Confirm* — greppable within a component. Across components, say so.

*Severity* — HIGH when it is the only naming route, MEDIUM otherwise.
*Criterion* — 4.1.2.

### `aria-hidden` over focusable content

`aria-hidden="true"` on a container that still contains a focusable element.
Keyboard focus lands on something the accessibility tree says is not there.

*Severity* — HIGH. *Criterion* — 4.1.2.

### `role="presentation"` on something that matters

Stripping semantics from an interactive element or from content that carries
meaning.

*Severity* — HIGH. *Criterion* — 1.3.1.

### A composite widget without its keyboard model

Tabs that do not respond to arrow keys, a menu that does not close on Escape,
a combobox with no `aria-activedescendant` or roving focus. The role announces
a widget the user cannot drive.

*Severity* — HIGH. *Criterion* — 2.1.1, 4.1.2.

## When it is NOT a finding

- **Redundant ARIA on a native element is not a defect.** `<button
  role="button">`, `<nav role="navigation">`, `<input type="checkbox"
  aria-checked>` are all noise, and none of them break anything. LOW cleanup
  at the very most — and on a busy report, leave them out entirely.
- **Absence of ARIA is usually correct.** Well-formed HTML needs almost none.
  "This component has no ARIA" is not a finding; "this component's role is
  wrong" is.
- **`aria-hidden="true"` on a decorative icon is the correct pattern**, not a
  hidden-content violation. It is only a defect when what it hides is
  focusable or informative.
- **`role="presentation"` on a genuinely presentational wrapper is correct** —
  a layout table, a `<ul>` used purely for spacing.
- **You cannot confirm state management from static markup alone.** Whether
  `aria-expanded` is updated on toggle is a runtime fact. If the handler is
  not in the files you were given, say that rather than asserting it is
  missing.
- **A library's widget usually implements its own keyboard model.** Read it
  before reporting the consumer.
- **`aria-label` overriding visible text is a real issue — but a specific
  one.** It matters when the two disagree, because voice users say what they
  see. Identical or extended text is fine.

## Accessible patterns

```html
<!-- Prefer the element that already has the semantics -->
<button aria-expanded="false" aria-controls="panel-1">Details</button>
<div id="panel-1" hidden>…</div>

<!-- A dialog names itself through content that exists -->
<div role="dialog" aria-modal="true" aria-labelledby="dlg-title">
  <h2 id="dlg-title">Confirm deletion</h2>
</div>

<!-- Hide decoration, never a focusable thing -->
<svg aria-hidden="true" focusable="false"><!-- … --></svg>
```

## Review checklist

- [ ] Every `role` value exists in the ARIA specification
- [ ] Every role that implies state has that state, and it is updated
- [ ] Every `aria-labelledby` / `aria-describedby` / `aria-controls` target
      exists
- [ ] No `aria-hidden` container holds a focusable element
- [ ] `role="presentation"` is only on presentational things
- [ ] Composite widgets implement their expected keyboard model
- [ ] Nothing adds ARIA that a native element would have supplied
