# Navigation, page identity and language

> **Surface** — how a user finds their way around: page titles, link text,
> skip links, consistent placement, and the declared language. It breaks for
> screen-reader users navigating by link list or by title, for people with
> cognitive disabilities relying on consistency, and for anyone whose screen
> reader pronounces the page in the wrong language.
>
> **WCAG 2.1** — 2.4.1 Bypass Blocks (A) · 2.4.2 Page Titled (A) ·
> 2.4.4 Link Purpose (A) · 2.4.5 Multiple Ways (AA) ·
> 3.1.1 Language of Page (A) · 3.1.2 Language of Parts (AA) ·
> 3.2.3 Consistent Navigation (AA) · 3.2.4 Consistent Identification (AA)

## Where to look

- The document shell: `<html lang>`, `<title>`, and how the title is set per
  route.
- The first focusable element on the page — is it a skip link?
- Link text, especially in lists, cards, and tables.
- Navigation components shared across routes.
- Any text in a second language: quotes, product names, legal text.
- Route configuration, for whether each route gets a distinct title.

**Search signatures.** `<html` without `lang=`; `<title>`; `document.title`;
`skip`; `>Read more<`, `>Click here<`, `>Learn more<`, `>here<`;
`lang=` on inline elements.

## Failure modes

### No language declared

`<html>` with no `lang`. Screen readers fall back to the user's default voice,
which mispronounces everything.

*Confirm* — decidable from source, and one of the cheapest fixes in
accessibility.

*Severity* — MEDIUM. *Criterion* — 3.1.1.

### A generic or missing page title

Every route titled with the application name, or no `<title>` at all. Titles
are how users distinguish tabs and how screen readers announce arrival.

*Confirm* — a single static title across routes in a client-rendered
application is a strong source signal.

*Severity* — MEDIUM. *Criterion* — 2.4.2.

### Link text that does not carry its purpose

"Read more", "Click here", "Learn more" repeated down a page. A screen-reader
user listing links hears the same phrase many times.

*Confirm* — the criterion allows the purpose to come from the surrounding
context, so a repeated phrase is not automatically a failure. It is a failure
when the link's own text plus its programmatically-determined context still
does not identify the destination.

*Severity* — MEDIUM. *Criterion* — 2.4.4.

### No way to bypass repeated blocks

A large navigation before the content on every page, with no skip link, no
landmarks, and no heading structure to jump by.

*Confirm* — the criterion is satisfied by *any* bypass mechanism. Landmarks
alone can satisfy it. Only flag when none of the routes exist.

*Severity* — MEDIUM. *Criterion* — 2.4.1.

### Inconsistent navigation or labelling

The same navigation in a different order on different pages, or the same
function labelled differently in different places.

*Severity* — MEDIUM. *Criterion* — 3.2.3, 3.2.4.

### Foreign-language passages not marked

A quotation or term in another language with no `lang` attribute, read aloud
in the wrong phonetics.

*Confirm* — proper nouns and words absorbed into the page language are
exempt.

*Severity* — LOW. *Criterion* — 3.1.2.

## When it is NOT a finding

- **A skip link is not the only way to satisfy 2.4.1.** Landmarks and a proper
  heading structure do it too. Reporting "no skip link" on a page with
  `<main>` and a sound outline is a false positive.
- **"Read more" is not automatically a failure.** If it sits inside an article
  card whose heading is programmatically associated, the purpose is
  determinable. Establish the context before flagging.
- **A single-page application usually sets the title in JavaScript.** Absence
  of a per-route `<title>` in the HTML shell is not evidence; look for the
  route-level mechanism first.
- **`lang` on `<html>` covers the whole document.** Per-element `lang` is only
  needed where the language actually changes.
- **Proper nouns are exempt from 3.1.2.** A French product name in an English
  sentence needs nothing.
- **2.4.5 Multiple Ways has an exemption** for a page that is a step in a
  process. A checkout step needs no site map.
- **Consistency is judged across a set of pages**, not within one. You cannot
  establish 3.2.3 from a single component.
- **A visually-hidden skip link is still a skip link**, provided it becomes
  visible on focus. Check the focus style before reporting it as hidden.

## Accessible patterns

```html
<html lang="en">
  <head><title>Invoices — Acme Billing</title></head>
  <body>
    <a class="skip-link" href="#main">Skip to main content</a>
    <nav aria-label="Primary">…</nav>
    <main id="main" tabindex="-1">…</main>
  </body>
</html>
```

```css
/* Hidden until focused — still reachable, still announced */
.skip-link {
  position: absolute;
  left: -9999px;
}
.skip-link:focus {
  left: 0;
  top: 0;
}
```

```html
<!-- The link carries its own purpose -->
<a href="/invoices/2024-Q1">View the Q1 2024 invoice</a>
```

## Review checklist

- [ ] `<html lang>` is present and correct
- [ ] Every route has a distinct, descriptive title
- [ ] Link purpose is determinable from the link plus its context
- [ ] Repeated blocks can be bypassed by some mechanism
- [ ] Navigation order and control labelling are consistent across pages
- [ ] Language changes within the page are marked
- [ ] A visually-hidden skip link becomes visible on focus
