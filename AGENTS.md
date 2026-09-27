# Audle guidance

- Play’s sixteen sounds are the performance field, not a dashboard or a second sequencer.
- Keep selected-sound controls visible but compact. Decoded-source seconds describe a sample; they are distinct from the four-bar composition length.
- Graphite is structural, source hue identifies sounds and their selected controls, and mint marks playback and focus. Preserve Arrange’s existing role colours.
- Keep exact clip editing in Arrange. Do not add a waveform, pattern grid, duplicate performer, or whole-mix display to Play.
- Pad hit flashes follow `EditorState.subscribeHits` through `Tone.getDraw`; the transport beat pulse follows playback. Do not simulate idle audio activity.
- Preserve keyboard operation, reduced-motion static cues, 48px primary targets, and 44px compact controls.
- `DESIGN.md` and `PRODUCT.md` own product and visual principles.
- Before shipping UI work, run `just verify` and inspect the browser at desktop and phone sizes.
