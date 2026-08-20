# Accessibility catalogue — WCAG 2.1 A and AA

An offline, stack-agnostic reference for reviewing an interface against
WCAG 2.1 at Level A and AA. It exists so an accessibility finding is built
from a method rather than from vocabulary — and, just as importantly, so a
*wrong* finding is killed before a reader has to kill it.

## How a finding is built

1. **Read `00-triage.md` first.** It sets the scope, the severity rubric, the
   finding format, and the gate every finding has to pass — including the list
   of things source code simply cannot establish.
2. **Route to the surfaces in scope** using the table below. Open two or
   three, not eleven. The routing key is the *surface you are looking at*,
   because that is how a review is entered.
3. **Before shipping each finding, read that file's `## When it is NOT a
   finding`** — looking for the reason *you* are wrong. This is per shipped
   finding, not per file skimmed, so its cost scales with the report.
4. **Cite the criterion by number and name, and the file you relied on.** A
   criterion number with no file behind it is a suspicion wearing a standard.

## Routing table

| Surface | Open it when the code touches… | File |
| :--- | :--- | :--- |
| **Images and text alternatives** | an `<img>`, `<svg>`, icon, chart or icon-only control | `01-images-and-text-alternatives.md` |
| **Structure and semantics** | headings, landmarks, tables, lists, or a `<div>` doing a control's job | `02-structure-and-semantics.md` |
| **Forms, labels and errors** | any input, label, hint, required marker or validation error | `03-forms-and-labels.md` |
| **Keyboard and focus** | tab order, focus styles, modals, menus, or any click handler | `04-keyboard-and-focus.md` |
| **ARIA and custom widgets** | a `role`, an `aria-*` attribute, or a hand-built widget | `05-aria-and-custom-widgets.md` |
| **Colour and contrast** | colours, tokens, themes, or colour used to carry meaning | `06-color-and-contrast.md` |
| **Text sizing, zoom and reflow** | fixed sizes, the viewport meta, overflow, or tooltips | `07-text-zoom-and-reflow.md` |
| **Time, motion and media** | video, audio, carousels, animation, or a time limit | `08-time-motion-and-media.md` |
| **Navigation, page identity and language** | `lang`, page titles, link text, skip links, or shared navigation | `09-navigation-and-language.md` |
| **Dynamic updates and status messages** | toasts, live regions, async updates, or a route change | `10-dynamic-updates-and-status.md` |

Plus `00-triage.md`, which is not optional.

## Criteria index

Every Level A and AA criterion this catalogue covers, by file.

| File | WCAG 2.1 success criteria |
| :--- | :--- |
| `01-images-and-text-alternatives.md` | 1.1.1 · 1.4.5 |
| `02-structure-and-semantics.md` | 1.3.1 · 1.3.2 · 2.4.6 · 4.1.2 |
| `03-forms-and-labels.md` | 1.3.1 · 1.3.5 · 2.4.6 · 3.3.1 · 3.3.2 · 3.3.3 · 3.3.4 · 4.1.2 |
| `04-keyboard-and-focus.md` | 2.1.1 · 2.1.2 · 2.1.4 · 2.4.3 · 2.4.7 · 3.2.1 |
| `05-aria-and-custom-widgets.md` | 1.3.1 · 2.1.1 · 4.1.2 |
| `06-color-and-contrast.md` | 1.4.1 · 1.4.3 · 1.4.11 |
| `07-text-zoom-and-reflow.md` | 1.4.4 · 1.4.10 · 1.4.12 · 1.4.13 |
| `08-time-motion-and-media.md` | 1.2.1 · 1.2.5 · 1.4.2 · 2.2.1 · 2.2.2 · 2.3.1 · 2.3.3 |
| `09-navigation-and-language.md` | 2.4.1 · 2.4.2 · 2.4.4 · 2.4.5 · 3.1.1 · 3.1.2 · 3.2.3 · 3.2.4 |
| `10-dynamic-updates-and-status.md` | 2.4.3 · 3.2.2 · 3.3.1 · 4.1.3 |

## On the sources

The criteria are defined by the W3C in **Web Content Accessibility Guidelines
(WCAG) 2.1**, <https://www.w3.org/TR/WCAG21/>, © 2017–2025 World Wide Web
Consortium. That document is the normative authority; where it and this
catalogue disagree, it wins and this catalogue is a bug.

**No W3C text is reproduced here.** WCAG 2.1 is published under the
W3C Document License, which does not grant the right to create derivative
works for use as a technical specification. What this catalogue carries instead is
original prose — written for reviewers, organised by the surface a review
actually starts from — that *references* criteria by their number and name.
Numbers and titles are used as citations, which is what a normative standard
is for.

The consequence worth knowing: this catalogue is deliberately **not** a
conformance checklist. It will not tell you whether a product conforms. It
tells a reviewer where to look, how to confirm, and — more often than any
other section earns its space — when to stop.
