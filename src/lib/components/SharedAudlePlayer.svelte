<script lang="ts">
  import { SOURCES_PER_DAY, type CompositionV1 } from '../domain/model';
  import { press } from '../motion';
  import Icon from './Icon.svelte';
  import type { PerformanceV1 } from '../domain/performance';

  let {
    composition,
    performance,
    playing,
    picked,
    onPlay,
    onPick,
    onRemix,
    onBack,
  }: {
    composition: CompositionV1;
    performance?: PerformanceV1;
    playing: boolean;
    picked: boolean;
    onPlay: () => void;
    onPick: () => void;
    /** Brings this loop into the maker's own Arrange as a draft. */
    onRemix: () => void;
    onBack: () => void;
  } = $props();
  const clipCount = $derived(
    composition.tracks.reduce((total, track) => total + track.clips.length, 0),
  );
</script>

<section
  class="shared mx-auto w-full max-w-[780px] p-[clamp(20px,5vw,48px)]"
  aria-labelledby="shared-title"
>
  <header class="border-b border-audle-outline pb-7">
    <button
      class="back inline-flex min-h-11 cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 font-bold text-audle-text-muted"
      type="button"
      onclick={onBack}><Icon name="arrow-left" /> Back to Play</button
    >
    <p class="mb-1 mt-5 text-[0.8rem] font-bold text-audle-text-muted">Shared Audle</p>
    <h1 id="shared-title" class="m-0 text-[1.75rem] tracking-[-0.02em]">
      {performance ? 'A live take' : 'Made for this moment'}
    </h1>
    <span class="mt-[9px] block text-audle-text-muted"
      >{composition.challenge.bpm} BPM · {composition.challenge.key.root}
      {composition.challenge.key.mode} · {composition.bars} bars{performance
        ? ` · ${Math.round((performance.durationTicks * 60) / (96 * composition.challenge.bpm))}s performance`
        : ''}</span
    >
  </header>
  <div class="shared-controls flex flex-wrap gap-2 py-[18px]">
    <button
      aria-label={playing ? 'Stop shared Audle' : 'Play shared Audle'}
      class:playing
      class="play inline-flex min-h-12 cursor-pointer items-center gap-2 border border-audle-outline bg-audle-control px-4 font-bold text-audle-text shadow-[var(--audle-control-rest)] {playing
        ? 'border-audle-playback-light bg-audle-playback-surface'
        : ''}"
      type="button"
      use:press
      onclick={onPlay}
      >{#if playing}<Icon name="stop" /> Stop{:else}<Icon name="play" />
        {performance ? 'Play take' : 'Play'}{/if}</button
    >
    <button
      type="button"
      class="remix inline-flex min-h-12 cursor-pointer items-center gap-2 border border-audle-accent bg-audle-accent px-4 font-bold text-audle-accent-ink shadow-[var(--audle-control-rest)]"
      use:press
      onclick={onRemix}><Icon name="arrow-right" /> Remix this</button
    >
    <button
      aria-pressed={picked}
      class:picked
      type="button"
      title="Mark this as your favourite for today"
      class="inline-flex min-h-12 cursor-pointer items-center gap-2 border border-audle-outline bg-audle-control px-4 font-bold text-audle-text shadow-[var(--audle-control-rest)] {picked
        ? 'border-audle-accent-dim bg-audle-playback-surface'
        : ''}"
      use:press
      onclick={onPick}><Icon name="check" /> Your pick</button
    >
  </div>
  <dl class="m-0 grid grid-cols-3 gap-px bg-audle-outline">
    <div class="bg-audle-deck-raised p-3">
      <dt class="text-[0.7rem] uppercase text-audle-text-muted">Voices</dt>
      <dd class="mb-0 ml-0 mt-1 text-[1.3rem] font-bold">{composition.tracks.length}</dd>
    </div>
    <div class="bg-audle-deck-raised p-3">
      <dt class="text-[0.7rem] uppercase text-audle-text-muted">Clips</dt>
      <dd class="mb-0 ml-0 mt-1 text-[1.3rem] font-bold">{clipCount}</dd>
    </div>
    <div class="bg-audle-deck-raised p-3">
      <dt class="text-[0.7rem] uppercase text-audle-text-muted">Sources</dt>
      <dd class="mb-0 ml-0 mt-1 text-[1.3rem] font-bold">{SOURCES_PER_DAY} daily sounds</dd>
    </div>
  </dl>
  <ol class="voice-list my-6 list-none border-t border-audle-outline p-0">
    {#each composition.tracks as track, index (track.id)}
      <li
        class="grid min-h-[54px] grid-cols-[86px_minmax(0,1fr)_auto] items-center gap-2 border-b border-audle-outline"
      >
        <span class="text-[0.75rem] text-audle-text-muted"
          >{index < SOURCES_PER_DAY
            ? `Source ${index + 1}`
            : `Layer ${index - SOURCES_PER_DAY + 1}`}</span
        ><strong>{track.label}</strong><small class="text-[0.75rem] text-audle-text-muted"
          >{track.clips.length} clips · {track.controls.tuneSemitones > 0 ? '+' : ''}{track.controls
            .tuneSemitones} st</small
        >
      </li>
    {/each}
  </ol>
</section>

<style>
  .shared {
    inline-size: min(100%, 780px);
    margin-inline: auto;
    padding: clamp(20px, 5vw, 48px);
  }
  .back {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-block-size: 44px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--audle-text-muted);
    cursor: pointer;
    font-weight: 700;
  }
  header {
    padding-block-end: 28px;
    border-block-end: 1px solid var(--audle-outline);
  }
  header p {
    margin: 20px 0 4px;
    color: var(--audle-text-muted);
    font-size: 0.8rem;
    font-weight: 700;
  }
  h1 {
    margin: 0;
    font-size: 1.75rem;
    letter-spacing: -0.02em;
  }
  header span {
    display: block;
    margin-block-start: 9px;
    color: var(--audle-text-muted);
  }
  .shared-controls {
    display: flex;
    gap: 8px;
    padding-block: 18px;
  }
  .shared-controls button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-block-size: 48px;
    padding-inline: 16px;
    border: 1px solid var(--audle-outline);
    background: var(--audle-control);
    box-shadow: var(--audle-control-rest);
    color: var(--audle-text);
    cursor: pointer;
    font-weight: 700;
  }
  .shared-controls .play.playing {
    background: var(--audle-playback-surface);
    border-color: var(--audle-playback-light);
  }
  .shared-controls .remix {
    border-color: var(--audle-accent);
    background: var(--audle-accent);
    color: var(--audle-accent-ink);
  }
  .shared-controls .picked {
    border-color: var(--audle-accent-dim);
    background: var(--audle-playback-surface);
  }
  dl {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1px;
    margin: 0;
    background: var(--audle-outline);
  }
  dl div {
    padding: 12px;
    background: var(--audle-deck-raised);
  }
  dt {
    color: var(--audle-text-muted);
    font-size: 0.7rem;
    text-transform: uppercase;
  }
  dd {
    margin: 4px 0 0;
    font-size: 1.3rem;
    font-weight: 700;
  }
  .voice-list {
    margin: 24px 0;
    padding: 0;
    border-block-start: 1px solid var(--audle-outline);
    list-style: none;
  }
  .voice-list li {
    display: grid;
    grid-template-columns: 86px 1fr auto;
    gap: 8px;
    align-items: center;
    min-block-size: 54px;
    border-block-end: 1px solid var(--audle-outline);
  }
  .voice-list span,
  small {
    color: var(--audle-text-muted);
    font-size: 0.75rem;
  }
</style>
