<script lang="ts">
  import { onMount } from 'svelte';
  import { LIVE_PATTERNS, clipsForPattern } from '../domain/live';
  import { sampleById } from '../data/samples';
  import {
    SOURCES_PER_DAY,
    sourceTicks,
    TICKS_PER_BAR,
    TICKS_PER_SIXTEENTH,
  } from '../domain/model';
  import { accentHitMark, flashHit, meterKick, motion, popOn, press, pulseBeat } from '../motion';
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
  const selected = $derived(editor.selectedTrack);
  const sample = $derived(selected ? sampleById(selected.sampleId) : undefined);
  const sourceIndex = $derived(tracks.findIndex((track) => track.sampleId === selected?.sampleId));
  const activeCount = $derived(
    tracks.filter((track) => editor.liveStatus(track.id) === 'on').length,
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
  let progressFrame = 0;
  const updateProgress = () => {
    const total = editor.composition.bars * TICKS_PER_BAR;
    if (stage && total)
      stage.style.setProperty('--play-progress', String((editor.currentTick() % total) / total));
    progressFrame = requestAnimationFrame(updateProgress);
  };

  $effect(() => {
    if (!stage) return;
    if (editor.playing && motion.allowed) progressFrame = requestAnimationFrame(updateProgress);
    else stage.style.setProperty('--play-progress', '0');
    return () => cancelAnimationFrame(progressFrame);
  });

  onMount(() =>
    editor.subscribeHits((hit) => {
      if (!hit.trackId || !stage) return;
      const object = stage.querySelector<HTMLElement>(
        `.sound-object[data-track-id="${CSS.escape(hit.trackId)}"]`,
      );
      if (!object) return;
      flashHit(object, { strength: hit.kind === 'loop' ? 0.7 : 1 });
      const meter = object.querySelector<HTMLElement>('.object-meter');
      if (meter) meterKick(meter, { floor: 0.3 });
      const mark = object.querySelector<HTMLElement>(`.hit-mark[data-tick="${hit.tick}"]`);
      if (mark) accentHitMark(mark);
    }),
  );
</script>

<section class="play-world" aria-labelledby="play-title">
  <h1 id="play-title" class="sr-only">Play today's loop</h1>
  <div class="stage-frame" bind:this={stage}>
    <div class="stage-topline" role="status">
      <span>PLAY <i class:lit={editor.playing}></i></span>
      {#if editor.captureStatus !== 'idle'}<strong class="capture-light"
          >{editor.captureStatus === 'count-in'
            ? 'COUNTING IN · STARTS NEXT BAR'
            : 'LIVE TAKE · RECORDING'}</strong
        >{/if}
      <span
        >{editor.loading
          ? 'DECODING SOUNDS'
          : `${activeCount.toString().padStart(2, '0')} LIVE`}</span
      >
    </div>
    <div class="stage-body">
      <div class="objects" aria-label="Sixteen sounds">
        {#each tracks as track, index (track.id)}
          <SoundPad
            {editor}
            {track}
            {index}
            bars={editor.composition.bars}
            status={editor.liveStatus(track.id)}
            selected={editor.selectedTrackId === track.id}
            disabled={editor.loading || !!editor.loadingError || editor.playingPerformance}
            onToggle={(trackId) => void editor.toggleLive(trackId)}
          />
        {/each}
      </div>
      <section
        class="play-controls"
        aria-label="Selected sound controls"
        style={sourceIndex >= 0 ? `--source:var(--audle-source-${sourceIndex + 1})` : undefined}
      >
        <div class="identity-row">
          <h2>{selected ? selected.label : 'Pick a sound'}</h2>
          <div class="identity-actions">
            <button
              type="button"
              class="hear-control"
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
              class="solo-control"
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
          </div>
        </div>
        <div class="source-row">
          <p>
            {sample
              ? `${sample.role.toUpperCase()} · ${sample.kind === 'one-shot' ? 'ONE-SHOT' : 'LOOP'} · ${editor.loading ? 'Loading sound' : duration === undefined ? 'Duration unavailable' : `${duration < 1 ? duration.toFixed(2) : duration.toFixed(1)} sec`}${sample.kind === 'loop' ? ` · ${sample.bars ?? 2}-BAR SOURCE` : ''}`
              : 'Select a sound'}<span>&nbsp;· {editor.composition.bars}-BAR ARRANGEMENT</span>
          </p>
        </div>
        <div class="groove-heading">
          <div>
            <h3>Groove</h3>
            <p>
              {pattern === 'empty'
                ? 'Choose how this sound moves.'
                : pattern === 'custom'
                  ? 'Your own rhythm.'
                  : `${pattern[0]?.toUpperCase()}${pattern.slice(1)} feel for this sound.`}
            </p>
          </div>
          <div class="offset" role="group" aria-label="Pattern offset">
            <span>OFFSET <output>{offset}</output></span><button
              type="button"
              aria-label="Offset pattern one step earlier"
              disabled={!selected?.clips.length || feelDisabled}
              use:press={{ disabled: !selected?.clips.length || feelDisabled }}
              onclick={() => selected && editor.offsetLivePattern(selected.id, -1)}>−1</button
            ><button
              type="button"
              aria-label="Offset pattern one step later"
              disabled={!selected?.clips.length || feelDisabled}
              use:press={{ disabled: !selected?.clips.length || feelDisabled }}
              onclick={() => selected && editor.offsetLivePattern(selected.id, 1)}>+1</button
            >
          </div>
        </div>
        <div class="patterns" role="group" aria-label="Pattern feel">
          {#each LIVE_PATTERNS as option (option)}<button
              type="button"
              class:chosen={pattern === option}
              disabled={feelDisabled}
              aria-pressed={pattern === option}
              use:press={{ disabled: feelDisabled }}
              use:popOn={pattern === option}
              onclick={() => selected && editor.chooseLivePattern(selected.id, option)}
              >{option}</button
            >{/each}
        </div>
        <div class="dials" aria-label="Sound tuning">
          <Knob
            dial
            label="Level"
            value={selected?.controls.gainDb ?? 0}
            min={-24}
            max={6}
            step={0.5}
            valueText={`${selected?.controls.gainDb ?? 0} dB`}
            disabled={tuningDisabled}
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
            onStart={() => editor.beginControlGesture()}
            onChange={(fuzz) =>
              selected && editor.updateSelectedTrackControls({ ...selected.controls, fuzz })}
            onEnd={() => editor.endControlGesture()}
          />
        </div>
      </section>
    </div>
    <div class="play-footer">
      <div class="footer-main">
        <button
          class="transport"
          type="button"
          disabled={editor.loading || !!editor.loadingError}
          use:press
          onclick={() => void editor.togglePlayback()}
          >{#if editor.playing}<Icon name="stop" /> Stop loop{:else}<Icon name="play" /> Play loop{/if}</button
        ><button
          class="record"
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
      <div class="next-actions">
        <button
          type="button"
          class="share"
          disabled={!editor.composition.tracks.some((track) => track.clips.length)}
          use:press
          onclick={onShare}><Icon name="share" /> Share</button
        ><button type="button" aria-label="Go to Arrange" use:press onclick={onArrange}
          >Arrange <Icon name="arrow-right" /></button
        >
      </div>
    </div>
  </div>
</section>

<style>
  .sr-only {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .play-world {
    inline-size: min(100% - 20px, 1060px);
    margin: 0 auto;
    padding: 4px 0;
  }
  .stage-frame {
    overflow: hidden;
    border: 1px solid var(--audle-outline);
    background: var(--audle-deck-raised);
    box-shadow: var(--audle-deck-edge);
  }
  .stage-topline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-block-size: 34px;
    padding: 4px 14px;
    border-bottom: 1px solid var(--audle-grid-major);
    color: var(--audle-text-muted);
    font:
      700 0.68rem ui-monospace,
      monospace;
    letter-spacing: 0.06em;
  }
  .stage-topline i {
    display: inline-block;
    inline-size: 7px;
    block-size: 7px;
    margin-inline-start: 5px;
    border-radius: 50%;
    background: var(--audle-text-dim);
  }
  .stage-topline i.lit {
    background: var(--audle-accent);
  }
  .capture-light {
    color: var(--audle-record-light);
  }
  .stage-body {
    display: grid;
    grid-template-columns: minmax(0, 440px) minmax(0, 1fr);
    gap: 14px;
    padding: 6px 10px;
  }
  .objects {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
    inline-size: 100%;
    aspect-ratio: 1;
  }
  .play-controls {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
    padding: 2px 8px 0 4px;
  }
  .identity-row,
  .source-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-inline-size: 0;
  }
  .identity-actions {
    display: flex;
    flex: none;
    gap: 6px;
  }
  .identity-row h2 {
    min-inline-size: 0;
    margin: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 1.35rem;
    line-height: 1.25;
    letter-spacing: -0.035em;
  }
  .play-controls button {
    cursor: pointer;
  }
  .play-controls button:disabled {
    opacity: 0.48;
    cursor: not-allowed;
  }
  .hear-control,
  .solo-control,
  .offset button {
    flex: none;
    min-block-size: 44px;
    min-inline-size: 44px;
    border: 1px solid var(--audle-outline-subtle);
    background: var(--audle-control);
    color: var(--audle-text);
    font-size: 0.72rem;
    font-weight: 700;
  }
  .hear-control {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding-inline: 10px;
    border-color: oklch(var(--source) / 0.7);
  }
  .hear-control :global(.icon) {
    color: oklch(var(--source));
  }
  .source-row {
    min-block-size: 42px;
  }
  .source-row p {
    min-inline-size: 0;
    margin: 0;
    color: var(--audle-text-muted);
    font:
      700 0.63rem/1.4 ui-monospace,
      monospace;
  }
  .source-row p span {
    color: var(--audle-text-dim);
  }
  .solo-control {
    padding-inline: 9px;
    white-space: nowrap;
  }
  .solo-control[aria-pressed='true'] {
    border-color: oklch(var(--source));
    background: color-mix(in srgb, var(--audle-control) 70%, oklch(var(--source)) 30%);
  }
  .groove-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-block-start: 8px;
    padding-block-start: 10px;
    border-top: 1px solid var(--audle-grid-major);
  }
  .groove-heading h3 {
    margin: 0;
    font-size: 1rem;
  }
  .groove-heading p {
    margin: 2px 0 0;
    color: var(--audle-text-muted);
    font-size: 0.72rem;
  }
  .offset {
    display: flex;
    flex: none;
    align-items: center;
    gap: 3px;
  }
  .offset span {
    margin-inline-end: 5px;
    color: var(--audle-text-muted);
    font:
      700 0.6rem ui-monospace,
      monospace;
    white-space: nowrap;
  }
  .offset output {
    color: oklch(var(--source));
  }
  .offset button:hover:not(:disabled),
  .hear-control:hover:not(:disabled),
  .solo-control:hover:not(:disabled) {
    background: color-mix(in srgb, var(--audle-control) 80%, oklch(var(--source)) 20%);
  }
  .patterns {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-block-start: 9px;
    border: 1px solid var(--audle-outline-subtle);
    background: var(--audle-control);
  }
  .patterns button {
    position: relative;
    min-block-size: 44px;
    padding: 5px;
    border: 0;
    border-inline-end: 1px solid var(--audle-outline-subtle);
    border-block-end: 1px solid var(--audle-outline-subtle);
    background: transparent;
    color: var(--audle-text);
    font-size: 0.74rem;
    font-weight: 700;
    text-transform: capitalize;
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
  .dials {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 4px 6px;
    margin-block-start: auto;
    padding-block-start: 8px;
    border-top: 1px solid var(--audle-grid-major);
  }
  .play-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-block-size: 64px;
    padding: 8px 12px;
    border-top: 1px solid var(--audle-grid-major);
    background: var(--audle-deck);
  }
  .footer-main,
  .next-actions {
    display: flex;
    gap: 7px;
  }
  .footer-main {
    justify-self: start;
  }
  .next-actions {
    justify-self: end;
  }
  .play-footer button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-block-size: 48px;
    padding-inline: 14px;
    border: 1px solid var(--audle-outline);
    background: var(--audle-control);
    box-shadow: var(--audle-control-rest);
    color: var(--audle-text);
    cursor: pointer;
    font-size: 0.78rem;
    font-weight: 700;
    white-space: nowrap;
  }
  .play-footer button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .play-footer .transport {
    border-color: var(--audle-accent);
    background: var(--audle-accent);
    color: var(--audle-accent-ink);
  }
  .play-footer .record :global(.icon) {
    color: var(--audle-record-light);
  }
  .play-footer .record.armed {
    border-color: var(--audle-record-light);
    background: var(--audle-record-surface);
  }
  @media (max-width: 899px) {
    .play-world {
      inline-size: min(100% - 20px, 600px);
    }
    .stage-body {
      grid-template-columns: minmax(0, 1fr);
    }
    .objects {
      max-inline-size: 465px;
      margin-inline: auto;
    }
    .play-controls {
      min-block-size: 370px;
      padding: 4px;
    }
  }
  @media (max-width: 540px) {
    .stage-topline {
      font-size: 0.58rem;
    }
    .objects {
      gap: 4px;
    }
    .play-controls {
      min-block-size: 380px;
    }
    .source-row p {
      font-size: 0.58rem;
    }
    .source-row p span {
      display: block;
    }
    .patterns {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .patterns button:nth-child(3n) {
      border-inline-end: 1px solid var(--audle-outline-subtle);
    }
    .patterns button:nth-child(2n) {
      border-inline-end: 0;
    }
    .patterns button:nth-last-child(3) {
      border-block-end: 1px solid var(--audle-outline-subtle);
    }
    .play-footer {
      flex-wrap: wrap;
      display: flex;
    }
    .footer-main,
    .next-actions {
      flex: 1 1 100%;
    }
    .footer-main {
      order: 0;
    }
    .next-actions {
      order: 2;
    }
    .play-footer button {
      flex: 1;
      padding-inline: 6px;
    }
  }
</style>
