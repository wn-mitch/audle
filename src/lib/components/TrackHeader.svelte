<script lang="ts">
  import { sampleById } from '../data/samples';
  import { SOURCES_PER_DAY, type Track } from '../domain/model';
  import type { EditorState } from '../state/editor.svelte';
  import Icon from './Icon.svelte';

  let { editor, track, index }: { editor: EditorState; track: Track; index: number } = $props();
  const sample = $derived(sampleById(track.sampleId)!);
</script>

<div class:selected={editor.selectedTrackId === track.id} class="track-header">
  <button
    aria-label={`Select ${track.label}`}
    class="source"
    type="button"
    onclick={() => (editor.selectedTrackId = track.id)}
  >
    <span class="kind" class:hit={sample.kind !== 'loop'}
      ><Icon name={sample.kind === 'loop' ? 'loop' : 'hit'} size={14} /></span
    >
    <span>{index < SOURCES_PER_DAY ? sample.role : `Layer ${index - SOURCES_PER_DAY + 1}`}</span>
  </button>
  {#if editor.jamPicks[track.id]}
    <span class="jam-pick" title="Jev’s pick"
      ><Icon name="spark" size={10} /> {editor.jamPicks[track.id]}</span
    >
  {/if}
  <label>
    <span class="sr-only">Track label</span>
    <input
      aria-label={`Label for ${track.label}`}
      maxlength="24"
      value={track.label}
      onfocus={() => (editor.selectedTrackId = track.id)}
      onchange={(event) => editor.renameSelectedTrack(event.currentTarget.value)}
    />
  </label>
</div>

<style>
  .jam-pick {
    position: absolute;
    inset-block-end: 3px;
    inset-inline-start: 50px;
    color: var(--audle-loop-light);
    font-family: ui-monospace, monospace;
    font-size: 0.6rem;
    pointer-events: none;
  }
  .track-header {
    position: sticky;
    inset-inline-start: 0;
    z-index: 3;
    display: grid;
    grid-template-columns: 42px minmax(112px, 1fr);
    min-block-size: 56px;
    border-block-end: 1px solid var(--audle-grid-major);
    background: var(--audle-deck);
  }
  .track-header.selected {
    box-shadow: inset 2px 0 0 var(--audle-selection-light);
  }
  .source {
    display: grid;
    place-content: center;
    gap: 1px;
    border: 0;
    border-inline-end: 1px solid var(--audle-outline-subtle);
    background: transparent;
    color: var(--audle-text-muted);
    cursor: pointer;
    font-size: 0.65rem;
    text-transform: capitalize;
  }
  /* Loop and hit sources carry their own role colour, matching the clips they produce. */
  .kind {
    display: inline-flex;
    color: var(--audle-loop-light);
  }
  .kind.hit {
    color: var(--audle-one-shot-light);
  }
  label {
    display: grid;
    align-items: center;
    padding-inline: 8px;
  }
  input {
    inline-size: 100%;
    border: 0;
    background: transparent;
    color: var(--audle-text);
    font-size: 0.8rem;
    font-weight: 700;
    text-overflow: ellipsis;
  }
  .sr-only {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
</style>
