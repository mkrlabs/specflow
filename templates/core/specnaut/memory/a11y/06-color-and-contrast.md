# Colour and contrast

> **Surface** — the legibility of text against its background, the visibility
> of interface boundaries, and every place colour is the only thing carrying
> information. It breaks for people with low vision, for the very large
> population with colour-vision deficiency, and for everyone reading outdoors.
>
> **WCAG 2.1** — 1.4.1 Use of Color (A) · 1.4.3 Contrast (Minimum) (AA) ·
> 1.4.11 Non-text Contrast (AA)

## The honest limit of a source review

**Contrast is a rendered property.** A ratio depends on the final computed
colours: the token, the theme, the cascade, the state, any opacity in the
stack, and whatever sits behind a translucent surface. Source gives you a
ratio only when both colours are literal and adjacent.

This is the single largest generator of wrong accessibility findings. Treat
it accordingly: compute only what you can compute, and name the rest.

| Situation | What you may claim |
| :--- | :--- |
| Two literal hex values on the same rule | The ratio. This is a finding. |
| Colours from variables resolvable in the same file | The ratio, saying you resolved them. |
| Variables defined elsewhere, or theme-dependent | Nothing. Name it to verify. |
| Any opacity, gradient, blend mode, or image behind | Nothing. |
| A disabled or placeholder state | Check the exemption first. |

## Where to look

- Stylesheets, theme files, design-token definitions.
- Inline `style` attributes and CSS-in-JS objects.
- Placeholder, disabled, and hint text — the usual offenders.
- Status messages: error red, success green, and nothing else.
- Charts, badges, and legends.
- Focus indicators and control borders.

**Search signatures.** `color:`, `background`, `#` followed by 3/6 hex
digits, `rgb(`, `rgba(`, `hsl(`, `opacity:`, `--color-`, `placeholder`,
`:disabled`.

## Failure modes

### Body text below 4.5:1

Normal-size text against its background at less than 4.5:1.

*Confirm* — both colours literal, no opacity in the stack. Otherwise it is
not a finding yet.

*Severity* — HIGH. *Criterion* — 1.4.3.

### Large text below 3:1

Text at 24px or larger, or 18.66px and bold, has a lower threshold — but only
that threshold, not none.

*Severity* — HIGH. *Criterion* — 1.4.3.

### Colour as the only signal

Required fields marked only in red. Errors distinguished only by colour. A
chart whose series are only distinguishable by hue. A link identified inside
body text by colour alone.

*Confirm* — this one is often decidable from source: look for an accompanying
icon, text, underline, or pattern. Its absence is the finding.

*Severity* — HIGH. *Criterion* — 1.4.1.

### Interface boundaries below 3:1

Input borders, toggle tracks, focus rings, icon-only controls against their
background.

*Severity* — MEDIUM. *Criterion* — 1.4.11.

### Text over an image with no scrim

Any ratio claim is meaningless because the background varies per pixel.

*Confirm* — the finding is the *absence of a guarantee* — a scrim, an overlay,
a solid panel — not a computed ratio.

*Severity* — MEDIUM. *Criterion* — 1.4.3.

## When it is NOT a finding

- **You cannot compute a ratio through a design token you did not resolve.**
  Reporting one anyway is the defining wrong finding of this surface. If the
  variable is defined in another file you were not given, say so and stop.
- **Disabled controls are exempt from 1.4.3.** Greyed-out text on a disabled
  button is not a contrast failure. It is worth a design note; it is not a
  conformance finding.
- **Pure decoration is exempt.** A background flourish, an inactive slide
  indicator, a divider that carries no information.
- **Logotypes are exempt.** Brand marks have no contrast requirement.
- **Large text has a different threshold, not no threshold.** Applying 4.5:1
  to a 32px heading is a false positive; applying nothing is the opposite
  error.
- **Colour plus another signal satisfies 1.4.1.** Red text *and* an error icon
  *and* a message is correct. Only colour alone fails.
- **An underline is not required for every link.** Links in navigation, in
  cards, and in other clearly-delineated contexts do not need one; links
  inside a paragraph of body text do.
- **Contrast in a state you cannot see from source** — hover, active,
  visited — is a question, not a claim.

## Accessible patterns

```css
/* State the intent where the token is defined, so it survives a theme change */
:root {
  --text-body: #1f2933;      /* 14.2:1 on --surface */
  --surface:   #ffffff;
  --text-hint: #52606d;      /*  7.1:1 on --surface — still passes AA */
}
```

```html
<!-- Never colour alone: icon, text, and colour together -->
<p class="error">
  <svg aria-hidden="true" focusable="false"><!-- alert glyph --></svg>
  Error: card number must be 16 digits.
</p>
```

## Review checklist

- [ ] Every computable body-text pair reaches 4.5:1
- [ ] Every computable large-text pair reaches 3:1
- [ ] Nothing is conveyed by colour alone
- [ ] Control borders and focus indicators reach 3:1
- [ ] Text over imagery is guaranteed a background
- [ ] Uncomputable pairs are named to verify, not reported as ratios
