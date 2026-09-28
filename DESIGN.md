# Design

## System

**Graphite Signal Deck** is an opaque, near-neutral graphite music instrument. Its structural surfaces and text stay quiet so the sixteen sound sources can read as the performance field. Mint marks playback and focus; the cobalt first pair establishes the default beat; each source hue identifies its pad and selected controls. Recording stays coral, and Arrange retains its ultraviolet loop, cyan one-shot, coral selection, mint playback, and warm-red recording/error roles. It is not a neon-club page, retro handheld, toy, dashboard, or DAW.

## Color tokens

Tokens live in `src/app.css` and are the only source of colour; components never carry literal colour values.

```css
:root {
  --audle-page: oklch(0.125 0.004 255);
  --audle-deck: oklch(0.185 0.005 255);
  --audle-deck-raised: oklch(0.225 0.006 255);
  --audle-control: oklch(0.275 0.007 255);
  --audle-control-hover: oklch(0.31 0.007 255);
  --audle-control-pressed: oklch(0.212 0.006 255);
  --audle-well: oklch(0.105 0.004 255);
  --audle-well-raised: oklch(0.14 0.005 255);
  --audle-outline: oklch(0.465 0.009 255);
  --audle-outline-subtle: oklch(0.36 0.008 255);
  --audle-edge-light: oklch(0.72 0.004 255 / 0.25);
  --audle-edge-shadow: oklch(0.05 0.003 255 / 0.8);
  --audle-text: oklch(0.94 0.004 255);
  --audle-text-muted: oklch(0.79 0.007 255);
  --audle-text-dim: oklch(0.68 0.008 255);
  --audle-accent-ink: oklch(0.18 0.006 255);
  --audle-disabled: oklch(0.22 0.006 255);
  --audle-disabled-ink: oklch(0.66 0.008 255);
  --audle-grid-major: oklch(0.411 0.009 255);
  --audle-grid-minor: oklch(0.3 0.007 255);
  --audle-control-contact:
    inset 0 2px 3px var(--audle-edge-shadow), inset 0 1px 0 oklch(0.04 0.003 255 / 0.45);
  --audle-source-1: 0.77 0.16 265;
  --audle-source-2: 0.77 0.16 274;
}
```

Mint remains `--audle-accent`, its dim/playback variants, and focus. The other fourteen source hues remain source-specific. Play uses source-tinted solid pad faces, glyphs, active edges, meters, and selected controls; colour always has a label, shape, line treatment, or ARIA state beside it.

## Rules

- Use solid fills only. No gradients, glass, chrome, coloured page fog, beige/brown surfaces, retro bezels, or toy offset shadows.
- Bright colour is contained by its owning element: a pad glyph, meter, hard ring, active edge, or selected control. A hit bloom may appear only inside the audible pad that fired, never on the page.
- Use `--audle-text` for primary text and `--audle-text-muted` for secondary metadata on dark surfaces. Focus is a 3px visible ring, and non-colour cues remain required.
- Depth comes only from the inset deck and control tokens. Do not use panel, card, or dock drop shadows or blur halos.
- Icons come from the shared 16px stroke set (`Icon.svelte`); text glyphs and emoji do not substitute for icons.

## Layout

Two surfaces and one sheet. Play is a centered compact deck: a 4×4 bank is the main performance surface, with one unboxed selected-sound strip alongside it and transport in the footer. Hear it and Solo share the name row; source kind, decoded seconds, and source-bar length sit beneath it, distinct from the arrangement’s bar count. Offset sits beside Groove, six connected text choices control feel, and six compact visible dials control Level, Pan, Tune, Space (hall reverb), Echo (repeats), and Fuzz (distortion) per sound. The lower strip on each pad shows clip starts and played loop spans across the arrangement; only the selected pad enlarges that strip. Dense retriggers reordered source windows rather than silently dividing a continuous loop. An active pad’s ring draws only its own post-gain waveform and accents only that pad’s audible hits. Muted patterns stay visible but subdued. Neither the strips nor rings edit clips or substitute for Arrange’s precision timeline; Play has no whole-mix footer graphic, duplicate performer display, or editable step grid.

At 1280×720 the default Play deck does not scroll. Below 900px the instrument stacks while retaining the 4×4 bank; phone layouts may scroll vertically but never horizontally. Play targets are at least 48px and compact controls at least 44px. Arrange, Share, Help, and the shared player retain their existing layouts and role colours.

## Motion

Motion follows a real cause. A pad flash, timing-mark accent, ring halo, and meter kick follow that pad’s audible hit through `EditorState.subscribeHits` and `Tone.getDraw`; each waveform ring reads its owning track’s isolated post-gain analyser. The pad playhead follows the actual transport tick. The transport icon alone receives beat pulse while playing; hover and press follow the pointer or keyboard gesture. The pad bank may enter once per page load with a diagonal stagger. There is no fabricated idle animation, duplicate animated sound display, or load choreography beyond that entrance.

Use only transform, opacity, and custom properties for motion. Press is a quick compression (`--motion-press`); release and pop-in may use a low-bounce spring (damping ≥ 20, no visible overshoot past ~3%) or `--ease-out-quint`. Under reduced motion, remove lifts, compression, entrances, hit flashes, live waveform animation, beat pulses, and moving playheads while retaining static waveform outlines, timing marks, selected, queued, meter, and focus cues.

## Components

Sound objects, timeline clips, transport controls, knobs, gallery rows, and notices are tactile dark surfaces with hard structural separators. Each sound object pairs its number, short label, role, and active state; queued state says “Next bar.” Sound is the user-facing noun everywhere. Arrange calls cloning “Add a layer,” repeat “Fill the loop,” and its starter action “Remix today’s starter”; a shared loop offers “Remix this.”
