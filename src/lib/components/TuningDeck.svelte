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

<section
  class="grid min-h-0 content-start gap-3.5 bg-audle-deck-raised p-4 shadow-[var(--audle-deck-edge)]"
  aria-labelledby="tuning-title"
>
  <div class="section-heading">
    <p class="mb-1 text-[0.7rem] font-bold tracking-[0.1em] text-audle-text-muted uppercase">
      Selected sound
    </p>
    <h2 class="m-0 text-[1.1rem]" id="tuning-title">{track?.label ?? 'Pick a sound'}</h2>
  </div>
  {#if track}
    <div class="knobs grid grid-cols-2 gap-2">
      <Knob
        label="Level"
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
        valueText={!track.controls.pan
          ? 'CENTER'
          : `${track.controls.pan < 0 ? 'LEFT' : 'RIGHT'} ${Math.round(Math.abs(track.controls.pan) * 100)}`}
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
        valueText={!track.controls.tuneSemitones
          ? 'ORIGINAL'
          : `${track.controls.tuneSemitones > 0 ? '+' : '−'}${Math.abs(track.controls.tuneSemitones)} ${Math.abs(track.controls.tuneSemitones) === 1 ? 'STEP' : 'STEPS'}`}
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
    <div class="toggles grid grid-cols-2 gap-2">
      <button
        class="min-h-11 cursor-pointer border border-audle-outline bg-audle-control p-2 text-[0.75rem] font-bold shadow-[var(--audle-control-rest)] hover:bg-audle-control-hover"
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
        class="min-h-11 cursor-pointer border border-audle-outline bg-audle-control p-2 text-[0.75rem] font-bold shadow-[var(--audle-control-rest)] hover:bg-audle-control-hover"
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
        <button
          class="delete col-span-full min-h-11 cursor-pointer border border-audle-outline bg-audle-control p-2 text-[0.75rem] font-bold text-audle-record-light shadow-[var(--audle-control-rest)] hover:bg-audle-control-hover"
          type="button"
          onclick={() => editor.deleteSelectedLayer()}>Delete layer</button
        >
      {/if}
    </div>
  {:else}
    <p class="empty m-0 text-[0.875rem] text-audle-text-muted">
      Tap a clip or lane to tune that sound.
    </p>
  {/if}
</section>

<style>
  button.active {
    background: var(--audle-control-pressed);
    box-shadow:
      var(--audle-control-contact),
      inset 0 0 0 1px var(--audle-playback-light);
  }
</style>
