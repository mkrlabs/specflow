# Dynamic updates and status messages

> **Surface** — everything that changes after the page has loaded without the
> user asking: toasts, inline validation results, search-as-you-type counts,
> loading states, optimistic UI, route changes in a single-page application.
> It breaks for screen-reader users, who are looking at one place in the
> document while the change happens somewhere else.
>
> **WCAG 2.1** — 4.1.3 Status Messages (AA) · 3.2.2 On Input (A) ·
> 2.4.3 Focus Order (A) · 3.3.1 Error Identification (A)

## The shape of the problem

A sighted user notices a toast because it appeared in their peripheral vision.
A screen-reader user notices nothing at all unless the change is announced.
Two mechanisms exist, and choosing between them is most of this surface:

- **Announce it** — a live region, for information that does not require
  action. The user's focus stays put.
- **Move focus to it** — for anything the user must act on. Disruptive by
  design, which is why it is wrong for a passive notification.

Getting this backwards is a defect in both directions: a stolen focus for a
"Saved" toast, or a silent modal that needs a decision.

## Where to look

- Toast, snackbar, alert and banner components.
- `aria-live`, `role="status"`, `role="alert"`, `aria-atomic`, `aria-busy`.
- Result counts that update as the user types.
- Loading spinners and skeletons.
- Route transitions in client-rendered applications.
- `onChange` handlers on `<select>`, radios, and checkboxes.
- Anything calling `.focus()` after an async operation.

**Search signatures.** `aria-live`, `role="alert"`, `role="status"`,
`toast`, `snackbar`, `notification`, `onChange={.*submit`,
`onChange={.*navigate`, `.focus()`, `aria-busy`.

## Failure modes

### A status message that is never announced

A toast rendered into a container with no live region. Sighted users see it;
nobody else learns it happened.

*Confirm* — look for `aria-live`, `role="status"` or `role="alert"` on the
container. Their absence around a notification component is the finding.

*Severity* — MEDIUM. *Criterion* — 4.1.3.

### The live region created at the same moment as its content

The region is inserted into the DOM already containing the message. Many
screen readers only announce changes to a region that was already present, so
nothing is spoken.

*Confirm* — a component that renders both the region and the text
conditionally, in one go, has this shape. This is the most common way a
correct-looking live region does nothing.

*Severity* — MEDIUM. *Criterion* — 4.1.3.

### `role="alert"` used for routine confirmations

`alert` is assertive: it interrupts. Using it for "Saved" interrupts whatever
the user was reading, every time.

*Severity* — LOW. *Criterion* — 4.1.3.

### An error announced only visually

Validation renders a message and nothing associates it with the field or
announces it.

*Severity* — HIGH. *Criterion* — 3.3.1, 4.1.3.

### A change of context on input

Selecting an option navigates, submits, or reloads. The user changing a value
to read it did not ask to leave.

*Confirm* — an `onChange` that navigates or submits is decidable from source.

*Severity* — HIGH. *Criterion* — 3.2.2.

### Focus lost after an async update

A list re-renders, a row is deleted, a step advances — and the focused element
no longer exists, so focus falls back to `<body>`.

*Severity* — HIGH. *Criterion* — 2.4.3.

### A route change with no announcement and no focus move

In a single-page application, the URL and content change while focus and the
virtual cursor stay where they were. The user has no idea the page changed.

*Severity* — MEDIUM. *Criterion* — 4.1.3, 2.4.3.

## When it is NOT a finding

- **Not every change needs a live region.** The criterion covers *status
  messages* — information about the outcome of an action, progress, or an
  error. Content the user explicitly navigated to is not a status message.
- **`role="status"` already implies `aria-live="polite"`.** Setting both is
  redundant, not broken.
- **You usually cannot confirm announcement from source.** Whether a region
  fires depends on insertion timing at runtime. Where the markup is right and
  the timing is unknowable, say what would settle it rather than asserting a
  failure.
- **Moving focus is correct for anything requiring action.** A dialog taking
  focus is the pattern, not a violation. Only a *passive* notification
  stealing focus is a defect.
- **A change of context is not the same as a change of content.** Filtering a
  list on input changes content and is fine. Navigating away is a change of
  context and is not.
- **Focus loss on re-render is a framework-shaped risk, not an automatic
  defect.** Many libraries preserve focus by key. Check before attributing it.
- **A loading spinner does not need `role="alert"`.** `aria-busy` on the
  region, or a polite status, is enough — an assertive interruption for every
  fetch is worse than silence.

## Accessible patterns

```html
<!-- The region exists before it has anything to say -->
<div id="toast-region" role="status" aria-live="polite" aria-atomic="true"></div>
```

```js
// Announce: the region is already in the DOM, only its text changes
function announce(message) {
  document.getElementById("toast-region").textContent = message;
}

// Act: anything needing a decision takes focus instead
function confirmDeletion(dialog) {
  const opener = document.activeElement;
  dialog.showModal();
  dialog.querySelector("h2").focus();
  dialog.addEventListener("close", () => opener?.focus(), { once: true });
}
```

```html
<!-- Changing a value must not navigate on its own -->
<label for="sort">Sort by</label>
<select id="sort" name="sort">…</select>
<button type="submit">Apply</button>
```

## Review checklist

- [ ] Status messages reach a live region that already existed
- [ ] `role="alert"` is reserved for things that justify interrupting
- [ ] Validation errors are both associated and announced
- [ ] Changing a value never navigates or submits on its own
- [ ] Focus survives re-render, deletion and step transitions
- [ ] Route changes in a single-page application are announced or take focus
- [ ] Nothing passive steals focus
