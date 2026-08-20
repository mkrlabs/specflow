# Keyboard and focus

> **Surface** — everything reachable without a pointer, and the visible
> indication of where you are. This is the highest-stakes area in the
> catalogue: a keyboard failure does not degrade the experience, it ends it.
> It breaks for screen-reader users, switch and voice users, people with
> tremor or RSI, and anyone whose trackpad died.
>
> **WCAG 2.1** — 2.1.1 Keyboard (A) · 2.1.2 No Keyboard Trap (A) ·
> 2.1.4 Character Key Shortcuts (A) · 2.4.3 Focus Order (A) ·
> 2.4.7 Focus Visible (AA) · 3.2.1 On Focus (A)

## Where to look

- Any element with a click handler that is not a `<button>` or `<a href>`.
- Modals, drawers, menus, comboboxes, tooltips, carousels — anything that
  opens, closes, or traps.
- CSS touching `outline`, `:focus`, `:focus-visible`.
- `tabindex` anywhere.
- Global key listeners.
- Custom scroll containers and virtualised lists.

**Search signatures.** `outline: none`, `outline: 0`, `outline:none`;
`tabindex="1"` or higher; `onClick` on `div` / `span` / `li`;
`addEventListener("keydown"` at document level; `.focus()`;
`onMouseOver` with no focus equivalent.

## Failure modes

### A control unreachable by keyboard

A click handler on a non-focusable element with no `tabIndex`. It cannot be
reached at all.

*Confirm* — no `tabIndex`, no native focusability, no `href`. All three
absent is unambiguous from source.

*Severity* — CRITICAL when it is on the task path, HIGH otherwise.
*Criterion* — 2.1.1.

### Focusable but not operable

`tabIndex={0}` and a click handler, but no `onKeyDown`. It receives focus and
then does nothing when activated. Worse than unreachable, because the user
cannot tell it is broken.

*Severity* — HIGH. *Criterion* — 2.1.1.

### The focus indicator removed

`outline: none` with no `:focus-visible` replacement. Sighted keyboard users
lose all sense of position. This is one of the few defects that is both
extremely common and fully decidable from source.

*Confirm* — look for a replacement anywhere in the cascade: a custom
`box-shadow`, a border, an `:focus-visible` rule. Absence of the replacement
is the finding, not the presence of `outline: none`.

*Severity* — HIGH. *Criterion* — 2.4.7.

### A keyboard trap

Focus enters a region and cannot leave — a modal that loops focus with no
Escape handler, an embedded editor that swallows Tab.

*Severity* — CRITICAL. *Criterion* — 2.1.2.

### Focus lost after a dialog closes

Focus returns to `<body>`, so the next Tab starts from the top of the
document. The user's place is gone.

*Confirm* — look for the opener being stored and restored. Its absence beside
a dialog implementation is a strong source-level signal.

*Severity* — HIGH. *Criterion* — 2.4.3.

### Positive `tabindex`

`tabindex="2"` and up. Creates a tab order that follows neither the DOM nor
the layout, and it applies across the whole page, not just the component.

*Severity* — MEDIUM. *Criterion* — 2.4.3.

### Single-character shortcuts with no escape

A global listener binding a bare letter. Voice-input users trigger these by
speaking.

*Confirm* — the criterion is satisfied by any one of: the shortcut can be
turned off, it can be remapped, or it is active only while a component has
focus.

*Severity* — MEDIUM. *Criterion* — 2.1.4.

### Focus causing an unexpected change of context

Focusing a control navigates, submits, or opens something. The user cannot
explore without committing.

*Severity* — HIGH. *Criterion* — 3.2.1.

## When it is NOT a finding

- **`outline: none` with a replacement is correct.** Removing the browser
  outline in favour of a designed, sufficiently visible indicator is a normal
  and good practice. The defect is the *absence* of a replacement — check the
  whole stylesheet before flagging.
- **`tabindex="-1"` is not positive tabindex.** It removes an element from the
  tab order while keeping it programmatically focusable, which is how a dialog
  or a skip target is supposed to work. It is a tool, not a smell.
- **`tabindex="0"` on a native interactive element is redundant, not broken.**
- **Native elements need no keyboard handler.** `<button onClick>` responds to
  Enter and Space already. `<a href onClick>` responds to Enter. Asking for an
  explicit `onKeyDown` on either is a false positive.
- **Focus order cannot be established from source** when portals, conditional
  rendering, or CSS reordering are involved. Name the risk; do not assert the
  failure.
- **A focus trap inside an open modal is the correct behaviour.** The defect
  is a trap with no exit — no Escape, no close control. Do not report
  intentional containment as 2.1.2.
- **A library component may already handle keyboard interaction.** Read the
  component before attributing the gap to the call site.
- **`onMouseOver` without `onFocus` is only a finding if it reveals content.**
  A purely cosmetic hover is not a conformance failure.

## Accessible patterns

```css
/* Remove the default, but never the affordance */
:focus-visible {
  outline: 3px solid #1a73e8;
  outline-offset: 2px;
}
```

```js
// A dialog returns focus to whatever opened it
function openDialog(dialog) {
  const opener = document.activeElement;
  dialog.showModal();
  dialog.addEventListener("close", () => opener?.focus(), { once: true });
}
```

```html
<!-- The skip link is the first focusable thing on the page -->
<a class="skip-link" href="#main">Skip to main content</a>
<main id="main" tabindex="-1">…</main>
```

## Review checklist

- [ ] Every interactive element is reachable by Tab
- [ ] Every reachable element is operable by Enter or Space
- [ ] A visible focus indicator survives `outline: none`
- [ ] Dialogs can be closed with Escape and restore focus to the opener
- [ ] No `tabindex` greater than zero
- [ ] Single-key shortcuts can be disabled, remapped, or are focus-scoped
- [ ] Focus alone never navigates or submits
