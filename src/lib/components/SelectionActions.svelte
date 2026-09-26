<script lang="ts">
  import type { EditorState } from '../state/editor.svelte';
  import Icon from './Icon.svelte';

  let { editor }: { editor: EditorState } = $props();
  const selected = $derived(editor.selectedClips);
  const hasSelection = $derived(selected.length > 0);
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

<section aria-label="Selection actions" class="actions">
  <div class="selection-status">
    <strong>{selected.length ? `${selected.length} selected` : 'No selection'}</strong>
    {#if hint}<span class="hint">{hint}</span>{/if}
  </div>
  {#if hasSelection}
    <div class="action-buttons">
      <button
        disabled={!hasSelection}
        title="Duplicate selected clips once"
        type="button"
        onclick={() => editor.duplicateSelection()}>Duplicate</button
      >
      <button
        disabled={!hasSelection}
        title="Fill the loop with full copies"
        type="button"
        onclick={() => editor.fillSelection()}>Fill the loop</button
      >
      <button
        disabled={!canSplit}
        title={canSplit ? 'Split at playhead' : 'Place the playhead inside selected loop clips.'}
        type="button"
        onclick={() => editor.splitSelection()}>Split</button
      >
      <button disabled={!hasSelection} type="button" onclick={() => editor.nudgeSelection(-1)}
        ><Icon name="arrow-left" /> Nudge</button
      >
      <button disabled={!hasSelection} type="button" onclick={() => editor.nudgeSelection(1)}
        >Nudge <Icon name="arrow-right" /></button
      >
      <button disabled={!hasSelection} type="button" onclick={() => editor.deleteSelection()}
        >Delete</button
      >
      {#if canRoll}
        <span class="rolls" role="group" aria-label="Hit roll density">
          {#each [1, 2, 3, 4] as ratchet (ratchet)}
            <button
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
  <div class="track-actions">
    <button
      class="layer"
      disabled={!editor.selectedTrack}
      title="Clone the selected sound as an independent layer"
      type="button"
      onclick={() => editor.addLayer()}>Add a layer</button
    >
  </div>
</section>

<style>
  .actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 8px;
    padding: 10px 14px;
    background: var(--audle-deck-raised);
    border-block-start: 1px solid var(--audle-outline);
  }
  .selection-status {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--audle-text-muted);
    font-size: 0.76rem;
  }
  .hint {
    margin-inline-start: 6px;
    color: var(--audle-text-dim);
  }
  .selection-status {
    grid-column: 1 / -1;
  }
  .action-buttons,
  .rolls {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .rolls {
    margin-inline-start: 6px;
    padding-inline-start: 8px;
    border-inline-start: 1px solid var(--audle-outline-subtle);
  }
  .track-actions {
    grid-column: 2;
    grid-row: 2;
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-block-size: 44px;
    padding-inline: 10px;
    border: 1px solid var(--audle-outline);
    background: var(--audle-control);
    box-shadow: var(--audle-control-rest);
    color: var(--audle-text);
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 700;
  }
  button:hover:not(:disabled),
  button[aria-pressed='true'] {
    background: var(--audle-selection-surface);
    border-color: var(--audle-selection-light);
  }
  button:disabled {
    background: var(--audle-disabled);
    color: var(--audle-disabled-ink);
    cursor: not-allowed;
  }
  .layer {
    border-color: var(--audle-loop-light);
  }
  /* On a phone the rows scroll sideways so the dock stays a couple of lines tall. */
  @media (max-width: 959px) {
    .actions {
      grid-template-columns: minmax(0, 1fr);
      gap: 6px;
      padding: 8px 10px;
    }
    .action-buttons {
      flex-wrap: nowrap;
      overflow-x: auto;
      overscroll-behavior-x: contain;
      padding-block-end: 2px;
    }
    .action-buttons button {
      flex: none;
    }
    .rolls {
      flex-wrap: nowrap;
    }
    .track-actions {
      grid-column: 1;
      grid-row: auto;
    }
    .selection-status .hint {
      display: none;
    }
  }
</style>
