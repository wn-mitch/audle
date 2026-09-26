<script lang="ts">
  import type { EditorState } from '../state/editor.svelte';
  import Knob from './Knob.svelte';
  import { SOURCES_PER_DAY } from '../domain/model';

  let { editor }: { editor: EditorState } = $props();
  const track = $derived(editor.selectedTrack);
  const filterPosition = $derived(
    track ? (Math.log(track.controls.cutoffHz / 200) / Math.log(18000 / 200)) * 100 : 100,
  );

  const changeControls = (next: Partial<NonNullable<typeof track>['controls']>) => {
    if (track) editor.updateSelectedTrackControls({ ...track.controls, ...next });
  };
</script>

<section class="tuning" aria-labelledby="tuning-title">
  <div class="section-heading">
    <p>Selected sound</p>
    <h2 id="tuning-title">{track?.label ?? 'Pick a sound'}</h2>
  </div>
  {#if track}
    <div class="knobs">
      <Knob
        label="Gain"
        min={-24}
        max={6}
        step={0.5}
        value={track.controls.gainDb}
        valueText={`${track.controls.gainDb.toFixed(1)} dB`}
        onStart={() => editor.beginControlGesture()}
        onChange={(value) => changeControls({ gainDb: value })}
        onEnd={() => editor.endControlGesture()}
      />
      <Knob
        label="Pan"
        min={-1}
        max={1}
        step={0.05}
        value={track.controls.pan}
        valueText={track.controls.pan.toFixed(2)}
        onStart={() => editor.beginControlGesture()}
        onChange={(value) => changeControls({ pan: value })}
        onEnd={() => editor.endControlGesture()}
      />
      <Knob
        label="Tune"
        min={-12}
        max={12}
        step={1}
        value={track.controls.tuneSemitones}
        valueText={`${track.controls.tuneSemitones > 0 ? '+' : ''}${track.controls.tuneSemitones} st`}
        onStart={() => editor.beginControlGesture()}
        onChange={(value) => changeControls({ tuneSemitones: value })}
        onEnd={() => editor.endControlGesture()}
      />
      <Knob
        label="Filter"
        min={0}
        max={100}
        step={1}
        value={filterPosition}
        valueText={`${Math.round(track.controls.cutoffHz)} Hz`}
        onStart={() => editor.beginControlGesture()}
        onChange={(value) =>
          changeControls({ cutoffHz: Math.round(200 * (18000 / 200) ** (value / 100)) })}
        onEnd={() => editor.endControlGesture()}
      />
    </div>
    <div class="toggles">
      <button
        aria-pressed={track.controls.muted}
        class:active={track.controls.muted}
        type="button"
        onclick={() => {
          editor.beginControlGesture();
          changeControls({ muted: !track.controls.muted });
          editor.endControlGesture();
        }}>M Mute</button
      >
      <button
        aria-pressed={track.controls.solo}
        class:active={track.controls.solo}
        type="button"
        onclick={() => {
          editor.beginControlGesture();
          changeControls({ solo: !track.controls.solo });
          editor.endControlGesture();
        }}>S Solo</button
      >
      {#if editor.composition.tracks.indexOf(track) >= SOURCES_PER_DAY}
        <button class="delete" type="button" onclick={() => editor.deleteSelectedLayer()}
          >Delete layer</button
        >
      {/if}
    </div>
  {:else}
    <p class="empty">Tap a clip or lane to tune that sound.</p>
  {/if}
</section>

<style>
  .tuning {
    display: grid;
    align-content: start;
    gap: 14px;
    min-block-size: 0;
    padding: 16px;
    background: var(--audle-deck-raised);
    box-shadow: var(--audle-deck-edge);
  }
  .section-heading p {
    margin: 0 0 4px;
    color: var(--audle-text-muted);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  h2 {
    margin: 0;
    font-size: 1.1rem;
  }
  .knobs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .toggles {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  button {
    min-block-size: 44px;
    padding: 8px;
    border: 1px solid var(--audle-outline);
    background: var(--audle-control);
    box-shadow: var(--audle-control-rest);
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 700;
  }
  button:hover {
    background: var(--audle-control-hover);
  }
  button.active {
    background: var(--audle-control-pressed);
    box-shadow:
      var(--audle-control-contact),
      inset 0 0 0 1px var(--audle-playback-light);
  }
  button.delete {
    grid-column: 1 / -1;
    color: var(--audle-record-light);
  }
  .empty {
    margin: 0;
    color: var(--audle-text-muted);
    font-size: 0.875rem;
  }
</style>
