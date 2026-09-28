<script lang="ts">
  import { sampleById } from '../data/samples';
  import { TICKS_PER_BAR, TICKS_PER_SIXTEENTH } from '../domain/model';
  import type { Track } from '../domain/model';
  import { enter, popOn, press } from '../motion';
  import type { EditorState } from '../state/editor.svelte';
  import PadWaveform from './PadWaveform.svelte';

  let {
    track,
    editor,
    index,
    bars,
    status,
    selected,
    disabled,
    onToggle,
  }: {
    track: Track;
    editor: EditorState;
    index: number;
    bars: number;
    status: ReturnType<EditorState['liveStatus']>;
    selected: boolean;
    disabled: boolean;
    onToggle: (trackId: string) => void;
  } = $props();
  const sample = $derived(sampleById(track.sampleId));
  const totalTicks = $derived(bars * TICKS_PER_BAR);
  const hitTicks = $derived(
    track.clips.flatMap((clip) =>
      clip.kind === 'loop'
        ? [clip.startTick]
        : Array.from(
            { length: clip.ratchet },
            (_, strike) => clip.startTick + (strike * TICKS_PER_SIXTEENTH) / clip.ratchet,
          ),
    ),
  );
</script>

<button
  type="button"
  class="sound-object relative flex min-h-12 min-w-0 cursor-pointer flex-col items-stretch justify-between overflow-hidden border border-audle-outline-subtle px-[10px] py-2 text-left text-audle-text max-[540px]:px-[6px] max-[540px]:py-[5px] disabled:cursor-not-allowed disabled:opacity-[0.66] motion-reduce:transition-none"
  class:active={status === 'on'}
  class:selected
  class:pending={status.startsWith('queued')}
  data-active={status === 'on'}
  data-track-id={track.id}
  style={`--source:var(--audle-source-${index + 1})`}
  use:enter={{ index, columns: 4, once: 'play-grid' }}
  use:press={{ disabled }}
  use:popOn={selected}
  aria-label={`${sample?.label ?? track.label}, ${sample?.role ?? 'sound'}, ${status === 'empty' ? 'add to loop' : status === 'off' ? 'off, turn on' : status === 'on' ? 'on, turn off' : 'queued for next bar'}`}
  aria-pressed={status === 'on'}
  {disabled}
  onclick={() => onToggle(track.id)}
>
  <span class="flex min-w-0 items-center justify-between gap-0.5">
    <span
      class="object-number font-mono text-[0.62rem] leading-[1.1] font-bold tracking-[0.08em] text-audle-text"
      >{(index + 1).toString().padStart(2, '0')}</span
    >
    <span
      class="whitespace-nowrap text-[0.5rem] font-bold tracking-[0.02em] text-audle-text uppercase max-[400px]:text-[0.43rem]"
      >{sample?.role}</span
    >
  </span>
  <span
    class="glyph relative grid min-h-10 origin-center place-items-center max-[540px]:min-h-[34px]"
    aria-hidden="true"
  >
    {#if status === 'on'}<PadWaveform {editor} trackId={track.id} />{/if}
    {#if index < 2}<span class="shape rings"><i></i><i></i><i></i></span>
    {:else if index < 4}<span class="shape coils"><i></i><i></i><i></i></span>
    {:else if index < 6}<span class="shape prism"><i></i><i></i></span>
    {:else if index < 8}<span class="shape wave"><i></i><i></i><i></i><i></i></span>
    {:else if index < 10}<span class="shape spike"><i></i><i></i><i></i><i></i></span>
    {:else if index < 12}<span class="shape bars"><i></i><i></i><i></i><i></i></span>
    {:else if index < 14}<span class="shape orbit"><i></i><i></i><i></i></span>
    {:else}<span class="shape lattice"><i></i><i></i><i></i><i></i></span>{/if}
  </span>
  <span class="object-bottom grid min-w-0 gap-[2px]"
    ><strong class="truncate text-[0.72rem] leading-[1.2]">{sample?.label ?? track.label}</strong
    >{#if status.startsWith('queued')}<span>NEXT BAR</span>{/if}</span
  >
  <span class="object-meter" aria-hidden="true"></span>
  <span
    class="hit-timeline relative mt-1 block h-2 w-full flex-none overflow-hidden bg-audle-well-raised max-[540px]:mt-[2px] max-[540px]:h-[7px]"
    aria-hidden="true"
    data-hit-count={hitTicks.length}
  >
    {#each track.clips as clip (clip.id)}
      {#if clip.kind === 'loop'}
        <i
          class="loop-length"
          style:left={`${(clip.startTick / totalTicks) * 100}%`}
          style:width={`${(clip.lengthTicks / totalTicks) * 100}%`}
        ></i>
      {/if}
    {/each}
    {#each hitTicks as tick, index (index)}
      <i class="hit-mark" data-tick={tick} style:left={`${(tick / totalTicks) * 100}%`}></i>
    {/each}
    <i class="timeline-progress"></i>
  </span>
</button>

<style>
  .sound-object {
    background: color-mix(in srgb, var(--audle-control) 72%, oklch(var(--source)) 28%);
    box-shadow: inset 0 0 0 3px oklch(var(--source) / var(--flash, 0));
    transition:
      border-color 180ms,
      background 180ms,
      box-shadow 180ms,
      transform 180ms var(--ease-out-quint);
  }
  .sound-object::before {
    content: '';
    position: absolute;
    inset: 0;
    background: oklch(var(--source) / calc(var(--flash, 0) * 0.16));
    pointer-events: none;
  }
  @media (hover: hover) {
    .sound-object:hover:not(:disabled):not([data-pressed='true']) {
      border-color: oklch(var(--source));
      transform: translateY(-4px) rotate(-1deg) scale(1.025);
    }
    .sound-object:hover:not(:disabled) .shape {
      rotate: -5deg;
    }
  }
  .sound-object.active {
    border-color: oklch(var(--source));
    background: color-mix(in srgb, var(--audle-control) 45%, oklch(var(--source)) 55%);
    box-shadow:
      inset 0 0 0 1px oklch(var(--source) / 0.32),
      inset 0 0 0 3px oklch(var(--source) / var(--flash, 0));
  }
  .sound-object:global([data-pressed='true']) {
    background: color-mix(in srgb, var(--audle-control-pressed) 65%, oklch(var(--source)) 35%);
    box-shadow: var(--audle-control-contact);
  }
  .sound-object.selected::after {
    content: '';
    position: absolute;
    inset: 4px;
    border: 1px solid oklch(var(--source) / 0.7);
    pointer-events: none;
  }
  .glyph {
    color: oklch(var(--source));
  }
  .shape {
    position: relative;
    display: grid;
    place-items: center;
    inline-size: 43px;
    block-size: 43px;
    transition: rotate 180ms var(--ease-out-quint);
  }
  .sound-object.active .shape {
    inline-size: 34px;
    block-size: 34px;
  }
  .shape i {
    position: absolute;
    display: block;
    border: 2px solid currentColor;
  }
  .rings i {
    border-radius: 50%;
    inline-size: 75%;
    block-size: 75%;
  }
  .rings i:nth-child(2) {
    inline-size: 48%;
    block-size: 48%;
  }
  .rings i:nth-child(3) {
    inline-size: 19%;
    block-size: 19%;
    background: currentColor;
  }
  .coils i {
    inline-size: 75%;
    block-size: 26%;
    border-radius: 50%;
    transform: rotate(-27deg);
  }
  .coils i:nth-child(2) {
    transform: rotate(35deg);
  }
  .coils i:nth-child(3) {
    inline-size: 22%;
    block-size: 22%;
    border-radius: 50%;
    background: currentColor;
  }
  .prism i {
    inline-size: 58%;
    block-size: 58%;
    transform: rotate(45deg);
  }
  .prism i:nth-child(2) {
    inline-size: 33%;
    block-size: 33%;
    transform: rotate(45deg);
    background: currentColor;
    opacity: 0.5;
  }
  .wave i {
    inline-size: 20%;
    block-size: 62%;
    border-radius: 50%;
    transform: rotate(25deg);
  }
  .wave i:nth-child(1) {
    left: 3%;
  }
  .wave i:nth-child(2) {
    left: 24%;
    block-size: 80%;
  }
  .wave i:nth-child(3) {
    left: 48%;
  }
  .wave i:nth-child(4) {
    left: 70%;
    block-size: 38%;
  }
  .spike i {
    inline-size: 38%;
    block-size: 38%;
    transform: rotate(45deg);
  }
  .spike i:nth-child(1) {
    top: 2%;
  }
  .spike i:nth-child(2) {
    left: 2%;
  }
  .spike i:nth-child(3) {
    right: 2%;
  }
  .spike i:nth-child(4) {
    bottom: 2%;
  }
  .bars i {
    inline-size: 10%;
    block-size: 70%;
    transform: skew(-16deg);
    background: currentColor;
  }
  .bars i:nth-child(1) {
    left: 14%;
    block-size: 35%;
  }
  .bars i:nth-child(2) {
    left: 35%;
  }
  .bars i:nth-child(3) {
    right: 35%;
    block-size: 52%;
  }
  .bars i:nth-child(4) {
    right: 14%;
    block-size: 87%;
  }
  .orbit i {
    inline-size: 80%;
    block-size: 35%;
    border-radius: 50%;
    transform: rotate(47deg);
  }
  .orbit i:nth-child(2) {
    transform: rotate(-47deg);
  }
  .orbit i:nth-child(3) {
    inline-size: 15%;
    block-size: 15%;
    border-radius: 50%;
    background: currentColor;
  }
  .lattice i {
    inline-size: 65%;
    block-size: 65%;
    transform: rotate(15deg);
  }
  .lattice i:nth-child(2) {
    transform: rotate(60deg);
  }
  .lattice i:nth-child(3) {
    inline-size: 35%;
    block-size: 35%;
    transform: rotate(15deg);
  }
  .lattice i:nth-child(4) {
    inline-size: 12%;
    block-size: 12%;
    border-radius: 50%;
    background: currentColor;
  }
  .object-bottom span {
    color: var(--audle-text);
    font:
      700 0.54rem/1.1 ui-monospace,
      monospace;
    letter-spacing: 0.08em;
  }
  .sound-object.selected .hit-timeline {
    block-size: 18px;
    box-shadow: inset 0 0 0 1px oklch(var(--source) / 0.55);
  }
  .hit-timeline i {
    position: absolute;
    display: block;
    pointer-events: none;
  }
  .loop-length {
    inset-block: 3px;
    background: oklch(var(--source) / 0.4);
  }
  .hit-mark {
    top: 0;
    inline-size: 2px;
    block-size: 100%;
    background: oklch(var(--source));
  }
  .sound-object.selected .hit-mark {
    inline-size: 3px;
  }
  .timeline-progress {
    inset: 0;
    background: color-mix(in srgb, var(--audle-accent) 14%, transparent);
    border-inline-end: 2px solid var(--audle-accent);
    transform: scaleX(var(--play-progress, 0));
    transform-origin: left;
  }
  .object-meter {
    position: absolute;
    inset: auto auto 0 0;
    inline-size: 100%;
    block-size: 3px;
    background: oklch(var(--source));
    transform: scaleX(var(--level, 0));
    transform-origin: left;
  }
  .active .object-meter {
    --level: 0.3;
  }
  .sound-object:not(.active) .object-meter {
    transform: scaleX(0);
  }
  @media (max-width: 540px) {
    .shape {
      inline-size: 38px;
      block-size: 38px;
    }
    .sound-object.active .shape {
      inline-size: 29px;
      block-size: 29px;
    }
    .sound-object.selected .hit-timeline {
      block-size: 14px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .sound-object,
    .shape {
      transition: none;
    }
    .sound-object:hover:not(:disabled):not([data-pressed='true']) {
      transform: none;
    }
    .sound-object:hover:not(:disabled) .shape {
      rotate: none;
    }
  }
</style>
