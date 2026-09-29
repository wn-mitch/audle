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

<section
  aria-label="Today’s sounds"
  class="pad-bank grid min-w-0 content-start gap-2.5 bg-audle-deck-raised p-3.5 shadow-[var(--audle-deck-edge)]"
  aria-busy={editor.loading}
  bind:this={bank}
>
  <header class="flex items-baseline justify-between gap-2">
    <p class="m-0 text-[0.7rem] font-extrabold uppercase tracking-[0.1em]">Today’s source deck</p>
    <span class="text-[0.75rem] text-audle-text-muted"
      >{editor.loading
        ? 'Decoding sounds'
        : editor.recording
          ? 'Tap to add clips'
          : 'Tap to hear and select'}</span
    >
  </header>
  <div
    class="pads grid grid-cols-2 gap-2 max-[959px]:flex max-[959px]:snap-x max-[959px]:snap-proximity max-[959px]:overflow-x-auto max-[959px]:overscroll-x-contain max-[959px]:pb-1"
  >
    {#each challenge.sampleIds as sampleId, index (sampleId)}
      {@const sample = sampleById(sampleId)!}
      {@const selected = editor.selectedTrack?.sampleId === sampleId}
      <button
        aria-pressed={selected}
        class:loop={sample.kind === 'loop'}
        class:selected
        class:skeleton={editor.loading}
        class="pad relative grid min-h-[68px] grid-cols-[auto_1fr] items-center gap-x-2 gap-y-0.5 overflow-hidden border-[color:var(--pad-light)] bg-[var(--pad-face)] p-2.5 text-left text-audle-text shadow-[var(--pad-shadow)] transition-[background] duration-100 ease-out enabled:hover:bg-audle-control-hover disabled:cursor-not-allowed disabled:border-audle-disabled disabled:bg-audle-disabled disabled:text-audle-disabled-ink max-[959px]:flex-[0_0_148px] max-[959px]:snap-start motion-reduce:transition-none"
        data-sample-id={sampleId}
        disabled={editor.loading || Boolean(editor.loadingError)}
        style={`--source:var(--audle-source-${index + 1})`}
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
        <span class="source-number col-start-1 row-start-1 font-mono text-[0.75rem] font-bold"
          >{String(index + 1).padStart(2, '0')}</span
        >
        <span aria-hidden="true" class="pad-glyph glyph col-start-1 row-start-2 inline-flex"
          ><Icon name={sample.kind === 'loop' ? 'loop' : 'hit'} size={18} /></span
        >
        <span
          class={`pad-name col-start-2 row-start-1 text-[0.82rem] font-bold ${editor.loading ? 'w-[72%] bg-audle-control text-transparent' : ''}`}
          >{editor.loading ? 'Loading' : sample.label}</span
        >
        <span
          class="pad-kind col-start-2 row-start-2 text-[0.68rem] font-bold uppercase tracking-[0.08em] text-audle-text-muted"
          >{sample.kind === 'loop' ? 'Loop' : 'Hit'}</span
        >
      </button>
    {/each}
  </div>
  {#if editor.loadingError}
    <div
      class="load-error flex items-center justify-between gap-2 text-[0.8rem] text-audle-text"
      role="alert"
    >
      <span
        >! {editor.failedSampleId ? sampleById(editor.failedSampleId)?.label : 'A daily sound'} failed
        to load.</span
      >
      <button
        class="min-h-11 cursor-pointer border border-audle-record-light bg-audle-record-surface px-3 text-audle-text"
        type="button"
        onclick={() => editor.retryAudio()}>Retry</button
      >
    </div>
  {/if}
</section>

<style>
  .pad {
    --pad-light: var(--audle-one-shot-light);
    --pad-surface: var(--audle-one-shot-surface);
    --pad-flash: 0.8 0.12 215;
    --pad-face: color-mix(in oklch, var(--pad-surface) 84%, oklch(var(--source)) 16%);
    /* The flash ring fades through --flash, which the audition motion drives. */
    --pad-shadow:
      inset 0 0 0 1px var(--pad-light), inset 0 0 0 3px oklch(var(--pad-flash) / var(--flash, 0)),
      var(--audle-control-rest);
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
    --pad-surface: var(--audle-loop-surface);
    --pad-flash: 0.74 0.16 302;
  }
  .pad:global([data-pressed='true']) {
    --pad-face: var(--audle-control-pressed);
    --pad-shadow: inset 0 0 0 1px var(--pad-light), var(--audle-control-contact);
  }
  .pad.selected {
    outline: 2px dashed
      color-mix(in oklch, var(--audle-selection-light) 35%, oklch(var(--source)) 65%);
    outline-offset: -5px;
  }
  .pad-glyph,
  .source-number {
    color: oklch(var(--source));
  }
</style>
