<script lang="ts">
  import { sampleById } from '../data/samples';
  import type { ChallengeSnapshot } from '../domain/model';
  import type { EditorState } from '../state/editor.svelte';

  let { challenge, editor }: { challenge: ChallengeSnapshot; editor: EditorState } = $props();
</script>

<section aria-label="Today’s eight sounds" class="pad-bank" aria-busy={editor.loading}>
  <header>
    <p>Today’s source deck</p>
    <span>{editor.loading ? 'Decoding sounds' : 'Tap any sound'}</span>
  </header>
  <div class="pads">
    {#each challenge.sampleIds as sampleId (sampleId)}
      {@const sample = sampleById(sampleId)!}
      {@const selected = editor.selectedTrack?.sampleId === sampleId}
      <button
        aria-pressed={selected}
        class:loop={sample.kind === 'loop'}
        class:selected
        class:skeleton={editor.loading}
        class="pad"
        disabled={editor.loading || Boolean(editor.loadingError)}
        type="button"
        onpointerdown={(event) => {
          event.preventDefault();
          event.currentTarget.focus();
          editor.pressPad(sampleId);
        }}
        onkeydown={(event) => {
          if (!event.repeat && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            editor.pressPad(sampleId);
          }
        }}
      >
        <span aria-hidden="true" class="pad-glyph">{sample.kind === 'loop' ? '↻' : '●'}</span>
        <span class="pad-name">{editor.loading ? 'Loading' : sample.label}</span>
        <span class="pad-kind">{sample.kind === 'loop' ? 'Loop' : 'Hit'}</span>
      </button>
    {/each}
  </div>
  {#if editor.loadingError}
    <div class="load-error" role="alert">
      <span
        >! {editor.failedSampleId ? sampleById(editor.failedSampleId)?.label : 'A daily sound'} failed
        to load.</span
      >
      <button type="button" onclick={() => editor.retryAudio()}>Retry</button>
    </div>
  {/if}
</section>

<style>
  .pad-bank {
    display: grid;
    align-content: start;
    gap: 10px;
    min-inline-size: 0;
    padding: 14px;
    background: var(--audle-deck-raised);
    box-shadow: var(--audle-deck-edge);
  }
  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  header p {
    margin: 0;
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  header span {
    color: var(--audle-text-muted);
    font-size: 0.75rem;
  }
  .pads {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .pad {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 2px 8px;
    min-block-size: 68px;
    padding: 10px;
    overflow: hidden;
    border: 1px solid var(--audle-one-shot-light);
    background: var(--audle-one-shot-surface);
    box-shadow:
      inset 0 0 0 1px var(--audle-one-shot-light),
      var(--audle-control-rest);
    color: var(--audle-text);
    cursor: pointer;
    text-align: start;
    touch-action: manipulation;
    transition:
      transform 90ms ease-out,
      background 100ms ease-out;
  }
  .pad.loop {
    border-color: var(--audle-loop-light);
    background: var(--audle-loop-surface);
    box-shadow:
      inset 0 0 0 1px var(--audle-loop-light),
      var(--audle-control-rest);
  }
  .pad:hover:not(:disabled) {
    background: var(--audle-control-hover);
  }
  .pad:active:not(:disabled) {
    transform: translateY(3px) scale(0.96);
    box-shadow: var(--audle-control-contact);
  }
  .pad.selected {
    outline: 2px dashed var(--audle-selection-light);
    outline-offset: -5px;
  }
  .pad:disabled {
    background: var(--audle-disabled);
    border-color: var(--audle-disabled);
    color: var(--audle-disabled-ink);
    cursor: not-allowed;
  }
  .pad.skeleton .pad-name {
    inline-size: 72%;
    color: transparent;
    background: var(--audle-control);
  }
  .pad-glyph {
    grid-row: span 2;
    color: var(--audle-one-shot-light);
    font-size: 1.25rem;
  }
  .loop .pad-glyph {
    color: var(--audle-loop-light);
  }
  .pad-name {
    font-size: 0.82rem;
    font-weight: 700;
  }
  .pad-kind {
    color: var(--audle-text-muted);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .load-error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: var(--audle-text);
    font-size: 0.8rem;
  }
  .load-error button {
    min-block-size: 44px;
    padding-inline: 12px;
    border: 1px solid var(--audle-record-light);
    background: var(--audle-record-surface);
    color: var(--audle-text);
    cursor: pointer;
  }
  @media (prefers-reduced-motion: reduce) {
    .pad {
      transition: none;
    }
    .pad:active:not(:disabled) {
      transform: none;
    }
  }
</style>
