# Structure and semantics

> **Surface** — the markup that tells assistive technology what a thing *is*:
> headings, landmarks, lists, tables, and the choice between a native element
> and a `<div>`. It breaks for screen-reader users, who navigate by structure
> rather than by looking, and for anyone using a reader mode, a translation
> tool, or a browser extension that relies on the document outline.
>
> **WCAG 2.1** — 1.3.1 Info and Relationships (A) · 1.3.2 Meaningful Sequence
> (A) · 2.4.6 Headings and Labels (AA) · 4.1.2 Name, Role, Value (A)

## Where to look

- Page shells and layout components — where landmarks are or are not.
- Every `<h1>`–`<h6>`, and any element styled to look like a heading.
- `<div>` and `<span>` carrying `onClick`, `onKeyDown`, or a `role`.
- `<table>`: is it tabular data, or layout?
- Lists built from `<div>`s.
- Component libraries that render a wrapper element you did not choose.

**Search signatures.** `<div onClick`, `<span onClick`, `role="button"`,
`role="presentation"`, `className=".*heading"`, `<table`, `<h[1-6]`,
absence of `<main`, `<nav`, `<header`, `<footer`.

## Failure modes

### A control built from a generic element

`<div onClick={…}>` styled to look like a button. It is not focusable, not
activated by Enter or Space, and announced as nothing.

*Confirm* — a `<div>` with a click handler and no `role`, no `tabIndex`, and
no keyboard handler fails on all three counts at once. A `<div>` with all
three is verbose but functional.

*Severity* — HIGH; CRITICAL when it is on the only path through a task.
*Criterion* — 4.1.2, and 2.1.1 for the keyboard half.

### No landmarks

No `<main>`, `<nav>`, or `<header>` anywhere in the shell. Screen-reader users
navigate by landmark before they navigate by anything else; without them the
only way through the page is linearly, from the top, every time.

*Severity* — MEDIUM. *Criterion* — 1.3.1.

### Heading levels used for size

`<h4>` chosen because it looked right, or a `<div class="title">` that is
visually a heading and structurally nothing. The outline stops matching the
page.

*Confirm* — read only the headings in source order. If that list does not
describe the page, the outline is wrong.

*Severity* — MEDIUM. *Criterion* — 1.3.1 and 2.4.6.

### A layout table

`<table>` used to position content. Announced as a data table, with row and
column relationships that mean nothing.

*Severity* — HIGH. *Criterion* — 1.3.1.

### A data table without header association

`<table>` with data but no `<th>`, or `<th>` without `scope`. Cells are
announced without the header that gives them meaning.

*Severity* — MEDIUM. *Criterion* — 1.3.1.

### DOM order that contradicts visual order

CSS `order`, `flex-direction: row-reverse`, `grid-area`, or absolute
positioning that presents content in an order the DOM does not have. Keyboard
and screen-reader users get the DOM order.

*Confirm* — this needs the rendered layout to establish. From source you can
identify the risk, rarely the failure.

*Severity* — MEDIUM, capped at LOW when established from source alone.
*Criterion* — 1.3.2.

## When it is NOT a finding

- **Native semantics need no ARIA.** `<button>`, `<nav>`, `<main>`, `<ul>`
  already expose their role. Adding `role="button"` to a `<button>` is
  redundant, not broken — report it as LOW cleanup at most, never as a defect.
- **More than one `<h1>` is not automatically wrong.** It is a smell in a
  document, and it is normal in a page composed of independent sectioning
  content. Establish which one you are looking at before flagging.
- **A skipped heading level is a MEDIUM, not a HIGH.** The outline is
  imperfect; nothing is unreachable. Reports that open with heading skips at
  HIGH train readers to skim the rest.
- **A `<div>` with `role`, `tabIndex` and a keyboard handler works.** It is
  more code than a `<button>` and it is not a conformance failure. Recommend
  the native element; do not report a violation.
- **A component library's wrapper element is usually not the reviewed team's
  choice.** Check whether the semantics are configurable before making it
  their finding.
- **Visual order versus DOM order cannot be settled from a diff.** Name it as
  something to verify at the rendered width, at LOW.
- **`role="presentation"` on a genuinely presentational wrapper is correct.**
  It is only a defect on an element that is interactive or that carries
  meaning.

## Accessible patterns

```html
<!-- Landmarks give a screen-reader user a table of contents -->
<header>…</header>
<nav aria-label="Primary">…</nav>
<main>
  <h1>Invoices</h1>
  <section>
    <h2>Unpaid</h2>
  </section>
</main>
<footer>…</footer>

<!-- Use the element that already has the behaviour -->
<button type="button" onclick="remove()">Remove</button>

<!-- A data table associates cells with headers -->
<table>
  <caption>Invoices by quarter</caption>
  <thead>
    <tr><th scope="col">Quarter</th><th scope="col">Total</th></tr>
  </thead>
  <tbody>
    <tr><th scope="row">Q1</th><td>2.1M</td></tr>
  </tbody>
</table>
```

## Review checklist

- [ ] The page shell exposes `<main>`, and navigation is in a `<nav>`
- [ ] Headings describe the outline; levels are not chosen for size
- [ ] Anything styled as a heading is a heading
- [ ] Interactive things are native elements, or fully rebuilt if not
- [ ] Tables hold data; data tables associate `<th>` with `scope`
- [ ] Lists are lists
- [ ] No ARIA duplicates a role the element already has
