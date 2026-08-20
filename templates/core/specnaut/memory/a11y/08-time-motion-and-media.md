# Time, motion and media

> **Surface** — anything that moves, plays, expires, or flashes. It breaks for
> people with vestibular disorders, photosensitive epilepsy, cognitive
> disabilities, deaf and hard-of-hearing users, blind users, and anyone who
> needs longer than the timeout allows.
>
> **WCAG 2.1** — 1.2.1 Audio-only and Video-only (A) · 1.2.2 Captions (A) ·
> 1.2.3 Audio Description or Media Alternative (A) · 1.2.5 Audio Description
> (AA) · 1.4.2 Audio Control (A) · 2.2.1 Timing Adjustable (A) ·
> 2.2.2 Pause, Stop, Hide (A) · 2.3.1 Three Flashes or Below Threshold (A)

## Where to look

- `<video>`, `<audio>`, embedded players, background video.
- `<track>` elements — captions and descriptions, or their absence.
- Carousels, marquees, tickers, auto-advancing content.
- CSS `animation`, `transition`, `transform` with long durations or
  `infinite`.
- `@media (prefers-reduced-motion)` — present or absent.
- Session timeouts, countdowns, auto-refresh, `autoplay`.

**Search signatures.** `autoplay`, `loop`, `<track`, `animation:`,
`animation-iteration-count: infinite`, `prefers-reduced-motion`, `setTimeout`
with a large delay, `setInterval`, `meta http-equiv="refresh"`.

## Failure modes

### Video without captions

Prerecorded video with audio and no captions. The dialogue is unavailable to
deaf and hard-of-hearing users.

*Confirm* — look for `<track kind="captions">` or a player-level caption
source. Note that `kind="subtitles"` is translation, not captioning, and does
not carry non-speech audio.

*Severity* — HIGH. *Criterion* — 1.2.2.

### Video without an audio description or transcript

Visual information not conveyed by the soundtrack has no alternative.

*Severity* — MEDIUM. *Criterion* — 1.2.3, 1.2.5.

### Audio-only content without a transcript

A podcast or recorded call with no text alternative.

*Severity* — HIGH. *Criterion* — 1.2.1.

### Audio that plays automatically

Sound starting on load and continuing for more than three seconds with no
pause, stop, or independent volume control. It also collides directly with
screen-reader speech.

*Confirm* — `autoplay` without `muted`. Fully decidable from source.

*Severity* — HIGH. *Criterion* — 1.4.2.

### Moving content that cannot be paused

A carousel that auto-advances, a ticker, a looping background video — running
more than five seconds with no pause control.

*Severity* — HIGH. *Criterion* — 2.2.2.

### A time limit the user cannot extend

Session expiry, a countdown, or an auto-refresh with no warning and no way to
extend.

*Confirm* — exemptions exist for real-time events and where the limit is
essential. Check before flagging.

*Severity* — HIGH. *Criterion* — 2.2.1.

### Flashing

Content flashing more than three times per second. This one can cause
seizures.

*Confirm* — rarely establishable from source. Rapid CSS animation on opacity
or background is a signal to name, not a measurement.

*Severity* — CRITICAL when confirmed. *Criterion* — 2.3.1.

### No reduced-motion path

Large parallax, scroll-driven, or transform-heavy animation with no
`prefers-reduced-motion` branch. This is not a Level AA failure on its own —
report it as the strong practice it is, at its real severity.

*Severity* — MEDIUM, as a robustness finding rather than an AA violation.

## When it is NOT a finding

- **`autoplay muted` does not fail 1.4.2.** The criterion is about audio. A
  silent looping background video is a motion question, not an audio one.
- **`kind="subtitles"` is not `kind="captions"`.** Do not accept one for the
  other — but equally, do not report missing captions on a video that has no
  audio track at all.
- **A media alternative can live outside the player.** A transcript on the
  page satisfies the requirement; the absence of a `<track>` element alone
  does not establish a failure.
- **Animation under five seconds that stops on its own is not 2.2.2.** The
  criterion targets content that moves, blinks or scrolls *and* starts
  automatically *and* lasts more than five seconds *and* runs in parallel with
  other content.
- **A time limit can be exempt.** Real-time events such as an auction, and
  limits essential to the activity, are explicitly excepted.
- **Flash rate is not measurable from a stylesheet.** Name it for testing;
  do not assert a seizure risk you cannot demonstrate.
- **Missing `prefers-reduced-motion` is not a Level AA failure.** Reporting it
  as one is a conformance claim the specification does not support at AA.
- **Live captions have a different criterion and a different bar** than
  prerecorded ones. Do not apply 1.2.2 to a live stream.

## Accessible patterns

```html
<!-- Captions ship with the video, not after it -->
<video controls>
  <source src="demo.mp4" type="video/mp4">
  <track kind="captions" src="demo.en.vtt" srclang="en" label="English" default>
</video>
<p><a href="demo-transcript.html">Read the transcript</a></p>

<!-- Decorative background video: silent, and pausable -->
<video autoplay muted loop playsinline aria-hidden="true"></video>
<button type="button" data-toggle-motion>Pause background</button>
```

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Review checklist

- [ ] Prerecorded video with audio has captions
- [ ] Audio-only content has a transcript
- [ ] Visual-only information has a description or transcript
- [ ] Nothing plays audio automatically without a control
- [ ] Auto-advancing content can be paused, stopped or hidden
- [ ] Time limits can be turned off, adjusted, or extended
- [ ] Nothing flashes more than three times a second
- [ ] Substantial motion honours `prefers-reduced-motion`
