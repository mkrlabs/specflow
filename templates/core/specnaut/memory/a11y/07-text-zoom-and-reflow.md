# Text sizing, zoom and reflow

> **Surface** — what happens when the page is not viewed at the width and font
> size it was designed for. It breaks for low-vision users who zoom, for
> anyone who has raised their browser's default font size, and — because the
> requirement is expressed as a width — for every mobile user at once.
>
> **WCAG 2.1** — 1.4.4 Resize Text (AA) · 1.4.10 Reflow (AA) ·
> 1.4.12 Text Spacing (AA) · 1.4.13 Content on Hover or Focus (AA)

## Where to look

- Fixed pixel dimensions on anything containing text.
- `font-size` in `px` on body copy.
- `overflow: hidden`, `white-space: nowrap`, `text-overflow: ellipsis`.
- `width` / `height` on buttons, badges, cards, table cells.
- `<meta name="viewport">`.
- Tooltips and popovers.
- Fixed headers and footers, which eat the viewport when zoomed.

**Search signatures.** `user-scalable=no`, `maximum-scale=1`,
`height: [0-9]+px` on text containers, `white-space: nowrap`,
`overflow: hidden`, `font-size: [0-9]+px`, `!important` near `line-height`.

## Failure modes

### Zoom disabled

`user-scalable=no` or `maximum-scale=1.0` in the viewport meta. Pinch-zoom is
suppressed on the platforms that honour it.

*Confirm* — fully decidable from source, and unambiguous.

*Severity* — HIGH. *Criterion* — 1.4.4.

### Text clipped by a fixed height

A container with a fixed pixel height holding text that grows. At larger font
sizes the text is cut off or hidden.

*Confirm* — a fixed height combined with `overflow: hidden` around text is a
strong source signal. Whether it actually clips depends on the text.

*Severity* — MEDIUM. *Criterion* — 1.4.4.

### No reflow at 320 CSS pixels

Content requires horizontal scrolling at a viewport equivalent to 320px —
fixed-width layouts, wide tables, minimum widths larger than the target.

*Confirm* — this needs the rendered layout. From source you can identify a
fixed `min-width` above the threshold, which is real evidence; the rest is
not.

*Severity* — MEDIUM. *Criterion* — 1.4.10.

### Layout that breaks under user text spacing

Line height, letter spacing, word spacing, and paragraph spacing overridden by
the user must not cause loss of content. Tight fixed heights are the usual
cause.

*Severity* — MEDIUM. *Criterion* — 1.4.12.

### A tooltip that cannot be dismissed or hovered

Content appearing on hover or focus must be dismissible without moving the
pointer, hoverable so it can be read by a magnifier user tracking across it,
and persistent until dismissed.

*Confirm* — look for an Escape handler and for the popover being part of the
hover target.

*Severity* — MEDIUM. *Criterion* — 1.4.13.

## When it is NOT a finding

- **A pixel font size is not itself a violation.** Browser zoom scales `px`.
  The criterion is about the result, not the unit. Recommend relative units as
  a practice; do not report `font-size: 16px` as a failure.
- **Reflow cannot be judged from a stylesheet.** Unless a fixed width or
  `min-width` above the threshold is right there in the source, this is a
  verify-at-320px note, not a finding.
- **Some content is exempt from reflow** where a two-dimensional layout is
  essential — data tables, maps, diagrams, code. A wide table is not
  automatically a defect.
- **`overflow: hidden` is not automatically clipping.** On a container that
  does not hold text, or where the text is short and bounded, nothing is lost.
- **A fixed header is not a violation** until it consumes enough of the zoomed
  viewport to hide content. That is a rendered fact.
- **`maximum-scale=5` is fine.** The criterion asks for 200%; only values that
  prevent zoom fail.
- **An ellipsis is not automatically loss of content** if the full text is
  available another way — a title, an expandable row, a detail view.

## Accessible patterns

```html
<!-- Let people zoom -->
<meta name="viewport" content="width=device-width, initial-scale=1">
```

```css
/* Let text grow: bound by content, not by a magic number */
.badge {
  min-height: 2rem;      /* not height: 32px */
  padding-block: 0.25rem;
  overflow-wrap: break-word;
}

/* Survive user text spacing */
.card { min-height: 0; }
```

## Review checklist

- [ ] The viewport meta does not disable or cap zoom
- [ ] Text containers are bounded by content, not by fixed pixel heights
- [ ] No `min-width` forces horizontal scrolling below the reflow threshold
- [ ] Layouts tolerate increased line, letter, word and paragraph spacing
- [ ] Hover and focus content is dismissible, hoverable and persistent
- [ ] Anything exempt from reflow is exempt for the right reason
