<script lang="ts">
  import type { CompositionV1 } from '../domain/model';

  let {
    composition,
    playing,
    picked,
    onPlay,
    onPick,
    onBack,
  }: {
    composition: CompositionV1;
    playing: boolean;
    picked: boolean;
    onPlay: () => void;
    onPick: () => void;
    onBack: () => void;
  } = $props();
  const clipCount = $derived(composition.tracks.reduce((total, track) => total + track.clips.length, 0));
</script>

<section class="shared" aria-labelledby="shared-title">
  <header>
    <button class="back" type="button" onclick={onBack}>← Back to Make</button>
    <p>Shared Audle</p>
    <h1 id="shared-title">Made for {composition.challenge.date}</h1>
    <span>{composition.challenge.bpm} BPM · {composition.challenge.key.root} {composition.challenge.key.mode} · {composition.bars} bars</span>
  </header>
  <div class="shared-controls">
    <button aria-label={playing ? 'Stop shared Audle' : 'Play shared Audle'} class:playing class="play" type="button" onclick={onPlay}>{playing ? '■ Stop' : '▶ Play'}</button>
    <button aria-pressed={picked} class:picked type="button" onclick={onPick}>✓ Your pick</button>
  </div>
  <dl>
    <div><dt>Voices</dt><dd>{composition.tracks.length}</dd></div>
    <div><dt>Clips</dt><dd>{clipCount}</dd></div>
    <div><dt>Sources</dt><dd>8 daily sounds</dd></div>
  </dl>
  <ol class="voice-list">
    {#each composition.tracks as track, index (track.id)}
      <li><span>{index < 8 ? `Source ${index + 1}` : `Layer ${index - 7}`}</span><strong>{track.label}</strong><small>{track.clips.length} clips · {track.controls.tuneSemitones > 0 ? '+' : ''}{track.controls.tuneSemitones} st</small></li>
    {/each}
  </ol>
</section>

<style>
  .shared { inline-size: min(100%, 780px); margin-inline: auto; padding: clamp(20px, 5vw, 48px); }
  .back { min-block-size: 44px; border: 0; background: transparent; color: var(--audle-text-muted); cursor: pointer; }
  header { padding-block-end: 28px; border-block-end: 1px solid var(--audle-outline); }
  header p { margin: 20px 0 5px; color: var(--audle-selection-light); font-size: 0.72rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; }
  h1 { margin: 0; font-size: clamp(2rem, 7vw, 4.5rem); letter-spacing: -0.06em; }
  header span { display: block; margin-block-start: 9px; color: var(--audle-text-muted); }
  .shared-controls { display: flex; gap: 8px; padding-block: 18px; }
  .shared-controls button { min-block-size: 48px; padding-inline: 16px; border: 1px solid var(--audle-outline); background: var(--audle-control); box-shadow: var(--audle-control-rest); color: var(--audle-text); cursor: pointer; font-weight: 700; }
  .shared-controls .play.playing { background: var(--audle-playback-surface); border-color: var(--audle-playback-light); }
  .shared-controls .picked { border-color: var(--audle-selection-light); }
  dl { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; margin: 0; background: var(--audle-outline); }
  dl div { padding: 12px; background: var(--audle-deck-raised); }
  dt { color: var(--audle-text-muted); font-size: 0.7rem; text-transform: uppercase; } dd { margin: 4px 0 0; font-size: 1.3rem; font-weight: 700; }
  .voice-list { margin: 24px 0; padding: 0; border-block-start: 1px solid var(--audle-outline); list-style: none; }
  .voice-list li { display: grid; grid-template-columns: 86px 1fr auto; gap: 8px; align-items: center; min-block-size: 54px; border-block-end: 1px solid var(--audle-outline); }
  .voice-list span, small { color: var(--audle-text-muted); font-size: 0.75rem; }
</style>
