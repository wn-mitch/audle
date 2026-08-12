<script lang="ts">
  import type { CompositionV1 } from '../domain/model';

  let {
    examples,
    shared,
    onOpen,
  }: {
    examples: CompositionV1[];
    shared: CompositionV1[];
    onOpen: (composition: CompositionV1) => void;
  } = $props();

  const describe = (composition: CompositionV1) => {
    const clips = composition.tracks.reduce((total, track) => total + track.clips.length, 0);
    return `${composition.bars} bars · ${composition.tracks.length} voices · ${clips} clips`;
  };
</script>

<section class="gallery" aria-labelledby="listen-title">
  <header>
    <p>Listen</p>
    <h1 id="listen-title">Examples</h1>
    <span>Local examples and links opened in this browser.</span>
  </header>
  <div class="rows">
    {#each examples as example, index (example.challenge.date + index)}
      <button type="button" onclick={() => onOpen(example)}>
        <span class="row-index">0{index + 1}</span>
        <span><strong>{['Four on the floor', 'Syncopated', 'Four-bar build'][index]}</strong><small>{describe(example)}</small></span>
        <span aria-hidden="true">▶</span>
      </button>
    {/each}
  </div>
  <h2>Shared with you</h2>
  {#if shared.length}
    <div class="rows">
      {#each shared as composition (composition.challenge.date + composition.tracks.map((track) => track.id).join(':'))}
        <button type="button" onclick={() => onOpen(composition)}>
          <span class="row-index">↗</span>
          <span><strong>Shared Audle</strong><small>Made for {composition.challenge.date} · {describe(composition)}</small></span>
          <span aria-hidden="true">▶</span>
        </button>
      {/each}
    </div>
  {:else}
    <p class="empty">Open an Audle link and it will appear here on this device.</p>
  {/if}
</section>

<style>
  .gallery { inline-size: min(100%, 900px); margin-inline: auto; padding: clamp(20px, 5vw, 48px); }
  header { padding-block-end: 24px; border-block-end: 1px solid var(--audle-outline); }
  header p { margin: 0 0 6px; color: var(--audle-playback-light); font-size: 0.72rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
  h1 { margin: 0; font-size: clamp(2rem, 7vw, 4rem); letter-spacing: -0.06em; }
  header span { display: block; max-inline-size: 50ch; margin-block-start: 10px; color: var(--audle-text-muted); }
  h2 { margin: 32px 0 10px; font-size: 0.9rem; letter-spacing: 0.06em; text-transform: uppercase; }
  .rows { border-block-start: 1px solid var(--audle-outline); }
  .rows button { display: grid; grid-template-columns: 44px 1fr auto; align-items: center; gap: 12px; inline-size: 100%; min-block-size: 72px; padding: 12px 0; border: 0; border-block-end: 1px solid var(--audle-outline); background: transparent; color: var(--audle-text); cursor: pointer; text-align: start; }
  .rows button:hover { color: var(--audle-playback-light); }
  .row-index { color: var(--audle-selection-light); font-family: ui-monospace, monospace; }
  strong, small { display: block; }
  small { margin-block-start: 4px; color: var(--audle-text-muted); font-size: 0.78rem; }
  .empty { color: var(--audle-text-muted); }
</style>
