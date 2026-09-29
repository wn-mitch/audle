<script lang="ts">
  import { sampleById } from '../data/samples';
  import { SOURCES_PER_DAY, TICKS_PER_BAR, TICKS_PER_SIXTEENTH, type Track } from '../domain/model';
  import type { EditorState } from '../state/editor.svelte';
  import Icon from './Icon.svelte';

  let {
    editor,
    track,
    index,
    onKeyboardSeek,
  }: { editor: EditorState; track: Track; index: number; onKeyboardSeek: () => void } = $props();
  const sample = $derived(sampleById(track.sampleId)!);
  const sourceIndex = $derived(editor.challenge.sampleIds.indexOf(track.sampleId));
</script>

<div
  class="track-header sticky left-0 z-[3] grid min-h-14 grid-cols-[42px_minmax(112px,1fr)] border-b border-audle-grid-major bg-audle-deck"
  class:selected={editor.selectedTrackId === track.id}
  class:source-known={sourceIndex >= 0}
>
  <button
    aria-label={`Select ${track.label}`}
    aria-describedby="timeline-keyboard-instructions timeline-keyboard-position"
    class="source grid cursor-pointer content-center gap-px border-0 border-r border-audle-outline-subtle bg-transparent text-[0.65rem] capitalize text-audle-text-muted"
    type="button"
    onclick={() => (editor.selectedTrackId = track.id)}
    onkeydown={(event) => {
      const tick =
        event.key === 'ArrowLeft'
          ? editor.playheadTick - TICKS_PER_SIXTEENTH
          : event.key === 'ArrowRight'
            ? editor.playheadTick + TICKS_PER_SIXTEENTH
            : event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? editor.composition.bars * TICKS_PER_BAR - TICKS_PER_SIXTEENTH
                : undefined;
      if (tick !== undefined) {
        event.preventDefault();
        editor.setPlayhead(tick);
        onKeyboardSeek();
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        editor.placeAt(track.id, editor.playheadTick);
      }
    }}
  >
    {#if sourceIndex >= 0}
      <span class="source-number font-mono font-bold"
        >{String(sourceIndex + 1).padStart(2, '0')}</span
      >
    {/if}
    <span class="kind inline-flex text-audle-loop-light" class:hit={sample.kind !== 'loop'}
      ><Icon name={sample.kind === 'loop' ? 'loop' : 'hit'} size={14} /></span
    >
    <span class="source-label"
      >{index < SOURCES_PER_DAY ? sample.role : `Layer ${index - SOURCES_PER_DAY + 1}`}</span
    >
  </button>
  {#if editor.jamPicks[track.id]}
    <span
      class="jam-pick pointer-events-none absolute bottom-[3px] left-[50px] font-mono text-[0.6rem] text-audle-loop-light"
      title="Jev’s pick"><Icon name="spark" size={10} /> {editor.jamPicks[track.id]}</span
    >
  {/if}
  <label class="grid items-center px-2">
    <span class="sr-only">Track label</span>
    <input
      aria-label={`Label for ${track.label}`}
      class="w-full border-0 bg-transparent text-[0.8rem] font-bold text-audle-text text-ellipsis"
      maxlength="24"
      value={track.label}
      onfocus={() => (editor.selectedTrackId = track.id)}
      onchange={(event) => editor.renameSelectedTrack(event.currentTarget.value)}
    />
  </label>
</div>

<style>
  .track-header.selected {
    box-shadow: inset 2px 0 0 var(--audle-selection-light);
  }

  .kind.hit {
    color: var(--audle-one-shot-light);
  }

  .track-header.source-known .kind,
  .track-header.source-known .source-number {
    color: oklch(var(--source));
  }
</style>
