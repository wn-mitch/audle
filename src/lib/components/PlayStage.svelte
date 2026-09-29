<script lang="ts">
  import { onMount } from 'svelte';
  import { LIVE_PATTERNS, clipsForPattern } from '../domain/live';
  import { sampleById } from '../data/samples';
  import {
    SOURCES_PER_DAY,
    DEFAULT_TRACK_CONTROLS,
    sourceTicks,
    TICKS_PER_BAR,
    TICKS_PER_SIXTEENTH,
  } from '../domain/model';
  import {
    accentHitMark,
    flashHit,
    motion,
    popOn,
    press,
    pulseBeat,
    subscribeFrame,
  } from '../motion';
  import type { EditorState } from '../state/editor.svelte';
  import Icon from './Icon.svelte';
  import Knob from './Knob.svelte';
  import SoundPad from './SoundPad.svelte';

  let {
    editor,
    onArrange,
    onShare,
    onTakeSaved,
  }: {
    editor: EditorState;
    onArrange: () => void;
    onShare: () => void;
    onTakeSaved: () => void;
  } = $props();

  let stage = $state<HTMLElement>();
  let lastBeat = -1;
  const tracks = $derived(editor.composition.tracks.slice(0, SOURCES_PER_DAY));
  const hasClips = $derived(tracks.some((track) => track.clips.length > 0));
  const selected = $derived(editor.selectedTrack);
  const sample = $derived(selected ? sampleById(selected.sampleId) : undefined);
  const sourceIndex = $derived(tracks.findIndex((track) => track.sampleId === selected?.sampleId));
  const activeCount = $derived(
    tracks.filter((track) => {
      const status = editor.liveStatus(track.id);
      return status === 'on' || status === 'queued-off';
    }).length,
  );
  const pattern = $derived(selected ? editor.livePattern(selected.id) : 'empty');
  const duration = $derived(
    editor.loading || !selected ? undefined : editor.sourceDurationSeconds(selected.sampleId),
  );
  const tuningDisabled = $derived(
    !selected ||
      editor.loading ||
      !!editor.loadingError ||
      editor.playingPerformance ||
      editor.captureStatus !== 'idle',
  );
  const feelDisabled = $derived(
    !selected ||
      editor.loading ||
      !!editor.loadingError ||
      editor.playingPerformance ||
      editor.captureStatus !== 'idle',
  );
  type TuningControl = 'gainDb' | 'pan' | 'tuneSemitones' | 'space' | 'echo' | 'fuzz';
  const resetControl = (property: TuningControl) => {
    if (
      !selected ||
      tuningDisabled ||
      selected.controls[property] === DEFAULT_TRACK_CONTROLS[property]
    )
      return;
    editor.beginControlGesture();
    editor.updateSelectedTrackControls({
      ...selected.controls,
      [property]: DEFAULT_TRACK_CONTROLS[property],
    });
    editor.endControlGesture();
  };

  // Compare the actual clips with each unshifted feel, rather than remembering an offset that
  // could be stale after an Arrange edit or a restored draft.
  const offset = $derived.by(() => {
    if (!selected?.clips.length) return '0';
    const span = sourceTicks(sample);
    const total = editor.composition.bars * TICKS_PER_BAR;
    const wrap = (tick: number, modulus: number) => ((tick % modulus) + modulus) % modulus;
    const actual = selected.clips
      .map((clip) => (clip.kind === 'hit' ? clip.startTick : clip.sourceOffsetTick))
      .sort((a, b) => a - b);
    for (let distance = 0; distance <= 8; distance++) {
      for (const steps of distance ? [distance, -distance] : [0]) {
        for (const feel of LIVE_PATTERNS) {
          const reference = clipsForPattern(selected, editor.composition.bars, feel);
          if (
            reference.length !== selected.clips.length ||
            !reference.every((clip, index) => {
              const current = selected.clips[index];
              return (
                clip.kind === current?.kind &&
                (clip.kind === 'hit' && current.kind === 'hit'
                  ? clip.ratchet === current.ratchet
                  : clip.kind === 'loop' &&
                    current?.kind === 'loop' &&
                    clip.lengthTicks === current.lengthTicks)
              );
            })
          )
            continue;
          const shifted = reference
            .map((clip) =>
              wrap(
                (clip.kind === 'hit' ? clip.startTick : clip.sourceOffsetTick) +
                  steps * TICKS_PER_SIXTEENTH,
                clip.kind === 'hit' ? total : span,
              ),
            )
            .sort((a, b) => a - b);
          if (shifted.every((tick, index) => tick === actual[index]))
            return steps > 0 ? `+${steps}` : String(steps);
        }
      }
    }
    return 'CUSTOM';
  });

  const saveTake = () => {
    const wasRecording = editor.captureStatus === 'recording';
    editor.stopCapture();
    if (wasRecording && editor.performance) onTakeSaved();
  };

  $effect(() => {
    if (!editor.playing) {
      lastBeat = -1;
      return;
    }
    const beat = Math.floor(editor.playheadTick / 96);
    if (!stage || !motion.allowed || beat === lastBeat) return;
    lastBeat = beat;
    const icon = stage.querySelector<HTMLElement>('.transport .icon');
    if (icon) pulseBeat([icon], { accent: beat % 4 === 0 });
  });
  $effect(() => {
    if (!stage) return;
    const trackCount = tracks.length;
    const strips = stage.querySelectorAll<HTMLElement>('.timeline-progress');
    if (strips.length !== trackCount) return;
    const total = editor.composition.bars * TICKS_PER_BAR;
    if (!editor.playing || !motion.allowed || !total) {
      for (const strip of strips) strip.style.transform = 'scaleX(0)';
      return;
    }
    return subscribeFrame(() => {
      const progress = (editor.currentTick() % total) / total;
      for (const strip of strips) strip.style.transform = `scaleX(${progress})`;
    });
  });

  onMount(() =>
    editor.subscribeHits((hit) => {
      if (!hit.trackId || !stage) return;
      const object = stage.querySelector<HTMLElement>(
        `.sound-object[data-track-id="${CSS.escape(hit.trackId)}"]`,
      );
      if (!object) return;
      flashHit(object, { strength: hit.kind === 'loop' ? 0.7 : 1 });
      const mark = object.querySelector<HTMLElement>(`.hit-mark[data-tick="${hit.tick}"]`);
      if (mark) accentHitMark(mark);
    }),
  );
</script>

<section
  class="play-world mx-auto flex min-h-[calc(100dvh_-_64px)] w-[calc(100%_-_20px)] max-w-[1240px] items-center py-1 max-[899px]:block max-[899px]:min-h-0 max-[899px]:max-w-[600px]"
  aria-labelledby="play-title"
>
  <h1 id="play-title" class="sr-only">Play today's loop</h1>
  <div
    class="stage-frame grid w-full overflow-hidden border border-audle-outline bg-audle-deck-raised shadow-[var(--audle-deck-edge)] max-[899px]:grid-cols-1"
    bind:this={stage}
  >
    <div
      class="stage-topline flex min-h-[34px] items-center justify-between gap-2.5 border-b border-audle-grid-major px-3.5 py-1 font-mono text-[0.68rem] font-bold tracking-[0.06em] text-audle-text-muted max-[899px]:order-1 max-[540px]:text-[0.58rem]"
      role="status"
    >
      <span
        >PLAY <i
          class="ml-[5px] inline-block size-[7px] rounded-full bg-audle-text-dim"
          class:lit={editor.playing}
        ></i></span
      >
      {#if editor.captureStatus !== 'idle'}<strong class="capture-light text-audle-record-light"
          >{editor.captureStatus === 'count-in'
            ? 'COUNTING IN · STARTS NEXT BAR'
            : 'LIVE TAKE · RECORDING'}</strong
        >{/if}
      <span
        >{editor.loading
          ? 'DECODING SOUNDS'
          : !hasClips
            ? 'Tap a pad to build a loop'
            : `${activeCount.toString().padStart(2, '0')} LIVE`}</span
      >
    </div>
    <div
      class="stage-body contents min-[900px]:grid min-[900px]:grid-cols-[minmax(0,min(45vw,600px,calc(100dvh_-_210px)))_minmax(0,1fr)] min-[900px]:gap-3.5 min-[900px]:p-[6px_10px]"
    >
      <div
        class="objects grid aspect-square w-full grid-cols-4 gap-1.5 max-[899px]:order-2 max-[899px]:mx-auto max-[899px]:max-w-[465px] max-[899px]:px-2.5 max-[899px]:pb-6 max-[899px]:pt-1.5 max-[540px]:gap-1"
        aria-label="Sixteen sounds"
      >
        {#each tracks as track, index (track.id)}
          <SoundPad
            {editor}
            {track}
            {index}
            bars={editor.composition.bars}
            status={editor.liveStatus(track.id)}
            selected={editor.selectedTrackId === track.id}
            disabled={editor.loading || !!editor.loadingError || editor.playingPerformance}
            onToggle={(trackId) => void editor.selectOrActivateLive(trackId)}
          />
        {/each}
      </div>
      <section
        class="play-controls flex min-w-0 flex-col p-[2px_8px_0_4px] [&_button]:cursor-pointer [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-50 max-[899px]:order-4 max-[899px]:min-h-[370px] max-[899px]:px-3 max-[899px]:pb-3 max-[899px]:pt-1 max-[540px]:min-h-[380px]"
        aria-label="Selected sound controls"
        style={sourceIndex >= 0 ? `--source:var(--audle-source-${sourceIndex + 1})` : undefined}
      >
        <div class="identity-row flex min-w-0 flex-wrap items-center justify-between gap-2.5">
          <h2 class="min-w-0 flex-1 truncate text-[1.35rem] leading-[1.25] tracking-[-0.035em]">
            {selected ? selected.label : 'Pick a sound'}
          </h2>
          <div class="identity-actions flex flex-wrap gap-1.5 max-[540px]:w-full">
            <button
              type="button"
              class="hear-control inline-flex min-h-11 min-w-11 flex-none items-center gap-1.5 border border-audle-outline-subtle bg-audle-control px-2.5 text-[0.72rem] font-bold text-audle-text"
              disabled={!selected ||
                editor.loading ||
                !!editor.loadingError ||
                editor.playing ||
                editor.playingPerformance ||
                editor.captureStatus !== 'idle'}
              use:press
              onclick={() => void editor.auditionSelected()}
              ><Icon name="play" size={14} /> Hear it</button
            >
            <button
              type="button"
              class="solo-control min-h-11 min-w-11 flex-none whitespace-nowrap border border-audle-outline-subtle bg-audle-control px-[9px] text-[0.72rem] font-bold text-audle-text"
              aria-pressed={!!selected &&
                (editor.queuedSolo[selected.id] ?? selected.controls.solo)}
              disabled={!selected?.clips.length ||
                editor.loading ||
                !!editor.loadingError ||
                editor.captureStatus === 'count-in' ||
                editor.playingPerformance}
              use:press
              onclick={() => selected && editor.toggleLiveSolo(selected.id)}
              >Solo {selected && (editor.queuedSolo[selected.id] ?? selected.controls.solo)
                ? 'on'
                : 'off'}{selected && editor.queuedSolo[selected.id] !== undefined
                ? ' · next bar'
                : ''}</button
            >
            <button
              type="button"
              class="live-control min-h-11 min-w-11 flex-none whitespace-nowrap border border-audle-outline-subtle bg-audle-control px-[9px] text-[0.72rem] font-bold text-audle-text"
              aria-label={selected
                ? `${selected.label}, ${editor.liveStatus(selected.id).startsWith('queued') ? 'queued ' : ''}${(editor.queuedLive[selected.id] ?? selected.controls.muted) ? 'turn on' : 'turn off'}`
                : 'Turn selected sound on or off'}
              aria-pressed={!!selected &&
                !(editor.queuedLive[selected.id] ?? selected.controls.muted)}
              disabled={!selected?.clips.length ||
                editor.loading ||
                !!editor.loadingError ||
                editor.captureStatus === 'count-in' ||
                editor.playingPerformance}
              use:press
              onclick={() => selected && void editor.toggleLive(selected.id)}
              >{selected && (editor.queuedLive[selected.id] ?? selected.controls.muted)
                ? 'On'
                : 'Off'}{selected && editor.queuedLive[selected.id] !== undefined
                ? ' · next bar'
                : ''}</button
            >
          </div>
        </div>
        <div class="source-row flex min-h-[42px] min-w-0 items-center justify-between gap-2.5">
          <p
            class="m-0 min-w-0 font-mono text-[0.63rem] leading-[1.4] font-bold text-audle-text-muted max-[540px]:text-[0.58rem]"
          >
            {sample
              ? `${sample.role.toUpperCase()} · ${sample.kind === 'one-shot' ? 'ONE-SHOT' : 'LOOP'} · ${editor.loading ? 'Loading sound' : duration === undefined ? 'Duration unavailable' : `${duration < 1 ? duration.toFixed(2) : duration.toFixed(1)} sec`}${sample.kind === 'loop' ? ` · ${sample.bars ?? 2}-BAR SOURCE` : ''}`
              : 'Select a sound'}<span class="text-audle-text-dim max-[540px]:block"
              >&nbsp;· {editor.composition.bars}-BAR ARRANGEMENT</span
            >
          </p>
        </div>
        <div
          class="groove-heading mt-2 flex items-center justify-between gap-2 border-t border-audle-grid-major pt-2.5"
        >
          <div>
            <h3 class="m-0 text-base">Groove</h3>
            <p class="mb-0 mt-0.5 text-[0.72rem] text-audle-text-muted">
              {pattern === 'empty'
                ? 'Choose how this sound moves.'
                : pattern === 'custom'
                  ? 'Your own rhythm.'
                  : `${pattern[0]?.toUpperCase()}${pattern.slice(1)} feel for this sound.`}
            </p>
          </div>
          <div
            class="offset flex flex-none items-center gap-[3px]"
            role="group"
            aria-label="Pattern offset"
          >
            <span
              class="mr-[5px] whitespace-nowrap font-mono text-[0.6rem] font-bold text-audle-text-muted"
              >OFFSET <output>{offset}</output></span
            ><button
              class="min-h-11 min-w-11 flex-none border border-audle-outline-subtle bg-audle-control text-[0.72rem] font-bold text-audle-text"
              type="button"
              aria-label="Offset pattern one step earlier"
              disabled={!selected?.clips.length || feelDisabled}
              use:press={{ disabled: !selected?.clips.length || feelDisabled }}
              onclick={() => selected && editor.offsetLivePattern(selected.id, -1)}>−1</button
            ><button
              class="min-h-11 min-w-11 flex-none border border-audle-outline-subtle bg-audle-control text-[0.72rem] font-bold text-audle-text"
              type="button"
              aria-label="Offset pattern one step later"
              disabled={!selected?.clips.length || feelDisabled}
              use:press={{ disabled: !selected?.clips.length || feelDisabled }}
              onclick={() => selected && editor.offsetLivePattern(selected.id, 1)}>+1</button
            >
          </div>
        </div>
        <div
          class="patterns mt-[9px] grid grid-cols-3 border border-audle-outline-subtle bg-audle-control max-[540px]:grid-cols-2"
          role="group"
          aria-label="Pattern feel"
        >
          {#each LIVE_PATTERNS as option (option)}
            <button
              class="relative min-h-11 border-0 border-b border-e border-audle-outline-subtle bg-transparent p-[5px] text-[0.74rem] font-bold capitalize text-audle-text disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              class:chosen={pattern === option}
              disabled={feelDisabled}
              aria-pressed={pattern === option}
              use:press={{ disabled: feelDisabled }}
              use:popOn={pattern === option}
              onclick={() => selected && editor.chooseLivePattern(selected.id, option)}
              >{option}</button
            >
          {/each}
        </div>
        <div
          class="dials mt-auto grid grid-cols-2 gap-x-1.5 gap-y-1 border-t border-audle-grid-major pt-2 min-[1101px]:grid-cols-3 max-[400px]:grid-cols-1"
          aria-label="Sound tuning"
        >
          <Knob
            dial
            label="Level"
            value={selected?.controls.gainDb ?? 0}
            min={-24}
            max={6}
            step={0.5}
            valueText={`${selected?.controls.gainDb ?? 0} dB`}
            disabled={tuningDisabled}
            resetValue={DEFAULT_TRACK_CONTROLS.gainDb}
            onReset={() => resetControl('gainDb')}
            onStart={() => editor.beginControlGesture()}
            onChange={(gainDb) =>
              selected && editor.updateSelectedTrackControls({ ...selected.controls, gainDb })}
            onEnd={() => editor.endControlGesture()}
          />
          <Knob
            dial
            label="Pan"
            value={selected?.controls.pan ?? 0}
            min={-1}
            max={1}
            step={0.05}
            valueText={!selected?.controls.pan
              ? 'CENTER'
              : `${selected.controls.pan < 0 ? 'LEFT' : 'RIGHT'} ${Math.round(Math.abs(selected.controls.pan) * 100)}`}
            disabled={tuningDisabled}
            resetValue={DEFAULT_TRACK_CONTROLS.pan}
            onReset={() => resetControl('pan')}
            onStart={() => editor.beginControlGesture()}
            onChange={(pan) =>
              selected && editor.updateSelectedTrackControls({ ...selected.controls, pan })}
            onEnd={() => editor.endControlGesture()}
          />
          <Knob
            dial
            label="Tune"
            value={selected?.controls.tuneSemitones ?? 0}
            min={-12}
            max={12}
            step={1}
            valueText={!selected?.controls.tuneSemitones
              ? 'ORIGINAL'
              : `${selected.controls.tuneSemitones > 0 ? '+' : '−'}${Math.abs(selected.controls.tuneSemitones)} ${Math.abs(selected.controls.tuneSemitones) === 1 ? 'STEP' : 'STEPS'}`}
            disabled={tuningDisabled}
            onStart={() => editor.beginControlGesture()}
            resetValue={DEFAULT_TRACK_CONTROLS.tuneSemitones}
            onReset={() => resetControl('tuneSemitones')}
            onChange={(tuneSemitones) =>
              selected &&
              editor.updateSelectedTrackControls({ ...selected.controls, tuneSemitones })}
            onEnd={() => editor.endControlGesture()}
          />
          <Knob
            dial
            label="Space"
            detail="Hall reverb"
            value={selected?.controls.space ?? 0}
            min={0}
            max={1}
            step={0.05}
            valueText={`${Math.round((selected?.controls.space ?? 0) * 100)}%`}
            disabled={tuningDisabled}
            resetValue={DEFAULT_TRACK_CONTROLS.space}
            onReset={() => resetControl('space')}
            onStart={() => editor.beginControlGesture()}
            onChange={(space) =>
              selected && editor.updateSelectedTrackControls({ ...selected.controls, space })}
            onEnd={() => editor.endControlGesture()}
          />
          <Knob
            dial
            label="Echo"
            detail="Repeats"
            value={selected?.controls.echo ?? 0}
            min={0}
            max={1}
            step={0.05}
            valueText={`${Math.round((selected?.controls.echo ?? 0) * 100)}%`}
            disabled={tuningDisabled}
            resetValue={DEFAULT_TRACK_CONTROLS.echo}
            onReset={() => resetControl('echo')}
            onStart={() => editor.beginControlGesture()}
            onChange={(echo) =>
              selected && editor.updateSelectedTrackControls({ ...selected.controls, echo })}
            onEnd={() => editor.endControlGesture()}
          />
          <Knob
            dial
            label="Fuzz"
            detail="Distortion"
            value={selected?.controls.fuzz ?? 0}
            min={0}
            max={1}
            step={0.05}
            valueText={`${Math.round((selected?.controls.fuzz ?? 0) * 100)}%`}
            disabled={tuningDisabled}
            resetValue={DEFAULT_TRACK_CONTROLS.fuzz}
            onReset={() => resetControl('fuzz')}
            onStart={() => editor.beginControlGesture()}
            onChange={(fuzz) =>
              selected && editor.updateSelectedTrackControls({ ...selected.controls, fuzz })}
            onEnd={() => editor.endControlGesture()}
          />
        </div>
      </section>
    </div>
    <div
      class="play-footer flex min-h-16 items-center justify-between gap-2.5 border-t border-audle-grid-major bg-audle-deck px-3 py-2 max-[899px]:order-3 max-[540px]:flex-wrap"
    >
      <div class="footer-main flex gap-[7px] max-[540px]:order-0 max-[540px]:basis-full">
        <button
          class="transport inline-flex min-h-12 items-center justify-center gap-[7px] whitespace-nowrap border border-audle-outline bg-audle-accent px-3.5 text-[0.78rem] font-bold text-audle-accent-ink shadow-[var(--audle-control-rest)] disabled:cursor-not-allowed disabled:opacity-45 max-[540px]:flex-1 max-[540px]:px-1.5"
          type="button"
          disabled={editor.loading || !!editor.loadingError}
          use:press
          onclick={() => void editor.togglePlayback()}
          >{#if editor.playing}<Icon name="stop" /> Stop loop{:else}<Icon name="play" /> Play loop{/if}</button
        ><button
          class="record inline-flex min-h-12 items-center justify-center gap-[7px] whitespace-nowrap border border-audle-outline bg-audle-control px-3.5 text-[0.78rem] font-bold text-audle-text shadow-[var(--audle-control-rest)] disabled:cursor-not-allowed disabled:opacity-45 max-[540px]:flex-1 max-[540px]:px-1.5"
          class:armed={editor.captureStatus !== 'idle'}
          type="button"
          aria-pressed={editor.captureStatus !== 'idle'}
          disabled={editor.loading ||
            !!editor.loadingError ||
            editor.playingPerformance ||
            !editor.composition.tracks.some((track) => track.clips.length)}
          use:press
          onclick={() =>
            editor.captureStatus === 'idle' ? void editor.startCapture() : saveTake()}
          ><Icon name="record" />{editor.captureStatus === 'idle'
            ? editor.performance
              ? 'Record new take'
              : 'Record a take'
            : editor.captureStatus === 'count-in'
              ? 'Cancel count-in'
              : 'Save take'}</button
        >
      </div>
      <div class="next-actions flex gap-[7px] max-[540px]:order-2 max-[540px]:basis-full">
        <button
          type="button"
          class="share inline-flex min-h-12 items-center justify-center gap-[7px] whitespace-nowrap border border-audle-outline bg-audle-control px-3.5 text-[0.78rem] font-bold text-audle-text shadow-[var(--audle-control-rest)] disabled:cursor-not-allowed disabled:opacity-45 max-[540px]:flex-1 max-[540px]:px-1.5"
          disabled={!editor.composition.tracks.some((track) => track.clips.length)}
          use:press
          onclick={onShare}><Icon name="share" /> Share</button
        ><button
          class="inline-flex min-h-12 items-center justify-center gap-[7px] whitespace-nowrap border border-audle-outline bg-audle-control px-3.5 text-[0.78rem] font-bold text-audle-text shadow-[var(--audle-control-rest)] max-[540px]:flex-1 max-[540px]:px-1.5"
          type="button"
          aria-label="Go to Arrange"
          use:press
          onclick={onArrange}>Arrange <Icon name="arrow-right" /></button
        >
      </div>
    </div>
  </div>
</section>

<style>
  .stage-topline i.lit {
    background: var(--audle-accent);
  }

  .hear-control {
    border-color: oklch(var(--source) / 0.7);
  }

  .hear-control :global(.icon) {
    color: oklch(var(--source));
  }

  .solo-control[aria-pressed='true'] {
    border-color: oklch(var(--source));
    background: color-mix(in srgb, var(--audle-control) 70%, oklch(var(--source)) 30%);
  }

  .offset output {
    color: oklch(var(--source));
  }

  .offset button:hover:not(:disabled),
  .hear-control:hover:not(:disabled),
  .solo-control:hover:not(:disabled) {
    background: color-mix(in srgb, var(--audle-control) 80%, oklch(var(--source)) 20%);
  }

  .patterns button:nth-child(3n) {
    border-inline-end: 0;
  }

  .patterns button:nth-last-child(-n + 3) {
    border-block-end: 0;
  }

  .patterns button:hover:not(:disabled),
  .patterns button:global([data-pressed='true']) {
    background: color-mix(in srgb, var(--audle-control) 75%, oklch(var(--source)) 25%);
  }

  .patterns button.chosen {
    background: color-mix(in srgb, var(--audle-control) 65%, oklch(var(--source)) 35%);
    box-shadow: inset 0 -2px oklch(var(--source));
  }

  .play-footer .record :global(.icon) {
    color: var(--audle-record-light);
  }

  .play-footer .record.armed {
    border-color: var(--audle-record-light);
    background: var(--audle-record-surface);
  }

  /* A transient notice occupies the same viewport as the instrument, not an extra page. */
  @media (min-width: 900px) {
    :global(.app-shell:has(.notice)) .play-world {
      min-block-size: calc(100dvh - 130px);
    }

    :global(.app-shell:has(.notice)) .stage-body {
      grid-template-columns: minmax(0, min(45vw, 600px, calc(100dvh - 276px))) minmax(0, 1fr);
    }
  }

  @media (max-width: 540px) {
    .patterns button:nth-child(3n) {
      border-inline-end: 1px solid var(--audle-outline-subtle);
    }

    .patterns button:nth-child(2n) {
      border-inline-end: 0;
    }

    .patterns button:nth-last-child(3) {
      border-block-end: 1px solid var(--audle-outline-subtle);
    }
  }
</style>
