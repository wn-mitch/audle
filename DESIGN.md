# Design

## System

**Obsidian Signal Deck** is an opaque black-anodized music instrument. Blue-violet near-blacks form a quiet physical deck; role color is contained inside pads, clips, meters, and active edges. It is not a neon-club page, retro handheld, or toy.

## Color tokens

```css
:root {
  --audle-page: oklch(0.095 0.012 255);
  --audle-deck: oklch(0.145 0.014 255);
  --audle-deck-raised: oklch(0.19 0.016 255);
  --audle-well: oklch(0.072 0.01 255);
  --audle-text: oklch(0.935 0.012 255);
  --audle-text-muted: oklch(0.715 0.018 255);
  --audle-control: oklch(0.232 0.018 255);
  --audle-control-hover: oklch(0.27 0.02 255);
  --audle-control-pressed: oklch(0.158 0.015 255);
  --audle-loop-surface: oklch(0.23 0.055 302);
  --audle-loop-light: oklch(0.72 0.18 302);
  --audle-one-shot-surface: oklch(0.24 0.05 215);
  --audle-one-shot-light: oklch(0.78 0.14 215);
  --audle-selection-surface: oklch(0.25 0.06 28);
  --audle-selection-light: oklch(0.73 0.18 28);
  --audle-playback-surface: oklch(0.24 0.055 132);
  --audle-playback-light: oklch(0.82 0.16 132);
  --audle-record-surface: oklch(0.24 0.06 31);
  --audle-record-light: oklch(0.67 0.2 31);
  --audle-focus: oklch(0.83 0.125 260);
}
```

## Rules

- Use solid fills only. No gradients, glass, chrome, colored page fog, external neon halos, beige/brown surfaces, retro bezels, or toy offset shadows.
- Bright role color must be clipped to a glyph, waveform, meter, hard ring, or owning element's inner edge. Color never stands alone: pair it with an icon, label, line treatment, shape, or ARIA state.
- In Arrange, loop is ultraviolet, one-shot is electric cyan, selection is hot coral, playback is acid lime, and recording/error is warm red. Play's eight sound objects each have a restrained identifying hue, confined to their glyph and active edge.
- Role controls stay dark at rest. Selection preserves loop or hit identity and adds a coral dashed ring.
- Use `--audle-text` for primary text and `--audle-text-muted` only for secondary metadata on dark surfaces.
- Focus is a 3px visible ring. Motion uses only transform and opacity with quick compression and ease-out-quint release, never bounce or elastic easing. Beat motion follows the audio transport.
- With reduced motion, preserve all static state cues while removing compression, entrances, beat pulsing, and ruler sweeps.

## Layout

Play is the entry surface: a 4×2 sound field on desktop and tablet, 2×4 on phone, with the selected sound's pattern strip and optional tuning beneath it. Arrange retains the 300px pad bank, flexible precision timeline, and 260px tuning deck on desktop; phone and tablet stack the pad bank above the scrollable timeline, use sticky lane labels, put tuning inline, and pin transport above the safe area. Finish separates the editable loop and captured take into two panels that stack on phone.

## Components

Sound objects, pads, timeline clips, transport controls, knobs, gallery rows, and notices are tactile dark surfaces with hard structural separators. Each object pairs its shape, number, label, role, and active state; a queued state says “Next bar.” The Play pattern strip keeps precision editing optional. Arrange's starter action is “Remix today’s starter”; voice cloning is “Add a layer”; repeat is “Fill the loop”; local favorite is “Your pick”.
