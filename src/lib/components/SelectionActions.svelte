<script lang="ts">
  import type { EditorState } from '../state/editor.svelte';
  import { TICKS_PER_BAR, TICKS_PER_SIXTEENTH } from '../domain/model';
  import Icon from './Icon.svelte';

  let { editor }: { editor: EditorState } = $props();
  const selected = $derived(editor.selectedClips);
  const hasSelection = $derived(selected.length > 0);
  const selectedLoop = $derived(
    selected.length === 1 && selected[0]?.kind === 'loop' ? selected[0] : undefined,
  );
  const canSplit = $derived(
    hasSelection &&
      selected.every(
        (clip) =>
          clip.kind === 'loop' &&
          editor.playheadTick > clip.startTick &&
          editor.playheadTick < clip.startTick + clip.lengthTicks,
      ),
  );
  const canRoll = $derived(hasSelection && selected.every((clip) => clip.kind === 'hit'));
  /** Why a greyed action is greyed, so the precondition is visible without hovering. */
  const hint = $derived(
    !hasSelection
      ? 'Click a clip, drag across several, or long-press on a phone to select.'
      : !canSplit && !canRoll
        ? 'Split needs the playhead inside a selected loop. Roll applies to hits.'
        : !canSplit
          ? 'Split needs the playhead inside a selected loop.'
          : !canRoll
            ? 'Roll applies to hits.'
            : '',
  );
</script>

<section
  aria-label="Selection actions"
  class="actions grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 border-t border-audle-outline bg-audle-deck-raised px-3.5 py-2.5 max-[959px]:grid-cols-1 max-[959px]:gap-1.5 max-[959px]:px-2.5 max-[959px]:py-2"
>
  <div
    class="selection-status col-span-full flex items-center gap-1.5 text-[0.76rem] text-audle-text-muted"
  >
    <strong>{selected.length ? `${selected.length} selected` : 'No selection'}</strong>
    {#if hint}<span class="hint ml-1.5 text-audle-text-dim max-[959px]:hidden">{hint}</span>{/if}
  </div>
  {#if hasSelection}
    <div
      class="action-buttons flex flex-wrap gap-1.5 max-[959px]:flex-nowrap max-[959px]:overflow-x-auto max-[959px]:overscroll-x-contain max-[959px]:pb-0.5"
    >
      <button
        class="inline-flex min-h-11 items-center gap-1.5 border border-audle-outline bg-audle-control px-2.5 text-[0.75rem] font-bold text-audle-text shadow-[var(--audle-control-rest)] hover:enabled:bg-audle-selection-surface hover:enabled:border-audle-selection-light disabled:cursor-not-allowed disabled:bg-audle-disabled disabled:text-audle-disabled-ink max-[959px]:shrink-0"
        disabled={!hasSelection}
        title="Duplicate selected clips once"
        type="button"
        onclick={() => editor.duplicateSelection()}>Duplicate</button
      >
      <button
        class="inline-flex min-h-11 items-center gap-1.5 border border-audle-outline bg-audle-control px-2.5 text-[0.75rem] font-bold text-audle-text shadow-[var(--audle-control-rest)] hover:enabled:bg-audle-selection-surface hover:enabled:border-audle-selection-light disabled:cursor-not-allowed disabled:bg-audle-disabled disabled:text-audle-disabled-ink max-[959px]:shrink-0"
        disabled={!hasSelection}
        title="Fill the loop with full copies"
        type="button"
        onclick={() => editor.fillSelection()}>Fill the loop</button
      >
      <button
        class="inline-flex min-h-11 items-center gap-1.5 border border-audle-outline bg-audle-control px-2.5 text-[0.75rem] font-bold text-audle-text shadow-[var(--audle-control-rest)] hover:enabled:bg-audle-selection-surface hover:enabled:border-audle-selection-light disabled:cursor-not-allowed disabled:bg-audle-disabled disabled:text-audle-disabled-ink max-[959px]:shrink-0"
        disabled={!canSplit}
        title={canSplit ? 'Split at playhead' : 'Place the playhead inside selected loop clips.'}
        type="button"
        onclick={() => editor.splitSelection()}>Split</button
      >
      <button
        class="inline-flex min-h-11 items-center gap-1.5 border border-audle-outline bg-audle-control px-2.5 text-[0.75rem] font-bold text-audle-text shadow-[var(--audle-control-rest)] hover:enabled:bg-audle-selection-surface hover:enabled:border-audle-selection-light disabled:cursor-not-allowed disabled:bg-audle-disabled disabled:text-audle-disabled-ink max-[959px]:shrink-0"
        aria-label="Nudge selected clips one step earlier"
        disabled={!hasSelection}
        type="button"
        onclick={() => editor.nudgeSelection(-1)}><Icon name="arrow-left" /> Nudge</button
      >
      <button
        class="inline-flex min-h-11 items-center gap-1.5 border border-audle-outline bg-audle-control px-2.5 text-[0.75rem] font-bold text-audle-text shadow-[var(--audle-control-rest)] hover:enabled:bg-audle-selection-surface hover:enabled:border-audle-selection-light disabled:cursor-not-allowed disabled:bg-audle-disabled disabled:text-audle-disabled-ink max-[959px]:shrink-0"
        aria-label="Nudge selected clips one step later"
        disabled={!hasSelection}
        type="button"
        onclick={() => editor.nudgeSelection(1)}>Nudge <Icon name="arrow-right" /></button
      >
      {#if selectedLoop}
        <button
          class="inline-flex min-h-11 min-w-11 items-center justify-center border border-audle-outline bg-audle-control px-2.5 text-[0.75rem] font-bold text-audle-text shadow-[var(--audle-control-rest)] disabled:cursor-not-allowed disabled:bg-audle-disabled disabled:text-audle-disabled-ink max-[959px]:shrink-0"
          disabled={selectedLoop.lengthTicks <= TICKS_PER_SIXTEENTH}
          type="button"
          onclick={() =>
            editor.resizeSelectedLoop(
              selectedLoop.id,
              selectedLoop.lengthTicks - TICKS_PER_SIXTEENTH,
            )}>Shorten</button
        >
        <button
          class="inline-flex min-h-11 min-w-11 items-center justify-center border border-audle-outline bg-audle-control px-2.5 text-[0.75rem] font-bold text-audle-text shadow-[var(--audle-control-rest)] disabled:cursor-not-allowed disabled:bg-audle-disabled disabled:text-audle-disabled-ink max-[959px]:shrink-0"
          disabled={selectedLoop.startTick + selectedLoop.lengthTicks + TICKS_PER_SIXTEENTH >
            editor.composition.bars * TICKS_PER_BAR}
          type="button"
          onclick={() =>
            editor.resizeSelectedLoop(
              selectedLoop.id,
              selectedLoop.lengthTicks + TICKS_PER_SIXTEENTH,
            )}>Lengthen</button
        >
      {/if}
      <button
        class="inline-flex min-h-11 items-center gap-1.5 border border-audle-outline bg-audle-control px-2.5 text-[0.75rem] font-bold text-audle-text shadow-[var(--audle-control-rest)] hover:enabled:bg-audle-selection-surface hover:enabled:border-audle-selection-light disabled:cursor-not-allowed disabled:bg-audle-disabled disabled:text-audle-disabled-ink max-[959px]:shrink-0"
        disabled={!hasSelection}
        type="button"
        onclick={() => editor.deleteSelection()}>Delete</button
      >
      {#if canRoll}
        <span
          class="rolls ml-1.5 flex flex-wrap gap-1.5 border-l border-audle-outline-subtle pl-2 max-[959px]:flex-nowrap"
          role="group"
          aria-label="Hit roll density"
        >
          {#each [1, 2, 3, 4] as ratchet (ratchet)}
            <button
              class="inline-flex min-h-11 items-center gap-1.5 border border-audle-outline bg-audle-control px-2.5 text-[0.75rem] font-bold text-audle-text shadow-[var(--audle-control-rest)] hover:enabled:bg-audle-selection-surface hover:enabled:border-audle-selection-light disabled:cursor-not-allowed disabled:bg-audle-disabled disabled:text-audle-disabled-ink max-[959px]:shrink-0"
              aria-pressed={selected.every(
                (clip) => clip.kind === 'hit' && clip.ratchet === ratchet,
              )}
              type="button"
              onclick={() => editor.setRoll(ratchet as 1 | 2 | 3 | 4)}>Roll ×{ratchet}</button
            >
          {/each}
        </span>
      {/if}
    </div>
  {/if}
  <div class="track-actions col-start-2 row-start-2 max-[959px]:col-start-1 max-[959px]:row-auto">
    <button
      class="layer inline-flex min-h-11 items-center gap-1.5 border border-audle-loop-light bg-audle-control px-2.5 text-[0.75rem] font-bold text-audle-text shadow-[var(--audle-control-rest)] hover:enabled:bg-audle-selection-surface hover:enabled:border-audle-selection-light disabled:cursor-not-allowed disabled:bg-audle-disabled disabled:text-audle-disabled-ink"
      disabled={!editor.selectedTrack}
      title="Clone the selected sound as an independent layer"
      type="button"
      onclick={() => editor.addLayer()}>Add a layer</button
    >
  </div>
</section>

<style>
  .rolls button[aria-pressed='true'] {
    background: var(--audle-selection-surface);
    border-color: var(--audle-selection-light);
  }
</style>
