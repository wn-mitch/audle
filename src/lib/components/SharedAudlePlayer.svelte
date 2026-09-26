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

<section class="shared" aria-labelledby="shared-title">
  <header>
    <button class="back" type="button" onclick={onBack}
      ><Icon name="arrow-left" /> Back to Play</button
    >
    <p>Shared Audle</p>
    <h1 id="shared-title">{performance ? 'A live take' : 'Made for this moment'}</h1>
    <span
      >{composition.challenge.bpm} BPM · {composition.challenge.key.root}
      {composition.challenge.key.mode} · {composition.bars} bars{performance
        ? ` · ${Math.round((performance.durationTicks * 60) / (96 * composition.challenge.bpm))}s performance`
        : ''}</span
    >
  </header>
  <div class="shared-controls">
    <button
      aria-label={playing ? 'Stop shared Audle' : 'Play shared Audle'}
      class:playing
      class="play"
      type="button"
      use:press
      onclick={onPlay}
      >{#if playing}<Icon name="stop" /> Stop{:else}<Icon name="play" />
        {performance ? 'Play take' : 'Play'}{/if}</button
    >
    <button type="button" class="remix" use:press onclick={onRemix}
      ><Icon name="arrow-right" /> Remix this</button
    >
    <button
      aria-pressed={picked}
      class:picked
      type="button"
      title="Mark this as your favourite for today"
      use:press
      onclick={onPick}><Icon name="check" /> Your pick</button
    >
  </div>
  <dl>
    <div>
      <dt>Voices</dt>
      <dd>{composition.tracks.length}</dd>
    </div>
    <div>
      <dt>Clips</dt>
      <dd>{clipCount}</dd>
    </div>
    <div>
      <dt>Sources</dt>
      <dd>{SOURCES_PER_DAY} daily sounds</dd>
    </div>
  </dl>
  <ol class="voice-list">
    {#each composition.tracks as track, index (track.id)}
      <li>
        <span
          >{index < SOURCES_PER_DAY
            ? `Source ${index + 1}`
            : `Layer ${index - SOURCES_PER_DAY + 1}`}</span
        ><strong>{track.label}</strong><small
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
