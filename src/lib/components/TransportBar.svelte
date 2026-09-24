<script lang="ts">
  import type { EditorState } from '../state/editor.svelte';

  let { editor, onShare }: { editor: EditorState; onShare: () => void } = $props();
</script>

<nav aria-label="Transport" class="transport">
  <div class="transport-main">
    <button
      aria-label={editor.playing ? 'Stop playback' : 'Play composition'}
      class:playing={editor.playing}
      class="play"
      disabled={editor.loading || Boolean(editor.loadingError)}
      type="button"
      onclick={() => void editor.togglePlayback()}
    >
      <span aria-hidden="true">{editor.playing ? '■' : '▶'}</span>
      {editor.playing ? 'Stop' : 'Play'}
    </button>
    <button
      aria-pressed={editor.recording}
      class:recording={editor.recording}
      class="record"
      disabled={editor.loading || Boolean(editor.loadingError)}
      type="button"
      onclick={() => void editor.toggleRecording()}
    >
      <span aria-hidden="true">●</span>
      {editor.recording ? 'Recording' : 'Record'}
    </button>
    <label>
      <span>Bars</span>
      <span class="select-wrap"
        ><select
          aria-label="Loop length in bars"
          value={editor.composition.bars}
          onchange={(event) => editor.setBars(Number(event.currentTarget.value) as 1 | 2 | 3 | 4)}
        >
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
          <option value={4}>4</option>
        </select></span
      >
    </label>
  </div>
  <div class="transport-secondary">
    <button aria-label="Undo" disabled={!editor.canUndo} type="button" onclick={() => editor.undo()}
      >↶ Undo</button
    >
    <button aria-label="Redo" disabled={!editor.canRedo} type="button" onclick={() => editor.redo()}
      >↷ Redo</button
    >
    <button class="share" type="button" onclick={onShare}>↗ Share</button>
  </div>
</nav>

<style>
  .transport {
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    gap: 10px;
    padding: 10px;
    background: var(--audle-deck);
    border-block-start: 1px solid var(--audle-outline);
    box-shadow: var(--audle-deck-edge);
  }
  .transport-main,
  .transport-secondary {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  button,
  select {
    min-block-size: 48px;
    border: 1px solid var(--audle-outline);
    background: var(--audle-control);
    box-shadow: var(--audle-control-rest);
    color: var(--audle-text);
    cursor: pointer;
    font-weight: 700;
  }
  button {
    padding-inline: 12px;
  }
  button:hover:not(:disabled),
  select:hover {
    background: var(--audle-control-hover);
  }
  button:disabled {
    background: var(--audle-disabled);
    color: var(--audle-disabled-ink);
    cursor: not-allowed;
  }
  button.play.playing {
    background: var(--audle-playback-surface);
    box-shadow:
      inset 0 0 0 1px var(--audle-playback-light),
      var(--audle-control-contact);
  }
  button.record.recording {
    background: var(--audle-record-surface);
    box-shadow:
      inset 0 0 0 1px var(--audle-record-light),
      var(--audle-control-contact);
  }
  button.record.recording span {
    color: var(--audle-record-light);
  }
  button.share {
    border-color: var(--audle-selection-light);
  }
  label {
    display: grid;
    gap: 2px;
    color: var(--audle-text-muted);
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  /* WebKit resolves inherited custom properties to empty on <select>, so the tokens carry literal fallbacks. */
  select {
    appearance: none;
    min-block-size: 30px;
    padding-inline: 8px 22px;
    background: var(--audle-control, oklch(0.232 0.018 255));
    color: var(--audle-text, oklch(0.935 0.012 255));
    color-scheme: dark;
    font-size: 0.85rem;
  }
  .select-wrap {
    position: relative;
    display: grid;
  }
  .select-wrap::after {
    content: '▾';
    position: absolute;
    inset-block: 0;
    inset-inline-end: 7px;
    display: grid;
    place-items: center;
    color: var(--audle-text-muted);
    pointer-events: none;
  }
  option {
    background: var(--audle-deck);
    color: var(--audle-text);
  }
  @media (max-width: 620px) {
    .transport {
      position: sticky;
      inset-block-end: env(safe-area-inset-bottom);
      z-index: 10;
      flex-wrap: wrap;
    }
    .transport-main,
    .transport-secondary {
      inline-size: 100%;
      justify-content: space-between;
    }
    .transport-secondary button {
      min-block-size: 44px;
      padding-inline: 8px;
    }
  }
</style>
