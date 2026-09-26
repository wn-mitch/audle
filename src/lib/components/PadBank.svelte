<script lang="ts">
  import { onMount } from 'svelte';
  import { sampleById } from '../data/samples';
  import type { ChallengeSnapshot } from '../domain/model';
  import { enter, flashHit, press } from '../motion';
  import type { EditorState } from '../state/editor.svelte';
  import Icon from './Icon.svelte';

  let { challenge, editor }: { challenge: ChallengeSnapshot; editor: EditorState } = $props();
  let bank: HTMLElement;

  // An audition is the pad's own sound, so the pad lights on the frame it plays.
  onMount(() =>
    editor.subscribeHits((hit) => {
      if (hit.kind !== 'audition' || !bank) return;
      const pad = bank.querySelector<HTMLElement>(`.pad[data-sample-id="${hit.sampleId}"]`);
      if (pad) flashHit(pad);
    }),
  );
</script>

<section aria-label="Today’s sounds" class="pad-bank" aria-busy={editor.loading} bind:this={bank}>
  <header>
    <p>Today’s source deck</p>
    <span>{editor.loading ? 'Decoding sounds' : 'Tap any sound'}</span>
  </header>
  <div class="pads">
    {#each challenge.sampleIds as sampleId, index (sampleId)}
      {@const sample = sampleById(sampleId)!}
      {@const selected = editor.selectedTrack?.sampleId === sampleId}
      <button
        aria-pressed={selected}
        class:loop={sample.kind === 'loop'}
        class:selected
        class:skeleton={editor.loading}
        class="pad"
        data-sample-id={sampleId}
        disabled={editor.loading || Boolean(editor.loadingError)}
        type="button"
        use:press={{ disabled: editor.loading || Boolean(editor.loadingError) }}
        use:enter={{ index, columns: 2, once: 'pad-bank' }}
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
        <span aria-hidden="true" class="pad-glyph glyph"
          ><Icon name={sample.kind === 'loop' ? 'loop' : 'hit'} size={18} /></span
        >
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
    --pad-light: var(--audle-one-shot-light);
    --pad-flash: 0.8 0.12 215;
    position: relative;
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 2px 8px;
    min-block-size: 68px;
    padding: 10px;
    overflow: hidden;
    border: 1px solid var(--pad-light);
    background: var(--audle-one-shot-surface);
    /* The flash ring fades through --flash, which the audition motion drives. */
    box-shadow:
      inset 0 0 0 1px var(--pad-light),
      inset 0 0 0 3px oklch(var(--pad-flash) / var(--flash, 0)),
      var(--audle-control-rest);
    color: var(--audle-text);
    cursor: pointer;
    text-align: start;
    touch-action: manipulation;
    /* Transform belongs to the press motion; only colour transitions here. */
    transition: background 100ms ease-out;
  }
  /* The audition bloom: a solid low-alpha fill clipped by the pad. */
  .pad::before {
    content: '';
    position: absolute;
    inset: 0;
    background: oklch(var(--pad-flash) / calc(var(--flash, 0) * 0.18));
    pointer-events: none;
  }
  .pad.loop {
    --pad-light: var(--audle-loop-light);
    --pad-flash: 0.74 0.16 302;
    background: var(--audle-loop-surface);
  }
  .pad:hover:not(:disabled) {
    background: var(--audle-control-hover);
  }
  .pad:global([data-pressed='true']) {
    background: var(--audle-control-pressed);
    box-shadow:
      inset 0 0 0 1px var(--pad-light),
      var(--audle-control-contact);
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
    display: inline-flex;
    grid-row: span 2;
    color: var(--audle-one-shot-light);
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
  /* On a phone the bank is a horizontal strip beneath the timeline, so it never pushes the lanes
     two screens down. */
  @media (max-width: 959px) {
    .pads {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      overscroll-behavior-x: contain;
      padding-block-end: 4px;
      scroll-snap-type: x proximity;
    }
    .pad {
      flex: 0 0 148px;
      scroll-snap-align: start;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .pad {
      transition: none;
    }
  }
</style>
