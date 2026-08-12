<script lang="ts">
  import type { EditorState } from '../state/editor.svelte';

  let { editor }: { editor: EditorState } = $props();
  const selected = $derived(editor.selectedClips);
  const hasSelection = $derived(selected.length > 0);
  const canSplit = $derived(
    hasSelection && selected.every((clip) => clip.kind === 'loop' && editor.playheadTick > clip.startTick && editor.playheadTick < clip.startTick + clip.lengthTicks),
  );
  const canRoll = $derived(hasSelection && selected.every((clip) => clip.kind === 'hit'));



</script>

<section aria-label="Selection actions" class="actions">
  <div class="selection-status">
    <span aria-hidden="true">⌗</span>
    <strong>{selected.length ? `${selected.length} selected` : 'No selection'}</strong>
  </div>
  <div class="action-buttons">
    <button disabled={!hasSelection} title="Duplicate selected clips once" type="button" onclick={() => editor.duplicateSelection()}>Duplicate</button>
    <button disabled={!hasSelection} title="Fill the loop with full copies" type="button" onclick={() => editor.fillSelection()}>Fill the loop</button>
    <button disabled={!canSplit} title={canSplit ? 'Split at playhead' : 'Place the playhead inside selected loop clips.'} type="button" onclick={() => editor.splitSelection()}>Split</button>
    <button disabled={!hasSelection} type="button" onclick={() => editor.nudgeSelection(-1)}>← Nudge</button>
    <button disabled={!hasSelection} type="button" onclick={() => editor.nudgeSelection(1)}>Nudge →</button>
    <button disabled={!hasSelection} type="button" onclick={() => editor.deleteSelection()}>Delete</button>
  </div>
  <div class="rolls" aria-label="Hit roll density">
    {#each [1, 2, 3, 4] as ratchet (ratchet)}
      <button aria-pressed={selected.length > 0 && selected.every((clip) => clip.kind === 'hit' && clip.ratchet === ratchet)} disabled={!canRoll} type="button" onclick={() => editor.setRoll(ratchet as 1 | 2 | 3 | 4)}>Roll ×{ratchet}</button>
    {/each}
    <button class="layer" disabled={!editor.selectedTrack} type="button" onclick={() => editor.addLayer()}>+ Add a layer</button>
  </div>
</section>

<style>
  .actions { display: grid; gap: 8px; padding: 10px 14px; background: var(--audle-deck-raised); border-block-start: 1px solid var(--audle-outline); }
  .selection-status { display: flex; align-items: center; gap: 6px; color: var(--audle-text-muted); font-size: 0.76rem; }
  .selection-status span { color: var(--audle-selection-light); font-size: 1rem; }
  .action-buttons, .rolls { display: flex; flex-wrap: wrap; gap: 6px; }
  button { min-block-size: 44px; padding-inline: 10px; border: 1px solid var(--audle-outline); background: var(--audle-control); box-shadow: var(--audle-control-rest); color: var(--audle-text); cursor: pointer; font-size: 0.75rem; font-weight: 700; }
  button:hover:not(:disabled), button[aria-pressed="true"] { background: var(--audle-selection-surface); border-color: var(--audle-selection-light); }
  button:disabled { background: var(--audle-disabled); color: var(--audle-disabled-ink); cursor: not-allowed; }
  .layer { margin-inline-start: auto; border-color: var(--audle-loop-light); }
</style>
