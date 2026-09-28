# Audle guidance

- Play’s sixteen sounds are the performance field, not a dashboard or an editable second sequencer.
- Keep selected-sound controls visible but compact: Hear it and Solo share a row, with six dials for Level, Pan, Tune, Space, Echo, and Fuzz. Decoded-source seconds and source bars differ from the arrangement length.
- Graphite is structural, source hue identifies sounds and their selected controls, and mint marks playback and focus. Preserve Arrange’s existing role colours.
- Keep exact clip editing in Arrange. Play’s pad strips show actual clip starts and played spans across the arrangement, with an expanded strip only on the selected pad. Active pads draw their own isolated post-gain waveforms around the glyph; never copy the whole mix to individual pads or add a duplicate performer.
- Pad flashes, waveform halos, and timing-mark accents follow the owning track’s `EditorState.subscribeHits` event through `Tone.getDraw`; waveform samples come from `trackWaveform(trackId)`. The pad playhead follows the transport. No simulated idle audio activity.
- Preserve keyboard operation, reduced-motion static cues, 48px primary targets, and 44px compact controls.
- `DESIGN.md` and `PRODUCT.md` own product and visual principles.
- Before shipping UI work, run `just verify` and inspect the browser at desktop and phone sizes.
