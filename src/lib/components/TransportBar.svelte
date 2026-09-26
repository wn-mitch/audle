<script lang="ts">
  import { press } from '../motion';
  import Icon from './Icon.svelte';
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
      <Icon name={editor.playing ? 'stop' : 'play'} />
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
      <Icon name="record" />
      {editor.recording ? 'Recording' : 'Record'}
    </button>
    <div class="bars" role="group" aria-label="Loop length in bars">
      <span>Bars</span>
      <div class="segments">
        {#each [1, 2, 3, 4] as bars (bars)}
          <button
            type="button"
            aria-pressed={editor.composition.bars === bars}
            aria-label={`${bars} ${bars === 1 ? 'bar' : 'bars'}`}
            use:press
            onclick={() => editor.setBars(bars as 1 | 2 | 3 | 4)}>{bars}</button
          >
        {/each}
      </div>
    </div>
  </div>
  <div class="transport-secondary">
    <button aria-label="Undo" disabled={!editor.canUndo} type="button" onclick={() => editor.undo()}
      ><Icon name="undo" /> Undo</button
    >
    <button aria-label="Redo" disabled={!editor.canRedo} type="button" onclick={() => editor.redo()}
      ><Icon name="redo" /> Redo</button
    >
    <button class="share" type="button" use:press onclick={onShare}
      ><Icon name="share" /> Share</button
    >
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
  }
  .transport-main,
  .transport-secondary {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
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
  button:hover:not(:disabled) {
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
  button.record :global(.icon) {
    color: var(--audle-record-light);
  }
  button.share {
    border-color: var(--audle-accent-dim);
  }
  .bars {
    display: grid;
    gap: 2px;
    color: var(--audle-text-muted);
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .segments {
    display: flex;
  }
  .segments button {
    min-inline-size: 34px;
    min-block-size: 30px;
    padding-inline: 0;
    font-size: 0.85rem;
  }
  .segments button + button {
    border-inline-start: 0;
  }
  .segments button[aria-pressed='true'] {
    background: var(--audle-playback-surface);
    box-shadow:
      inset 0 0 0 1px var(--audle-playback-light),
      var(--audle-control-contact);
  }
  @media (max-width: 620px) {
    .transport {
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
