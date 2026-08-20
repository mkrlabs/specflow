# Images and text alternatives

> **Surface** — every non-text thing that carries meaning: `<img>`, inline
> `<svg>`, icon fonts, CSS background images that are not decoration, canvas,
> charts, and the image half of a link or button. It breaks for anyone who
> does not see the image: screen-reader users, people on a slow connection,
> people whose images failed to load.
>
> **WCAG 2.1** — 1.1.1 Non-text Content (A) · 1.4.5 Images of Text (AA)

## Where to look

- `<img>`, `<svg>`, `<picture>`, `<object>`, `<canvas>`, `<video poster>`.
- Icon components — the wrapper usually decides the alternative, not the call
  site.
- Buttons and links whose entire content is an icon.
- CSS `background-image` on an element with no text content.
- Charts and data visualisations, which almost never have an alternative.

**Search signatures.** `<img` without `alt`; `alt=""`; `alt="image"`,
`alt="photo"`, `alt="icon"`, or an alt ending in `.png` / `.jpg` / `.svg`;
`<svg` without `aria-hidden` and without `<title>`; `role="img"`.

## Failure modes

### An informative image with no text alternative

An `<img>` with no `alt` attribute at all. Assistive technology falls back to
announcing the filename, which is noise at best and misleading at worst.

*Confirm* — the attribute is absent, not empty. `alt=""` is a deliberate
declaration and a different case entirely.

*Severity* — HIGH. *Criterion* — 1.1.1.

### A placeholder alternative

`alt="image"`, `alt="photo"`, `alt="logo"`, or the filename. The attribute is
present, so automated checkers pass it, and the user gets nothing.

*Confirm* — read it as a replacement for the image. If removing the image and
leaving only that text loses the meaning, it is a placeholder.

*Severity* — HIGH. *Criterion* — 1.1.1.

### An icon-only control with no accessible name

A button or link whose only content is an icon, with no `aria-label`, no
visually-hidden text, and an `aria-hidden` icon. The control is announced as
"button" with nothing else.

*Confirm* — trace what text the control would expose. An `aria-hidden` icon
inside an unlabelled button leaves the control genuinely nameless.

*Severity* — HIGH. *Criterion* — 1.1.1 and 4.1.2.

### Text rendered as an image

A heading, quote, or price shipped as a raster image. It cannot be resized,
recoloured, translated, or selected.

*Confirm* — logotypes are explicitly excepted. So is text that is part of a
photograph rather than presented as text.

*Severity* — MEDIUM. *Criterion* — 1.4.5.

### A chart or diagram with a name but no content

`alt="Sales chart"` names the image and conveys none of it. The alternative
has to carry the information, which for a complex graphic usually means a
nearby table or description rather than an attribute.

*Severity* — MEDIUM. *Criterion* — 1.1.1.

## When it is NOT a finding

- **`alt=""` on a decorative image is correct — it is the fix, not the bug.**
  An empty alt removes the image from the accessibility tree, which is exactly
  what should happen to a spacer, a flourish, or an icon sitting beside a text
  label that already says the same thing. Flagging `alt=""` as "missing alt
  text" is the single most common wrong accessibility finding.
- **You usually cannot tell whether an image is decorative from source.**
  Whether a photograph beside an article is illustrative or informative is an
  editorial judgement about meaning. If the code does not settle it, the
  finding is a question at LOW, not a defect.
- **An icon beside a text label should be hidden.** `<span aria-hidden="true">`
  on the icon plus the visible text is correct. Announcing both is the defect.
- **`<svg aria-hidden="true">` inside a labelled button is correct.** The
  button carries the name; the graphic is presentational.
- **The alternative does not have to describe the image.** It has to replace
  it. For a link whose image *is* the link, the right alternative is the link's
  destination, not a description of the artwork.
- **A logo's alternative is the organisation's name**, not "logo". Neither is
  a finding if the name is there.
- **A CSS background image is presentational by default.** Only flag one when
  it demonstrably carries information no text nearby carries.

## Accessible patterns

```html
<!-- Informative: the alternative replaces the image -->
<img src="chart.png" alt="Revenue grew from 2.1M to 3.4M between Q1 and Q4.">

<!-- Decorative: explicitly empty, removed from the accessibility tree -->
<img src="divider.svg" alt="">

<!-- Icon-only control: the control is named, the graphic is hidden -->
<button aria-label="Close dialog">
  <svg aria-hidden="true" focusable="false"><!-- … --></svg>
</button>

<!-- Icon beside text: only the text is announced -->
<button>
  <svg aria-hidden="true" focusable="false"><!-- … --></svg>
  Delete
</button>
```

## Review checklist

- [ ] Every `<img>` has an `alt` attribute — present, even when empty
- [ ] No alternative is a filename or a generic placeholder
- [ ] Icon-only controls carry an accessible name
- [ ] Decorative graphics are `alt=""` or `aria-hidden="true"`, not both named
      and hidden
- [ ] Informative graphics have an alternative that replaces them
- [ ] Complex graphics have a description beyond a name
- [ ] Text is text, not a picture of text
