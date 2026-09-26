# Design

## System

**Teal Signal Deck** is an opaque black-anodized music instrument. Teal near-blacks form a quiet physical deck; a single mint accent marks playback, chosen states and the primary action, and each of the sixteen daily sources carries its own hue, contained inside its pad, clip, meter and active edge. It is not a neon-club page, retro handheld, or toy.

## Color tokens

Tokens live in `src/app.css` and are the only source of colour; components never carry literal colour values.

```css
:root {
  --audle-page: oklch(0.13 0.014 232);
  --audle-deck: oklch(0.195 0.02 230);
  --audle-deck-raised: oklch(0.231 0.023 233);
  --audle-control: oklch(0.27 0.023 225);
  --audle-well: oklch(0.105 0.012 232);
  --audle-outline: oklch(0.476 0.028 183);
  --audle-text: oklch(0.93 0.017 184);
  --audle-text-muted: oklch(0.818 0.022 197);
  --audle-accent: oklch(0.873 0.088 157);
  --audle-accent-dim: oklch(0.667 0.05 177);
  --audle-accent-ink: oklch(0.22 0.03 175);
  --audle-glow: oklch(0.873 0.088 157 / 0.22);
  --audle-loop-light: oklch(0.74 0.16 302);
  --audle-one-shot-light: oklch(0.8 0.12 215);
  --audle-selection-light: oklch(0.75 0.16 32);
  --audle-playback-light: var(--audle-accent);
  --audle-record-light: oklch(0.772 0.136 34);
  --audle-focus: oklch(0.85 0.1 160);
  /* Sixteen source hues as bare triplets, two per role, used as oklch(var(--audle-source-N) / a). */
  --audle-source-1: 0.8 0.12 160;
  --audle-source-16: 0.85 0.14 120;
}
```

## Rules

- Use solid fills only. No gradients, glass, chrome, coloured page fog, beige/brown surfaces, retro bezels, or toy offset shadows.
- Bright colour must be clipped to a glyph, waveform, meter, hard ring, or the owning element's inner edge. A hit bloom is allowed only inside the pad that fired, via `--audle-glow` or the source hue at low alpha, and never bleeds onto the page. Colour never stands alone: pair it with an icon, label, line treatment, shape, or ARIA state.
- In Arrange, loop is ultraviolet, one-shot is electric cyan, selection is hot coral, playback is mint, and recording/error is warm red. Play's sixteen sound objects each use their `--audle-source-N` hue, confined to their glyph, active edge, flash ring and meter; a role's pair shares a hue family and a glyph.
- Role controls stay dark at rest. Selection preserves loop or hit identity and adds a coral dashed ring.
- Use `--audle-text` for primary text and `--audle-text-muted` only for secondary metadata on dark surfaces.
- Focus is a 3px visible ring.
- Motion uses only transform, opacity and custom properties. Press is a quick compression (`--motion-press`); release and pop-in may use a low-bounce spring (damping ≥ 20, no visible overshoot past ~3%) or an ease-out-quint fallback. No elastic or high-bounce easing. Beat and hit motion follow the audio transport through `Tone.getDraw`, never a timer.
- The sound field and pad bank may enter with a diagonal stagger once per page load; nothing else animates on load.
- Depth comes from the inset deck-edge and control tokens only. No drop shadows or blur halos on panels, cards or docks.
- Icons come from the shared 16px stroke set (`Icon.svelte`); text glyphs and emoji never stand in for icons.
- With reduced motion, preserve every static state cue (pressed contact shadow, active ring, lit meter) while removing compression, entrances, hit flashes, beat pulsing, and playhead sweeps.

## Layout

Two surfaces and one sheet. Play is the entry: an 8×2 sound field on desktop and tablet, 4×4 on phone, the selected sound's feels, offset and pattern strip beneath it, and a footer with Play, Record a take, Share and Arrange. Arrange retains the 300px pad bank, flexible precision timeline, and 260px tuning deck on desktop, with the transport and selection actions pinned to the bottom of the deck at every width; phone and tablet put the timeline first with the pad bank as a horizontal strip beneath it. The share sheet, opened from either surface, holds the loop and take links, WAV downloads, and loops shared to this device. Help is a header icon that starts the guided remix; a shared link lands on the shared player, which can be remixed into the maker's own draft.

## Components

Sound objects, pads, timeline clips, transport controls, knobs, gallery rows, and notices are tactile dark surfaces with hard structural separators. Each object pairs its shape, number, label, role, and active state; a queued state says “Next bar.” The Play pattern strip keeps precision editing optional. Arrange's starter action is “Remix today’s starter”; voice cloning is “Add a layer”; repeat is “Fill the loop”; local favorite is “Your pick”; a shared loop offers “Remix this”. The one thing a maker tunes is a “sound” everywhere, never a voice or a track in copy.
