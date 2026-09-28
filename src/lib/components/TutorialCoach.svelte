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

<section
  class="coach m-[14px] grid gap-4 border border-audle-selection-light bg-audle-selection-surface p-4 shadow-[inset_0_0_0_1px_var(--audle-selection-light)]"
  aria-labelledby="coach-title"
>
  <div>
    <p
      class="mb-1 mt-0 text-[0.7rem] font-extrabold uppercase tracking-[0.1em] text-audle-text-muted"
    >
      Play with a ready-made beat
    </p>
    <h2 id="coach-title" class="mb-1.5 mt-0">
      {step >= instructions.length
        ? 'You made this.'
        : `Step ${step + 1} of ${instructions.length}`}
    </h2>
    <strong class="text-[0.9rem]"
      >{step >= instructions.length
        ? 'Keep this remix, or return to your draft.'
        : instructions[step]}</strong
    >
  </div>
  <ol class="m-0 grid list-none gap-1.5 p-0" aria-label="Tutorial progress">
    {#each instructions as instruction, index (instruction)}
      <li
        class:complete={index < step}
        class:current={index === step}
        class="grid grid-cols-[24px_1fr] items-center gap-2 text-[0.78rem] {index < step ||
        index === step
          ? 'text-audle-text'
          : 'text-audle-text-muted'}"
      >
        <span
          class="grid size-[22px] place-items-center rounded-full border {index < step
            ? 'border-audle-playback-light text-audle-playback-light'
            : index === step
              ? 'border-audle-selection-light'
              : 'border-audle-outline'}"
          >{#if index < step}<Icon name="check" size={12} />{:else}{index + 1}{/if}</span
        >{instruction}
      </li>
    {/each}
  </ol>
  {#if step === 6}
    <button
      class="share min-h-11 cursor-pointer border border-audle-playback-light bg-audle-playback-surface px-3 font-bold text-audle-text"
      type="button"
      onclick={() => {
        onShare();
        shared = true;
      }}>Create share link</button
    >
  {/if}
  {#if step >= instructions.length}
    <div class="finish flex flex-wrap gap-2">
      <button
        class="keep min-h-11 cursor-pointer border border-audle-playback-light bg-audle-playback-surface px-3 font-bold text-audle-text"
        type="button"
        onclick={() => onFinish(true)}>Keep this remix</button
      ><button
        class="min-h-11 cursor-pointer border border-audle-outline bg-audle-control px-3 font-bold text-audle-text"
        type="button"
        onclick={() => onFinish(false)}>Back to Make</button
      >
    </div>
  {:else}
    <button
      class="skip min-h-11 justify-self-start cursor-pointer border border-audle-outline bg-audle-control px-3 font-bold text-audle-text"
      type="button"
      onclick={() => onFinish(false)}>Skip tutorial</button
    >
  {/if}
</section>
