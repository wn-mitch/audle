<script lang="ts">
  import type { EditorState } from '../state/editor.svelte';
  import { SOURCES_PER_DAY } from '../domain/model';
  import Icon from './Icon.svelte';

  let {
    editor,
    onShare,
    onFinish,
  }: {
    editor: EditorState;
    onShare: () => void;
    onFinish: (keep: boolean) => void;
  } = $props();

  let initialClipCount = $state<number | undefined>(undefined);
  let initialOneShotCount = $state<number | undefined>(undefined);
  const instructions = [
    'Play the ready-made loop.',
    'Arm Record, then tap any Hit pad after the count-in.',
    'Select that hit and choose Roll ×3.',
    'Select clips and choose Fill the loop.',
    'Choose Add a layer.',
    'Turn the clone’s Tune or Filter.',
    'Create a share link.',
  ];
  let step = $state(0);
  let shared = $state(false);

  $effect(() => {
    const oneShotCount = editor.composition.tracks
      .filter(
        (track) =>
          track.sampleId.startsWith('kick-') ||
          track.sampleId.startsWith('clap-') ||
          track.sampleId.startsWith('hat-') ||
          track.sampleId.startsWith('fx-'),
      )
      .reduce((count, track) => count + track.clips.length, 0);
    const totalClips = editor.composition.tracks.reduce(
      (count, track) => count + track.clips.length,
      0,
    );
    if (initialClipCount === undefined || initialOneShotCount === undefined) {
      initialClipCount = totalClips;
      initialOneShotCount = oneShotCount;
      return;
    }
    const clone = editor.composition.tracks[SOURCES_PER_DAY];
    if (step === 0 && editor.playing) step = 1;
    if (step === 1 && oneShotCount > initialOneShotCount) step = 2;
    if (
      step === 2 &&
      editor.selectedClips.some((clip) => clip.kind === 'hit' && clip.ratchet === 3)
    )
      step = 3;
    if (step === 3 && totalClips > initialClipCount + 2) step = 4;
    if (step === 4 && editor.composition.tracks.length > SOURCES_PER_DAY) step = 5;
    if (
      step === 5 &&
      clone &&
      (clone.controls.tuneSemitones !== 0 || clone.controls.cutoffHz !== 18000)
    )
      step = 6;
    if (step === 6 && shared) step = 7;
  });
</script>

<section class="coach" aria-labelledby="coach-title">
  <div>
    <p>Play with a ready-made beat</p>
    <h2 id="coach-title">
      {step >= instructions.length
        ? 'You made this.'
        : `Step ${step + 1} of ${instructions.length}`}
    </h2>
    <strong
      >{step >= instructions.length
        ? 'Keep this remix, or return to your draft.'
        : instructions[step]}</strong
    >
  </div>
  <ol aria-label="Tutorial progress">
    {#each instructions as instruction, index (instruction)}
      <li class:complete={index < step} class:current={index === step}>
        <span
          >{#if index < step}<Icon name="check" size={12} />{:else}{index + 1}{/if}</span
        >{instruction}
      </li>
    {/each}
  </ol>
  {#if step === 6}
    <button
      class="share"
      type="button"
      onclick={() => {
        onShare();
        shared = true;
      }}>Create share link</button
    >
  {/if}
  {#if step >= instructions.length}
    <div class="finish">
      <button class="keep" type="button" onclick={() => onFinish(true)}>Keep this remix</button
      ><button type="button" onclick={() => onFinish(false)}>Back to Make</button>
    </div>
  {:else}
    <button class="skip" type="button" onclick={() => onFinish(false)}>Skip tutorial</button>
  {/if}
</section>

<style>
  .coach {
    display: grid;
    gap: 16px;
    margin: 14px;
    padding: 16px;
    border: 1px solid var(--audle-selection-light);
    background: var(--audle-selection-surface);
    box-shadow: inset 0 0 0 1px var(--audle-selection-light);
  }
  p {
    margin: 0 0 4px;
    color: var(--audle-text-muted);
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  h2 {
    margin: 0 0 6px;
  }
  strong {
    font-size: 0.9rem;
  }
  ol {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: grid;
    grid-template-columns: 24px 1fr;
    gap: 8px;
    align-items: center;
    color: var(--audle-text-muted);
    font-size: 0.78rem;
  }
  li span {
    display: grid;
    place-items: center;
    inline-size: 22px;
    block-size: 22px;
    border: 1px solid var(--audle-outline);
    border-radius: 50%;
  }
  li.current {
    color: var(--audle-text);
  }
  li.current span {
    border-color: var(--audle-selection-light);
  }
  li.complete {
    color: var(--audle-text);
  }
  li.complete span {
    color: var(--audle-playback-light);
    border-color: var(--audle-playback-light);
  }
  button {
    min-block-size: 44px;
    padding-inline: 12px;
    border: 1px solid var(--audle-outline);
    background: var(--audle-control);
    color: var(--audle-text);
    cursor: pointer;
    font-weight: 700;
  }
  .share,
  .keep {
    background: var(--audle-playback-surface);
    border-color: var(--audle-playback-light);
  }
  .finish {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .skip {
    justify-self: start;
  }
</style>
