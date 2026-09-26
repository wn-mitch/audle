<script lang="ts">
  import { onMount } from 'svelte';
  import { flashHit, meterKick, motion, popOn, press, pulseBeat } from '../motion';
  import { LIVE_PATTERNS, type LivePattern } from '../domain/live';
  import { sampleById } from '../data/samples';
  import { SOURCES_PER_DAY } from '../domain/model';
  import type { EditorState } from '../state/editor.svelte';
  const STEPS = Array.from({ length: 16 }, (_, step) => step);
  const MARK_STEPS = Array.from({ length: 8 }, (_, step) => step);

  /** The eighth-note positions each feel plays, drawn as the mark on its button. */
  const PATTERN_MARKS: Record<LivePattern, readonly number[]> = {
    steady: [0, 2, 4, 6],
    sparse: [0],
    moving: [0, 3, 5],
    offbeat: [1, 3, 5, 7],
    dense: [0, 1, 2, 3, 4, 5, 6, 7],
    halftime: [0, 4],
  };

  let {
    editor,
    onArrange,
    onFinish,
  }: {
    editor: EditorState;
    onArrange: () => void;
    onFinish: () => void;
  } = $props();
  let stage: HTMLElement;
  const tracks = $derived(editor.composition.tracks.slice(0, SOURCES_PER_DAY));
  const selected = $derived(
    editor.composition.tracks.find((track) => track.id === editor.selectedTrackId),
  );
  const activeCount = $derived(
    tracks.filter((track) => editor.liveStatus(track.id) === 'on').length,
  );
  const pattern = $derived(selected ? editor.livePattern(selected.id) : 'empty');
  /** How many of the sixteen steps the selected sound fills, for the strip's text alternative. */
  const litSteps = $derived(
    STEPS.filter((step) =>
      selected?.clips.some((clip) =>
        clip.startTick <= step * 24
          ? clip.kind === 'hit'
            ? clip.startTick === step * 24
            : clip.startTick + clip.lengthTicks > step * 24
          : false,
      ),
    ).length,
  );
  let lastBeat = -1;

  /** The beat pulse rides the transport snapshot; the hit flash below rides each sound. */
  $effect(() => {
    if (!editor.playing) {
      lastBeat = -1;
      return;
    }
    const beat = Math.floor(editor.playheadTick / 96);
    if (!stage || !motion.allowed || beat === lastBeat) return;
    lastBeat = beat;
    pulseBeat(stage.querySelectorAll<HTMLElement>('.sound-object[data-active="true"] .glyph'), {
      accent: beat % 4 === 0,
    });
  });

  onMount(() =>
    editor.subscribeHits((hit) => {
      if (!hit.trackId || !stage) return;
      const object = stage.querySelector<HTMLElement>(
        `.sound-object[data-track-id="${hit.trackId}"]`,
      );
      if (!object) return;
      flashHit(object, { strength: hit.kind === 'loop' ? 0.7 : 1 });
      const meter = object.querySelector<HTMLElement>('.object-meter');
      if (meter) meterKick(meter, { floor: 0.3 });
    }),
  );
</script>

<section class="play-world" aria-labelledby="play-title">
  <h1 id="play-title" class="sr-only">Play today's loop</h1>
  {#if editor.captureStatus !== 'idle'}
    <div class="capture-banner" role="status">
      <span class:recording={editor.captureStatus === 'recording'} class="capture-light"
      ></span><strong
        >{editor.captureStatus === 'count-in'
          ? 'COUNTING IN · STARTS NEXT BAR'
          : 'LIVE TAKE · RECORDING'}</strong
      ><span>Switch sounds on the field to shape your take.</span><button
        type="button"
        onclick={() => editor.stopCapture()}
        >{editor.captureStatus === 'count-in' ? 'Cancel' : 'Save take'} →</button
      >
    </div>
  {/if}
  <div class="stage-frame" bind:this={stage}>
    <div class="stage-topline">
      <span>{activeCount.toString().padStart(2, '0')} LIVE <i class:lit={editor.playing}></i></span>
    </div>
    <div class="objects">
      {#each tracks as track, index (track.id)}
        {@const sample = sampleById(track.sampleId)}
        {@const status = editor.liveStatus(track.id)}
        <button
          type="button"
          class="sound-object"
          class:active={status === 'on'}
          class:selected={editor.selectedTrackId === track.id}
          class:pending={status.startsWith('queued')}
          data-active={status === 'on'}
          data-track-id={track.id}
          style={`--source:var(--audle-source-${index + 1})`}
          use:press={{
            disabled: editor.loading || !!editor.loadingError || editor.playingPerformance,
          }}
          aria-label={`${sample?.label ?? track.label}, ${status === 'empty' ? 'add to loop' : status === 'off' ? 'off, turn on' : status === 'on' ? 'on, turn off' : 'queued for next bar'}`}
          aria-pressed={status === 'on'}
          disabled={editor.loading || !!editor.loadingError || editor.playingPerformance}
          onclick={() => void editor.toggleLive(track.id)}
        >
          <span class="object-number"
            >{(index + 1).toString().padStart(2, '0')}
            <span class="object-role">{sample?.role}</span></span
          >
          <span class="glyph" aria-hidden="true">
            {#if Math.floor(index / 2) % 8 === 0}<span class="shape rings"
                ><i></i><i></i><i></i></span
              >
            {:else if Math.floor(index / 2) % 8 === 1}<span class="shape coils"
                ><i></i><i></i><i></i></span
              >
            {:else if Math.floor(index / 2) % 8 === 2}<span class="shape prism"><i></i><i></i></span
              >
            {:else if Math.floor(index / 2) % 8 === 3}<span class="shape wave"
                ><i></i><i></i><i></i><i></i></span
              >
            {:else if Math.floor(index / 2) % 8 === 4}<span class="shape spike"
                ><i></i><i></i><i></i><i></i></span
              >
            {:else if Math.floor(index / 2) % 8 === 5}<span class="shape bars"
                ><i></i><i></i><i></i><i></i></span
              >
            {:else if Math.floor(index / 2) % 8 === 6}<span class="shape orbit"
                ><i></i><i></i><i></i></span
              >
            {:else}<span class="shape lattice"><i></i><i></i><i></i><i></i></span>{/if}
          </span>
          <span class="object-bottom"
            ><strong>{sample?.label ?? track.label}</strong>{#if status.startsWith('queued')}<span
                >NEXT BAR</span
              >{/if}</span
          >
          <span class="object-meter" aria-hidden="true"></span>
        </button>
      {/each}
    </div>
  </div>

  <section class="play-controls" aria-label="Live controls">
    <div class="control-heading">
      <h2>{selected ? selected.label : 'Pick a sound'}</h2>
      {#if selected}
        <button
          class="solo-control"
          type="button"
          aria-pressed={editor.queuedSolo[selected.id] ?? selected.controls.solo}
          disabled={!selected.clips.length ||
            editor.captureStatus === 'count-in' ||
            editor.playingPerformance}
          onclick={() => editor.toggleLiveSolo(selected.id)}
          >SOLO {(editor.queuedSolo[selected.id] ?? selected.controls.solo) ? 'ON' : 'OFF'}{editor
            .queuedSolo[selected.id] !== undefined
            ? ' · NEXT BAR'
            : ''}</button
        >
        <div class="offset" role="group" aria-label="Pattern offset">
          <span>OFFSET</span>
          <button
            type="button"
            aria-label="Offset pattern one step earlier"
            disabled={!selected.clips.length ||
              editor.captureStatus !== 'idle' ||
              editor.playingPerformance}
            use:press={{
              disabled:
                !selected.clips.length ||
                editor.captureStatus !== 'idle' ||
                editor.playingPerformance,
            }}
            onclick={() => editor.offsetLivePattern(selected.id, -1)}>−1</button
          ><button
            type="button"
            aria-label="Offset pattern one step later"
            disabled={!selected.clips.length ||
              editor.captureStatus !== 'idle' ||
              editor.playingPerformance}
            use:press={{
              disabled:
                !selected.clips.length ||
                editor.captureStatus !== 'idle' ||
                editor.playingPerformance,
            }}
            onclick={() => editor.offsetLivePattern(selected.id, 1)}>+1</button
          >
        </div>
      {/if}
    </div>
    <div class="patterns" role="group" aria-label="Pattern feel">
      {#each LIVE_PATTERNS as option (option)}
        <button
          type="button"
          class:chosen={pattern === option}
          disabled={!selected || editor.captureStatus !== 'idle' || editor.playingPerformance}
          aria-pressed={pattern === option}
          use:press={{
            disabled: !selected || editor.captureStatus !== 'idle' || editor.playingPerformance,
          }}
          use:popOn={pattern === option}
          onclick={() => selected && editor.chooseLivePattern(selected.id, option)}
          ><span class="pattern-mark" aria-hidden="true"
            >{#each MARK_STEPS as step (step)}<i class:on={PATTERN_MARKS[option].includes(step)}
              ></i>{/each}</span
          ><strong>{option}</strong></button
        >
      {/each}
    </div>
    {#if selected}
      <details class="fine-tune">
        <summary>Fine-tune <span>↗</span></summary>
        <fieldset
          disabled={editor.captureStatus !== 'idle' || editor.playingPerformance}
          class="tune-fields"
        >
          <label
            >Level <input
              aria-label="Level"
              type="range"
              min="-24"
              max="6"
              step="0.5"
              value={selected.controls.gainDb}
              oninput={(event) =>
                editor.updateSelectedTrackControls({
                  ...selected.controls,
                  gainDb: Number(event.currentTarget.value),
                })}
            /></label
          >
          <label
            >Pan <input
              aria-label="Pan"
              type="range"
              min="-1"
              max="1"
              step="0.05"
              value={selected.controls.pan}
              oninput={(event) =>
                editor.updateSelectedTrackControls({
                  ...selected.controls,
                  pan: Number(event.currentTarget.value),
                })}
            /></label
          >
          <label
            >Tune <input
              aria-label="Tune"
              type="range"
              min="-12"
              max="12"
              step="1"
              value={selected.controls.tuneSemitones}
              oninput={(event) =>
                editor.updateSelectedTrackControls({
                  ...selected.controls,
                  tuneSemitones: Number(event.currentTarget.value),
                })}
            /></label
          >
        </fieldset>
      </details>
    {/if}
    <div
      class="pattern-strip"
      role="img"
      aria-label={`${selected?.label ?? 'No sound'} pattern: ${litSteps} of 16 steps`}
    >
      <div class="steps">
        {#each STEPS as step (step)}<span
            class:hit={!!selected?.clips.some(
              (clip) =>
                clip.startTick <= step * 24 &&
                (clip.kind === 'hit'
                  ? clip.startTick === step * 24
                  : clip.startTick + clip.lengthTicks > step * 24),
            )}
            class:current={editor.playing && Math.floor(editor.playheadTick / 24) % 16 === step}
          ></span>{/each}
      </div>
    </div>
  </section>

  <div class="play-footer">
    <button
      class="transport"
      type="button"
      disabled={editor.loading || !!editor.loadingError}
      onclick={() => void editor.togglePlayback()}
      >{editor.playing ? '■  Stop loop' : '▶  Play loop'}</button
    >
    <div class="next-actions">
      <button type="button" onclick={onArrange}>Arrange <span>↗</span></button><button
        type="button"
        class="finish"
        disabled={!editor.composition.tracks.some((track) => track.clips.length)}
        onclick={onFinish}>Finish <span>→</span></button
      >
    </div>
  </div>
</section>

<style>
  .play-world {
    inline-size: min(100% - 36px, 1220px);
    margin: 0 auto;
    padding: clamp(30px, 4vw, 56px) 0 56px;
  }
  .capture-banner {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    margin: -6px 0 18px;
    padding: 12px 15px;
    border: 1px solid var(--audle-record-light);
    background: var(--audle-record-surface);
    color: var(--audle-text);
    font-size: 0.78rem;
  }
  .capture-banner strong {
    font:
      700 0.72rem ui-monospace,
      monospace;
    letter-spacing: 0.06em;
  }
  .capture-banner span:not(.capture-light) {
    color: var(--audle-text-muted);
  }
  .capture-banner button {
    min-block-size: 40px;
    margin-inline-start: auto;
    padding: 0 12px;
    border: 1px solid var(--audle-record-light);
    background: var(--audle-record-surface);
    color: var(--audle-text);
    cursor: pointer;
  }
  .capture-light {
    inline-size: 9px;
    block-size: 9px;
    border-radius: 50%;
    background: var(--audle-record-light);
  }
  .capture-light.recording {
    background: var(--audle-record-light);
  }
  .sr-only {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .stage-topline,
  .object-number,
  .object-bottom span {
    font:
      700 0.69rem/1.3 ui-monospace,
      monospace;
    letter-spacing: 0.1em;
  }
  .stage-frame {
    overflow: hidden;
    position: relative;
    border: 1px solid var(--audle-outline);
    background: var(--audle-deck-raised);
    box-shadow:
      0 22px 80px #0006,
      inset 0 1px var(--audle-edge-light);
  }
  .stage-topline {
    position: relative;
    display: flex;
    justify-content: flex-end;
    padding: 14px 20px;
    color: var(--audle-text-muted);
    border-bottom: 1px solid var(--audle-grid-major);
  }
  .stage-topline i {
    display: inline-block;
    inline-size: 6px;
    block-size: 6px;
    border-radius: 50%;
    margin-inline-start: 7px;
    background: var(--audle-text-dim);
  }
  .stage-topline i.lit {
    background: var(--audle-accent);
  }
  .objects {
    position: relative;
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 10px;
    padding: 20px;
  }
  .sound-object {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: space-between;
    min-inline-size: 0;
    min-block-size: 168px;
    padding: 12px;
    overflow: hidden;
    border: 1px solid var(--audle-outline-subtle);
    background: var(--audle-control);
    color: var(--audle-text);
    cursor: pointer;
    text-align: left;
    /* The flash ring sits on the inner edge and fades through --flash, which the hit motion drives. */
    box-shadow: inset 0 0 0 3px oklch(var(--source) / var(--flash, 0));
    /* Transform is owned by the press and flash motion, so it is not transitioned here. */
    transition:
      border-color 0.2s,
      background 0.2s,
      box-shadow 0.2s;
  }
  /* The bloom is a solid fill at low alpha, clipped by the pad's overflow. */
  .sound-object::before {
    content: '';
    position: absolute;
    inset: 0;
    background: oklch(var(--source) / calc(var(--flash, 0) * 0.16));
    pointer-events: none;
  }
  @media (hover: hover) {
    .sound-object:hover:not(:disabled) {
      border-color: oklch(var(--source) / 0.7);
    }
  }
  .sound-object:global([data-pressed='true']) {
    background: var(--audle-control-pressed);
  }
  .sound-object.active {
    border-color: oklch(var(--source));
    background: var(--audle-control-hover);
    box-shadow:
      inset 0 0 0 1px oklch(var(--source) / 0.32),
      inset 0 0 0 3px oklch(var(--source) / var(--flash, 0));
  }
  .sound-object.selected:after {
    content: '';
    position: absolute;
    inset: 4px;
    border: 1px solid oklch(var(--source) / 0.44);
    pointer-events: none;
  }
  .sound-object.pending {
    border-style: dashed;
  }
  .sound-object:disabled {
    cursor: not-allowed;
    opacity: 0.66;
  }
  .object-number {
    display: flex;
    justify-content: space-between;
    color: var(--audle-text-muted);
  }
  .object-role {
    color: var(--audle-text-dim);
    text-transform: uppercase;
  }
  .glyph {
    display: grid;
    place-items: center;
    inline-size: 100%;
    block-size: 76px;
    color: oklch(var(--source));
    opacity: 0.57;
    transform-origin: center;
  }
  .glyph .shape {
    transform: scale(0.82);
  }
  .active .glyph {
    opacity: 1;
  }
  .shape {
    position: relative;
    display: grid;
    place-items: center;
    inline-size: 84px;
    block-size: 84px;
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
  .object-bottom {
    display: grid;
    gap: 5px;
  }
  .object-bottom strong {
    font-size: clamp(0.78rem, 1.1vw, 0.95rem);
    line-height: 1.15;
    /* Two lines, so a longer sound name is readable instead of an ellipsis. */
    display: -webkit-box;
    -webkit-box-orient: vertical;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    overflow: hidden;
  }
  .object-bottom span {
    color: var(--audle-text-dim);
    font-size: 0.58rem;
  }
  .active .object-bottom span {
    color: oklch(var(--source));
  }
  .object-meter {
    position: absolute;
    bottom: 0;
    left: 0;
    inline-size: 100%;
    block-size: 3px;
    background: oklch(var(--source));
    /* --level rests at 0.3 while the sound is on; each hit kicks it to 1 and lets it decay. */
    transform: scaleX(var(--level, 0));
    transform-origin: left;
  }
  .active .object-meter {
    --level: 0.3;
  }
  .sound-object:not(.active) .object-meter {
    transform: scaleX(0);
  }
  .play-controls {
    display: grid;
    grid-template-columns: minmax(190px, 1fr) minmax(250px, 1.4fr);
    gap: 20px 36px;
    padding: 32px 0 22px;
    border-bottom: 1px solid var(--audle-grid-major);
  }
  .control-heading h2 {
    margin: 7px 0 4px;
    font-size: clamp(1.5rem, 2.5vw, 2.3rem);
    letter-spacing: -0.05em;
  }
  .patterns {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    align-self: center;
  }
  .patterns button {
    display: grid;
    gap: 9px;
    justify-items: start;
    min-block-size: 72px;
    padding: 12px;
    border: 1px solid var(--audle-outline-subtle);
    background: var(--audle-control);
    color: var(--audle-text);
    text-align: left;
    cursor: pointer;
    text-transform: capitalize;
  }
  .patterns button.chosen {
    border-color: var(--audle-accent);
    background: var(--audle-playback-surface);
  }
  .patterns button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .pattern-mark {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 3px;
    inline-size: 100%;
    block-size: 12px;
  }
  .pattern-mark i {
    block-size: 100%;
    background: var(--audle-control-pressed);
    border: 1px solid var(--audle-outline-subtle);
  }
  .pattern-mark i.on {
    background: var(--audle-accent-dim);
    border-color: var(--audle-accent-dim);
  }
  .patterns button.chosen .pattern-mark i.on {
    background: var(--audle-accent);
    border-color: var(--audle-text);
  }
  .fine-tune {
    align-self: start;
  }
  .fine-tune summary {
    cursor: pointer;
    min-block-size: 36px;
    color: var(--audle-text-muted);
    font-size: 0.82rem;
  }
  .fine-tune summary span {
    margin-inline-start: 8px;
  }
  .tune-fields {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    padding: 10px 0;
    min-inline-size: 0;
    margin: 0;
    border: 0;
  }
  .tune-fields label {
    display: grid;
    gap: 4px;
    font-size: 0.72rem;
    color: var(--audle-text-muted);
  }
  .tune-fields input {
    accent-color: var(--audle-accent);
  }
  .solo-control {
    margin-block-start: 14px;
    min-block-size: 44px;
    padding: 8px 14px;
    border: 1px solid var(--audle-accent-dim);
    background: var(--audle-control);
    color: var(--audle-text-muted);
    cursor: pointer;
    font:
      700 0.72rem ui-monospace,
      monospace;
  }
  .solo-control[aria-pressed='true'] {
    border-color: var(--audle-accent);
    background: var(--audle-playback-surface);
  }
  .offset {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 14px 0 0 10px;
    vertical-align: bottom;
    color: var(--audle-text-muted);
    font:
      700 0.72rem ui-monospace,
      monospace;
    letter-spacing: 0.1em;
  }
  .offset span {
    margin-inline-end: 2px;
  }
  .offset button {
    min-inline-size: 44px;
    min-block-size: 44px;
    border: 1px solid var(--audle-accent-dim);
    background: var(--audle-control);
    color: var(--audle-text);
    cursor: pointer;
    font: inherit;
    letter-spacing: 0;
  }
  .offset button:hover:not(:disabled) {
    background: var(--audle-control-hover);
  }
  .offset button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .pattern-strip {
    display: flex;
    align-items: center;
    gap: 15px;
    min-inline-size: 0;
  }
  .steps {
    display: grid;
    grid-template-columns: repeat(16, 1fr);
    gap: 4px;
    flex: 1;
  }
  .steps span {
    block-size: 13px;
    background: var(--audle-control-pressed);
    border: 1px solid var(--audle-outline-subtle);
  }
  .steps span.hit {
    background: var(--audle-accent-dim);
    border-color: var(--audle-accent-dim);
  }
  .steps span.current {
    box-shadow: 0 0 0 2px var(--audle-text);
  }
  .play-footer {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding-top: 20px;
  }
  .play-footer button {
    min-block-size: 48px;
    padding: 0 21px;
    border: 1px solid var(--audle-accent-dim);
    background: var(--audle-playback-surface);
    color: var(--audle-text);
    cursor: pointer;
    font-weight: 700;
  }
  .play-footer button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .next-actions {
    display: flex;
    gap: 8px;
  }
  .next-actions .finish {
    background: var(--audle-accent);
    color: var(--audle-accent-ink);
    border-color: var(--audle-accent);
  }
  .next-actions span {
    margin-inline-start: 12px;
  }
  @media (max-width: 720px) {
    .play-world {
      inline-size: min(100% - 24px, 600px);
      padding-top: 30px;
    }
    .objects {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
      padding: 10px;
    }
    .sound-object {
      min-block-size: 118px;
      padding: 8px;
    }
    .glyph {
      block-size: 42px;
    }
    .object-bottom strong {
      font-size: 0.72rem;
    }
    .glyph .shape {
      transform: scale(0.46);
    }
    .stage-topline {
      padding: 12px;
    }
    .play-controls {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .patterns button {
      min-block-size: 69px;
      padding: 9px;
    }
    .pattern-strip {
      flex-direction: column;
      align-items: stretch;
      gap: 9px;
    }
    .steps {
      gap: 3px;
    }
    .play-footer {
      flex-wrap: wrap;
    }
    .play-footer .transport {
      flex: 1;
    }
    .next-actions {
      flex: 2;
    }
    .next-actions button {
      flex: 1;
      padding-inline: 12px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .sound-object,
    .object-meter {
      transition: none;
    }
  }
</style>
