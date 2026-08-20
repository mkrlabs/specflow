# Forms, labels and errors

> **Surface** — every control a user has to fill in, and everything the
> interface says back to them: labels, hints, required markers, validation
> errors, and the relationship between them. Forms are where accessibility
> failures cost the most, because a form is usually the task itself.
>
> **WCAG 2.1** — 1.3.1 Info and Relationships (A) · 1.3.5 Identify Input
> Purpose (AA) · 2.4.6 Headings and Labels (AA) · 3.3.1 Error Identification
> (A) · 3.3.2 Labels or Instructions (A) · 3.3.3 Error Suggestion (AA) ·
> 3.3.4 Error Prevention (AA) · 4.1.2 Name, Role, Value (A)

## Where to look

- Every `<input>`, `<select>`, `<textarea>`, and custom control with a `role`
  of `combobox`, `listbox`, `checkbox`, `radio`, `switch`, or `slider`.
- Form component wrappers — the label is usually the wrapper's job.
- Validation and error rendering.
- Required-field markers.
- Login, checkout, and address forms, where autocomplete matters most.

**Search signatures.** `<input` without a nearby `<label`; `placeholder=`
with no label; `htmlFor` / `for=` mismatches; `aria-label` on a control that
has a visible label; `aria-describedby`; `aria-invalid`; `required`;
`autocomplete=`.

## Failure modes

### A control with no accessible name

No `<label for>`, not wrapped in a `<label>`, no `aria-label`, no
`aria-labelledby`. Announced as "edit text, blank".

*Confirm* — trace all four naming routes before flagging. A wrapping
`<label>` is easy to miss in JSX.

*Severity* — HIGH. *Criterion* — 4.1.2, 3.3.2.

### A placeholder used as the label

`placeholder="Email"` with no label. The name disappears as soon as the user
types, it is often too low-contrast to read, and support is inconsistent.

*Severity* — HIGH. *Criterion* — 3.3.2.

### `for` pointing at nothing

`<label for="email">` with no element whose `id` is `email` — a rename that
touched one side. Silently no label at all.

*Confirm* — greppable when both sides are in the same file, which is the
usual case.

*Severity* — HIGH. *Criterion* — 1.3.1.

### An error shown only in colour or only visually

The field turns red; nothing is announced and nothing is associated. A
screen-reader user learns the form failed but not which field or why.

*Confirm* — look for `aria-invalid` on the control and `aria-describedby`
pointing at the message.

*Severity* — HIGH. *Criterion* — 3.3.1.

### An error message that does not say how to fix it

"Invalid input." Correct and useless. Where a fix is known — a format, a
range, a required value — it has to be offered.

*Severity* — MEDIUM. *Criterion* — 3.3.3.

### Required conveyed only by an asterisk

A red `*` with no legend and no `required` attribute. Neither the meaning nor
the state reaches assistive technology.

*Severity* — MEDIUM. *Criterion* — 3.3.2.

### Missing autocomplete on personal data

Name, email, address, and payment fields without `autocomplete`. This is a
real barrier for people with motor or cognitive disabilities, for whom
retyping is the expensive part.

*Severity* — MEDIUM. *Criterion* — 1.3.5.

### A grouped control with no group label

Radios or checkboxes without `<fieldset>` and `<legend>`. Each option is
announced without the question it answers.

*Severity* — MEDIUM. *Criterion* — 1.3.1.

## When it is NOT a finding

- **A wrapping `<label>` needs no `for`.** `<label>Email <input></label>` is
  correct and complete. Flagging it for a missing `for` is a false positive.
- **`aria-label` on a control with no visible label is correct.** A search
  input with only a magnifier icon beside it is the canonical case. It is only
  a problem when it *contradicts* visible text, because then speech-input
  users cannot say what they see.
- **A placeholder alongside a real label is fine.** The failure is the
  placeholder *replacing* the label, not its existence.
- **Native `required` needs no `aria-required`.** The attribute already
  exposes the state; adding both is redundant, not broken.
- **You often cannot confirm the error path from source.** Whether the message
  is announced depends on when it is inserted and whether focus moves. If the
  code does not settle it, say what would.
- **A visually-hidden label is a real label**, provided the class actually
  clips rather than using `display: none` — that distinction is worth
  checking, and it is the only part of this that is a defect.
- **Not every field takes autocomplete.** The criterion covers a defined list
  of personal-data purposes. A quantity field or a search box is not on it.

## Accessible patterns

```html
<!-- Explicit association -->
<label for="email">Email address</label>
<input id="email" name="email" type="email" autocomplete="email"
       required aria-describedby="email-hint">
<p id="email-hint">We only use this for receipts.</p>

<!-- Error: associated, announced, and actionable -->
<label for="card">Card number</label>
<input id="card" inputmode="numeric" autocomplete="cc-number"
       aria-invalid="true" aria-describedby="card-error">
<p id="card-error">Card number must be 16 digits. You entered 15.</p>

<!-- Grouped controls carry the question -->
<fieldset>
  <legend>Delivery speed</legend>
  <label><input type="radio" name="speed" value="std"> Standard</label>
  <label><input type="radio" name="speed" value="exp"> Express</label>
</fieldset>
```

## Review checklist

- [ ] Every control has an accessible name by one of the four routes
- [ ] No placeholder stands in for a label
- [ ] Every `for` resolves to an `id` that exists
- [ ] Errors are associated with their control and identify the field
- [ ] Errors say how to fix the problem where a fix is known
- [ ] Required state is programmatic, not only an asterisk
- [ ] Personal-data fields carry `autocomplete`
- [ ] Radio and checkbox groups have a `<legend>`
