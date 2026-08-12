<script lang="ts">
  import { TICKS_PER_BAR, TICKS_PER_SIXTEENTH, type LoopClip } from '../domain/model';
  import type { EditorState } from '../state/editor.svelte';
  import TrackHeader from './TrackHeader.svelte';

  let { editor }: { editor: EditorState } = $props();
  let grid = $state<HTMLElement | undefined>(undefined);
  let selectMode = $state(false);
  let dragging = $state(false);
  let marquee = $state<{ startX: number; startY: number; endX: number; endY: number } | undefined>(undefined);
  let pressStart = $state<{ x: number; y: number } | undefined>(undefined);
  let pressTimer: number | undefined;
  const totalTicks = $derived(editor.composition.bars * TICKS_PER_BAR);
  const steps = $derived(Array.from({ length: totalTicks / TICKS_PER_SIXTEENTH }, (_, index) => index));

  const setPlayheadFromPointer = (event: PointerEvent) => {
    if (!grid) return;
    const bounds = grid.getBoundingClientRect();
    editor.setPlayhead(((event.clientX - bounds.left) / bounds.width) * totalTicks);
  };

  const startLongPress = (event: PointerEvent) => {
    pressStart = { x: event.clientX, y: event.clientY };
    window.clearTimeout(pressTimer);
    pressTimer = window.setTimeout(() => {
      selectMode = true;
      pressTimer = undefined;
    }, 400);
  };

  const cancelLongPress = () => {
    window.clearTimeout(pressTimer);
    pressTimer = undefined;
    pressStart = undefined;
  };

  const moveClipPointer = (event: PointerEvent) => {
    if (pressStart && Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y) > 8) cancelLongPress();
  };

  const startMarquee = (event: PointerEvent) => {
    const target = event.target as HTMLElement;
    if (event.pointerType === 'touch' || target.closest('.clip, .track-header, .ruler')) return;
    setPlayheadFromPointer(event);
    const bounds = grid!.getBoundingClientRect();
    marquee = {
      startX: event.clientX - bounds.left,
      startY: event.clientY - bounds.top,
      endX: event.clientX - bounds.left,
      endY: event.clientY - bounds.top,
    };
    dragging = true;
    const container = event.currentTarget as HTMLElement;
    container.setPointerCapture(event.pointerId);
  };

  const updateMarquee = (event: PointerEvent) => {
    if (!marquee || !grid) return;
    const bounds = grid.getBoundingClientRect();
    marquee = { ...marquee, endX: event.clientX - bounds.left, endY: event.clientY - bounds.top };
  };

  const finishMarquee = () => {
    if (!marquee || !grid) return;
    const bounds = grid.getBoundingClientRect();
    const left = Math.min(marquee.startX, marquee.endX) + bounds.left;
    const right = Math.max(marquee.startX, marquee.endX) + bounds.left;
    const top = Math.min(marquee.startY, marquee.endY) + bounds.top;
    const bottom = Math.max(marquee.startY, marquee.endY) + bounds.top;
    const clips = [...grid.querySelectorAll<HTMLElement>('.clip')].filter((clip) => {
      const rect = clip.getBoundingClientRect();
      return rect.left < right && rect.right > left && rect.top < bottom && rect.bottom > top;
    });
    editor.clearSelection();
    clips.forEach((clip, index) => editor.selectClip(clip.dataset.clipId!, index > 0));
    marquee = undefined;
    dragging = false;
  };

  const beginResize = (event: PointerEvent, trackId: string, clip: LoopClip) => {
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    const clipElement = target.closest<HTMLElement>('.clip');
    if (!clipElement) return;
    editor.selectClip(clip.id);
    editor.selectedTrackId = trackId;
    const startX = event.clientX;
    const startLength = clip.lengthTicks;
    const width = clipElement.parentElement!.getBoundingClientRect().width;
    dragging = true;
    target.setPointerCapture(event.pointerId);
    const finish = (pointerEvent: PointerEvent) => {
      const deltaTicks = ((pointerEvent.clientX - startX) / width) * totalTicks;
      editor.resizeSelectedLoop(clip.id, startLength + deltaTicks);
      dragging = false;
      target.removeEventListener('pointerup', finish);
      target.removeEventListener('pointercancel', cancel);
    };
    const cancel = () => {
      dragging = false;
      target.removeEventListener('pointerup', finish);
      target.removeEventListener('pointercancel', cancel);
    };
    target.addEventListener('pointerup', finish);
    target.addEventListener('pointercancel', cancel);
  };
</script>

<section aria-label="Timeline editor" class:dragging class="timeline">
  <header class="timeline-head">
    <div>
      <p>Arrange</p>
      <strong>{editor.composition.bars} bar{editor.composition.bars === 1 ? '' : 's'} · 16th grid</strong>
    </div>
    <button aria-pressed={selectMode} class:active={selectMode} type="button" onclick={() => selectMode = !selectMode}>Select</button>
  </header>
  <div class="timeline-scroll">
    <div aria-label="Timeline selection surface" bind:this={grid} class="grid" role="region" style={`--bars: ${editor.composition.bars}`} onpointerdown={startMarquee} onpointermove={updateMarquee} onpointerup={finishMarquee} onpointercancel={finishMarquee}>
      <div class="ruler" style={`--bars: ${editor.composition.bars}`}>
        <span class="sticky">Track</span>
        {#each Array.from({ length: editor.composition.bars }, (_, index) => index + 1) as bar (bar)}
          <span>Bar {bar}</span>
        {/each}
        <i class="playhead-ruler" style={`--playhead: ${(editor.playheadTick / totalTicks) * 100}%`}></i>
      </div>
      {#each editor.composition.tracks as track, trackIndex (track.id)}
        <div class="lane">
          <TrackHeader {editor} {track} index={trackIndex} />
          <div class="lane-content">
            {#each steps as step (step)}
              <i aria-hidden="true" class:bar={step % 16 === 0} class:quarter={step % 4 === 0} class="grid-line" style={`--step: ${(step / steps.length) * 100}%`}></i>
            {/each}
            {#each track.clips as clip (clip.id)}
              <div
                aria-label={`${track.label}, ${clip.kind} at tick ${clip.startTick}${clip.kind === 'hit' ? `, roll times ${clip.ratchet}` : ''}`}
                aria-pressed={editor.selectedClipIds.includes(clip.id)}
                class:hit={clip.kind === 'hit'}
                class:selected={editor.selectedClipIds.includes(clip.id)}
                class="clip"
                data-clip-id={clip.id}
                role="button"
                style={`--start: ${(clip.startTick / totalTicks) * 100}%; --width: ${((clip.kind === 'loop' ? clip.lengthTicks : TICKS_PER_SIXTEENTH) / totalTicks) * 100}%`}
                tabindex="0"
                onpointerdown={startLongPress}
                onpointermove={moveClipPointer}
                onpointerup={cancelLongPress}
                onpointercancel={cancelLongPress}
                onclick={(event) => editor.selectClip(clip.id, event.shiftKey || selectMode)}
                onkeydown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    editor.selectClip(clip.id, event.shiftKey || selectMode);
                  }
                }}
              >
                {#if clip.kind === 'loop'}
                  <span aria-hidden="true" class="waveform">∿∿∿</span>
                  <span class="clip-copy">Loop</span>
                {:else}
                  <span aria-hidden="true" class="strikes">{#each Array.from({ length: clip.ratchet }, (_, index) => index) as strike (strike)}|{/each}</span>
                  <span class="clip-copy">{clip.ratchet === 1 ? 'Hit' : `×${clip.ratchet}`}</span>
                {/if}
              </div>
              {#if clip.kind === 'loop'}
                <span
                  aria-label="Drag right edge to resize loop"
                  aria-valuemax={totalTicks - clip.startTick}
                  aria-valuemin={TICKS_PER_SIXTEENTH}
                  aria-valuenow={clip.lengthTicks}
                  class="resize"
                  role="slider"
                  style={`--edge: ${((clip.startTick + clip.lengthTicks) / totalTicks) * 100}%`}
                  tabindex="0"
                  onpointerdown={(event) => beginResize(event, track.id, clip)}
                  onkeydown={(event) => {
                    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                      event.preventDefault();
                      editor.resizeSelectedLoop(clip.id, clip.lengthTicks + (event.key === 'ArrowLeft' ? -24 : 24));
                    }
                  }}
                ></span>
              {/if}
            {/each}
            <i aria-hidden="true" class="playhead" style={`--playhead: ${(editor.playheadTick / totalTicks) * 100}%`}></i>
          </div>
        </div>
      {/each}
      {#if marquee}
        <i aria-hidden="true" class="marquee" style={`left: ${Math.min(marquee.startX, marquee.endX)}px; top: ${Math.min(marquee.startY, marquee.endY)}px; width: ${Math.abs(marquee.endX - marquee.startX)}px; height: ${Math.abs(marquee.endY - marquee.startY)}px`}></i>
      {/if}
    </div>
  </div>
</section>

<style>
  .timeline { display: grid; min-block-size: 360px; overflow: hidden; background: var(--audle-deck-raised); box-shadow: var(--audle-deck-edge); }
  .timeline-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-block-size: 58px; padding: 10px 14px; border-block-end: 1px solid var(--audle-outline); }
  .timeline-head p { margin: 0 0 2px; color: var(--audle-text-muted); font-size: 0.7rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; }
  .timeline-head strong { font-size: 0.85rem; }
  .timeline-head button { min-inline-size: 72px; min-block-size: 44px; border: 1px solid var(--audle-outline); background: var(--audle-control); box-shadow: var(--audle-control-rest); cursor: pointer; font-weight: 700; }
  .timeline-head button.active { background: var(--audle-selection-surface); box-shadow: inset 0 0 0 1px var(--audle-selection-light), var(--audle-control-contact); }
  .timeline-scroll { min-block-size: 0; overflow: auto; overscroll-behavior: contain; }
  .grid { position: relative; min-inline-size: max(100%, calc(260px * var(--bars, 1))); }
  .ruler { position: sticky; inset-block-start: 0; z-index: 5; display: grid; grid-template-columns: 154px repeat(var(--bars), minmax(260px, 1fr)); min-block-size: 36px; background: var(--audle-deck); border-block-end: 1px solid var(--audle-grid-major); }
  .ruler span { display: grid; place-items: center start; padding-inline: 10px; border-inline-end: 1px solid var(--audle-grid-major); color: var(--audle-text-muted); font-family: ui-monospace, monospace; font-size: 0.68rem; }
  .ruler .sticky { position: sticky; inset-inline-start: 0; z-index: 2; background: var(--audle-deck); }
  .lane { display: grid; grid-template-columns: 154px minmax(calc(260px * var(--bars, 1)), 1fr); min-block-size: 56px; }
  .lane-content { position: relative; min-block-size: 56px; overflow: hidden; background: var(--audle-well); box-shadow: inset 0 2px 5px oklch(0.025 0.007 255 / 0.88), inset 0 1px 0 oklch(0.57 0.02 255 / 0.14); }
  .grid-line { position: absolute; inset-block: 0; inset-inline-start: var(--step); inline-size: 1px; background: var(--audle-grid-minor); pointer-events: none; }
  .grid-line.quarter { background: var(--audle-outline-subtle); }
  .grid-line.bar { inline-size: 2px; background: var(--audle-grid-major); }
  .clip { position: absolute; z-index: 2; inset-block: 8px; inset-inline-start: var(--start); display: flex; align-items: center; gap: 4px; inline-size: max(var(--width), 16px); min-inline-size: 16px; overflow: hidden; border: 1px solid var(--audle-loop-light); background: var(--audle-loop-surface); box-shadow: inset 0 0 0 1px var(--audle-loop-light); color: var(--audle-text); cursor: pointer; }
  .clip.hit { border-color: var(--audle-one-shot-light); background: var(--audle-one-shot-surface); box-shadow: inset 0 0 0 1px var(--audle-one-shot-light); }
  .clip.selected { z-index: 3; outline: 2px dashed var(--audle-selection-light); outline-offset: 2px; box-shadow: inset 0 0 0 1px var(--audle-selection-light); }
  .resize { position: absolute; z-index: 4; inset-block: 8px; inset-inline-start: calc(var(--edge) - 6px); inline-size: 12px; border-inline-start: 1px solid var(--audle-loop-light); cursor: ew-resize; touch-action: none; }
  .hit .strikes { color: var(--audle-one-shot-light); letter-spacing: 1px; }
  .clip-copy { overflow: hidden; font-family: ui-monospace, monospace; font-size: 0.68rem; white-space: nowrap; }
  .playhead, .playhead-ruler { position: absolute; z-index: 4; inset-block: 0; inset-inline-start: var(--playhead); inline-size: 2px; background: var(--audle-playback-light); pointer-events: none; }
  .playhead-ruler { z-index: 6; }
  .marquee { position: absolute; z-index: 8; border: 2px dashed var(--audle-selection-light); background: oklch(0.25 0.06 28 / 0.18); pointer-events: none; }
  .timeline.dragging .grid { touch-action: none; }
  @media (max-width: 959px) { .timeline { min-block-size: 300px; } .timeline-scroll { max-block-size: 54vh; } }
</style>
