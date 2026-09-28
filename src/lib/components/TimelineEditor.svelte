<script lang="ts">
  import { TICKS_PER_BAR, TICKS_PER_SIXTEENTH, type LoopClip } from '../domain/model';
  import type { EditorState } from '../state/editor.svelte';
  import { sampleById } from '../data/samples';
  import { fadeOut, motion, pop, popOn, subscribeFrame } from '../motion';
  import TrackHeader from './TrackHeader.svelte';

  let { editor }: { editor: EditorState } = $props();
  let grid = $state<HTMLElement | undefined>(undefined);
  let selectMode = $state(false);
  let dragging = $state(false);
  let marquee = $state<{ startX: number; startY: number; endX: number; endY: number } | undefined>(
    undefined,
  );
  let pressStart = $state<{ x: number; y: number } | undefined>(undefined);
  let pressTimer: number | undefined;
  const totalTicks = $derived(editor.composition.bars * TICKS_PER_BAR);

  /** While playing with motion allowed, the playhead sweeps at frame rate from the live transport;
   * otherwise it steps with each transport snapshot, which keeps click-to-place exact. */
  $effect(() => {
    if (!grid) return;
    const surface = grid;
    if (editor.playing && motion.allowed) {
      return subscribeFrame(() => {
        surface.style.setProperty('--playhead-ratio', String(editor.currentTick() / totalTicks));
      });
    }
    surface.style.setProperty('--playhead-ratio', String(editor.playheadTick / totalTicks));
  });
  const steps = $derived(
    Array.from({ length: totalTicks / TICKS_PER_SIXTEENTH }, (_, index) => index),
  );

  // Every lane's content area shares the same horizontal extent, so ticks map from the first one.
  const tickFromPointer = (event: PointerEvent): number | undefined => {
    const lane = grid?.querySelector<HTMLElement>('.lane-content');
    if (!lane) return undefined;
    const bounds = lane.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    return ratio * totalTicks;
  };

  /** A clip drag in flight: the pointer's start, the lane width for tick mapping, and whether it
   * has moved past the tap slop yet. Touch drags only start once select mode is on, so a plain
   * touch still scrolls the timeline. */
  let clipDrag:
    | { clipId: string; startX: number; laneWidth: number; moved: boolean; element: HTMLElement }
    | undefined;
  /** The drag preview, in ticks, applied to every selected clip until the pointer lifts. */
  let dragTicks = $state(0);
  let suppressClick = false;

  const startLongPress = (event: PointerEvent, clipId: string) => {
    pressStart = { x: event.clientX, y: event.clientY };
    window.clearTimeout(pressTimer);
    pressTimer = window.setTimeout(() => {
      selectMode = true;
      pressTimer = undefined;
    }, 400);
    if (event.pointerType === 'touch' && !selectMode) return;
    const lane = (event.currentTarget as HTMLElement).parentElement;
    if (!lane) return;
    const element = event.currentTarget as HTMLElement;
    clipDrag = {
      clipId,
      startX: event.clientX,
      laneWidth: lane.getBoundingClientRect().width,
      moved: false,
      element,
    };
    // Capture from the start: a hit is narrow, so the pointer leaves it before the slop is passed.
    element.setPointerCapture(event.pointerId);
  };

  const cancelLongPress = () => {
    window.clearTimeout(pressTimer);
    pressTimer = undefined;
    pressStart = undefined;
  };

  const moveClipPointer = (event: PointerEvent) => {
    if (pressStart && Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y) > 8)
      cancelLongPress();
    const drag = clipDrag;
    if (!drag) return;
    const deltaX = event.clientX - drag.startX;
    if (!drag.moved) {
      if (Math.abs(deltaX) <= TAP_SLOP_PX) return;
      drag.moved = true;
      dragging = true;
      // Dragging an unselected clip moves just that clip; a selected one carries the selection.
      if (!editor.selectedClipIds.includes(drag.clipId)) editor.selectClip(drag.clipId);
    }
    dragTicks =
      Math.round(((deltaX / drag.laneWidth) * totalTicks) / TICKS_PER_SIXTEENTH) *
      TICKS_PER_SIXTEENTH;
  };

  const finishClipPointer = (event: PointerEvent) => {
    cancelLongPress();
    const drag = clipDrag;
    clipDrag = undefined;
    if (drag?.element.hasPointerCapture(event.pointerId))
      drag.element.releasePointerCapture(event.pointerId);
    if (!drag?.moved) return;
    dragging = false;
    const delta = dragTicks;
    dragTicks = 0;
    // The click that follows a drag would toggle the selection; it is part of the drag instead.
    suppressClick = true;
    if (event.type === 'pointerup' && delta !== 0) editor.moveSelection(delta);
  };

  /** The preview offset for a selected clip while a drag is in flight, as a lane-relative length. */
  const dragStyle = (clipId: string) =>
    dragTicks !== 0 && editor.selectedClipIds.includes(clipId)
      ? `--drag: ${(dragTicks / totalTicks) * 100}%`
      : '';

  const TAP_SLOP_PX = 6;
  let press: { x: number; y: number; trackId?: string; ruler: boolean } | undefined;
  let hover = $state<{ trackId: string; tick: number } | undefined>(undefined);

  const startMarquee = (event: PointerEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest('.clip, .resize, .track-header, .ruler .sticky')) return;
    const ruler = Boolean(target.closest('.ruler'));
    press = {
      x: event.clientX,
      y: event.clientY,
      trackId: target.closest<HTMLElement>('.lane-content')?.dataset.trackId,
      ruler,
    };
    if (event.pointerType === 'touch' || ruler) return;
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

  /** A press that barely moved is a tap: it places a sound on a lane, or moves the playhead on the ruler. */
  const finishPress = (event: PointerEvent): boolean => {
    const current = press;
    press = undefined;
    if (!current || Math.hypot(event.clientX - current.x, event.clientY - current.y) > TAP_SLOP_PX)
      return false;
    const tick = tickFromPointer(event);
    if (tick === undefined) return false;
    if (current.trackId) editor.placeAt(current.trackId, tick);
    else editor.setPlayhead(tick);
    return true;
  };

  const trackHover = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || dragging) {
      hover = undefined;
      return;
    }
    const lane = (event.target as HTMLElement).closest<HTMLElement>('.lane-content');
    const tick = tickFromPointer(event);
    const onClip = (event.target as HTMLElement).closest('.clip, .resize');
    hover =
      lane?.dataset.trackId && tick !== undefined && !onClip
        ? { trackId: lane.dataset.trackId, tick }
        : undefined;
  };

  const ghostFor = (trackId: string, loop: boolean) => {
    if (!hover || hover.trackId !== trackId) return undefined;
    const size = loop ? TICKS_PER_BAR : TICKS_PER_SIXTEENTH;
    const start = Math.min(totalTicks - size, Math.floor(hover.tick / size) * size);
    return `--start: ${(start / totalTicks) * 100}%; --width: ${(size / totalTicks) * 100}%`;
  };

  const updateMarquee = (event: PointerEvent) => {
    if (!marquee || !grid) return;
    const bounds = grid.getBoundingClientRect();
    marquee = { ...marquee, endX: event.clientX - bounds.left, endY: event.clientY - bounds.top };
  };

  const finishMarquee = (event: PointerEvent) => {
    const tapped = event.type === 'pointerup' && finishPress(event);
    press = undefined;
    if (!marquee || !grid) return;
    if (tapped) {
      marquee = undefined;
      dragging = false;
      return;
    }
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

<section
  aria-label="Timeline editor"
  class="timeline grid min-h-[360px] overflow-hidden bg-audle-deck-raised shadow-[var(--audle-deck-edge)] max-[959px]:min-h-[300px]"
  class:dragging
>
  <header
    class="timeline-head flex min-h-[58px] items-center justify-between gap-3 border-b border-audle-outline px-3.5 py-2.5"
  >
    <div>
      <p
        class="m-0 mb-0.5 text-[0.7rem] font-extrabold uppercase tracking-[0.1em] text-audle-text-muted"
      >
        Arrange
      </p>
      <strong class="text-[0.85rem]"
        >{editor.composition.bars} bar{editor.composition.bars === 1 ? '' : 's'} · tap a lane to add,
        tap a clip twice to remove, drag to move</strong
      >
    </div>
    <button
      aria-pressed={selectMode}
      class="min-h-11 min-w-[72px] cursor-pointer border border-audle-outline bg-audle-control font-bold shadow-[var(--audle-control-rest)] [&.active]:bg-audle-selection-surface [&.active]:shadow-[inset_0_0_0_1px_var(--audle-selection-light),var(--audle-control-contact)]"
      class:active={selectMode}
      type="button"
      onclick={() => (selectMode = !selectMode)}>Select</button
    >
  </header>
  <div
    class="timeline-scroll min-h-0 overflow-auto overscroll-x-contain overscroll-y-auto max-[959px]:max-h-[54vh]"
  >
    <div
      aria-label="Timeline selection surface"
      bind:this={grid}
      class="grid"
      role="region"
      style:--bars={editor.composition.bars}
      onpointerdown={startMarquee}
      onpointermove={(event) => {
        updateMarquee(event);
        trackHover(event);
      }}
      onpointerleave={() => (hover = undefined)}
      onpointerup={finishMarquee}
      onpointercancel={finishMarquee}
    >
      <div
        class="ruler sticky top-0 z-[5] grid min-h-9 cursor-pointer border-b border-audle-grid-major bg-audle-deck"
        style:--bars={editor.composition.bars}
      >
        <span
          class="sticky left-0 z-[2] grid place-items-center justify-items-start border-r border-audle-grid-major bg-audle-deck px-2.5 font-mono text-[0.68rem] text-audle-text-muted"
          >Track</span
        >
        {#each Array.from({ length: editor.composition.bars }, (_, index) => index + 1) as bar (bar)}
          <span
            class="grid place-items-center justify-items-start border-r border-audle-grid-major px-2.5 font-mono text-[0.68rem] text-audle-text-muted"
            >Bar {bar}</span
          >
        {/each}
        <i class="playhead-ruler"></i>
      </div>
      {#each editor.composition.tracks as track, trackIndex (track.id)}
        {@const loopLane = sampleById(track.sampleId)?.kind === 'loop'}
        {@const sourceIndex = editor.challenge.sampleIds.indexOf(track.sampleId)}
        <div
          class="lane grid min-h-14"
          class:source-known={sourceIndex >= 0}
          style:--source={sourceIndex >= 0 ? `var(--audle-source-${sourceIndex + 1})` : undefined}
        >
          <TrackHeader {editor} {track} index={trackIndex} />
          <div
            aria-label={`${track.label} lane: click to ${loopLane ? 'toggle a loop in that bar' : 'add a hit'}`}
            class="lane-content relative min-h-14 cursor-crosshair overflow-hidden bg-audle-well shadow-[inset_0_2px_5px_oklch(0.025_0.007_255_/_0.88),inset_0_1px_0_oklch(0.57_0.02_255_/_0.14)] [container-type:inline-size]"
            data-track-id={track.id}
            role="group"
          >
            {#each steps as step (step)}
              <i
                aria-hidden="true"
                class="grid-line pointer-events-none absolute inset-y-0 left-[var(--step)] w-px bg-audle-grid-minor [&.quarter]:bg-audle-outline-subtle [&.bar]:w-0.5 [&.bar]:bg-audle-grid-major"
                class:bar={step % 16 === 0}
                class:quarter={step % 4 === 0}
                style={`--step: ${(step / steps.length) * 100}%`}
              ></i>
            {/each}
            {#each track.clips as clip (clip.id)}
              <div
                aria-label={`${track.label}, ${clip.kind} at tick ${clip.startTick}${clip.kind === 'hit' ? `, roll times ${clip.ratchet}` : ''}`}
                aria-pressed={editor.selectedClipIds.includes(clip.id)}
                class="clip absolute z-[2] inset-y-2 left-[var(--start)] flex min-w-4 w-[max(var(--width),16px)] items-center gap-1 overflow-hidden border border-audle-loop-light bg-audle-loop-surface text-audle-text shadow-[inset_0_0_0_1px_var(--audle-loop-light)] cursor-grab [&.hit]:justify-center [&.hit]:min-w-[22px] [&.hit]:w-[22px] [&.hit]:border-audle-one-shot-light [&.hit]:bg-audle-one-shot-surface [&.hit]:shadow-[inset_0_0_0_1px_var(--audle-one-shot-light)] [&.selected]:z-[3] [&.selected]:outline-2 [&.selected]:outline-dashed [&.selected]:outline-audle-selection-light [&.selected]:outline-offset-2 [&.selected]:shadow-[inset_0_0_0_1px_var(--audle-selection-light)] [&.hit_.clip-copy]:hidden"
                class:hit={clip.kind === 'hit'}
                class:selected={editor.selectedClipIds.includes(clip.id)}
                data-clip-id={clip.id}
                role="button"
                style={`--start: ${(clip.startTick / totalTicks) * 100}%; --width: ${((clip.kind === 'loop' ? clip.lengthTicks : TICKS_PER_SIXTEENTH) / totalTicks) * 100}%; ${dragStyle(clip.id)}`}
                tabindex="0"
                in:pop
                out:fadeOut
                use:popOn={editor.selectedClipIds.includes(clip.id)}
                onpointerdown={(event) => startLongPress(event, clip.id)}
                onpointermove={moveClipPointer}
                onpointerup={finishClipPointer}
                onpointercancel={finishClipPointer}
                onclick={(event) => {
                  if (suppressClick) {
                    suppressClick = false;
                    return;
                  }
                  editor.selectClip(clip.id, event.shiftKey || selectMode);
                }}
                ondblclick={() => {
                  editor.selectClip(clip.id);
                  editor.deleteSelection();
                }}
                onkeydown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    editor.selectClip(clip.id, event.shiftKey || selectMode);
                  } else if (event.key === 'Delete' || event.key === 'Backspace') {
                    event.preventDefault();
                    editor.selectClip(clip.id);
                    editor.deleteSelection();
                  }
                }}
              >
                {#if clip.kind === 'loop'}
                  <span aria-hidden="true" class="waveform ml-1 inline-flex items-center gap-0.5"
                    ><i
                      class="block size-[7px] rounded-t-[7px] border-[1.5px] border-b-0 border-audle-loop-light"
                    ></i><i
                      class="block size-[7px] rounded-t-[7px] border-[1.5px] border-b-0 border-audle-loop-light"
                    ></i><i
                      class="block size-[7px] rounded-t-[7px] border-[1.5px] border-b-0 border-audle-loop-light"
                    ></i></span
                  >
                  <span class="clip-copy overflow-hidden whitespace-nowrap font-mono text-[0.68rem]"
                    >Loop</span
                  >
                {:else}
                  <span
                    aria-hidden="true"
                    class="strikes text-[0.8rem] font-extrabold tracking-[1px] text-audle-one-shot-light"
                    >{#each Array.from({ length: clip.ratchet }, (_, index) => index) as strike (strike)}|{/each}</span
                  >
                  <span class="clip-copy overflow-hidden whitespace-nowrap font-mono text-[0.68rem]"
                    >{clip.ratchet === 1 ? 'Hit' : `×${clip.ratchet}`}</span
                  >
                {/if}
              </div>
              {#if clip.kind === 'loop'}
                <span
                  aria-label="Drag right edge to resize loop"
                  aria-valuemax={totalTicks - clip.startTick}
                  aria-valuemin={TICKS_PER_SIXTEENTH}
                  aria-valuenow={clip.lengthTicks}
                  class="resize absolute z-[4] inset-y-2 left-[calc(var(--edge)_-_6px)] w-3 cursor-ew-resize border-l border-audle-loop-light touch-none"
                  role="slider"
                  style={`--edge: ${((clip.startTick + clip.lengthTicks) / totalTicks) * 100}%; ${dragStyle(clip.id)}`}
                  tabindex="0"
                  onpointerdown={(event) => beginResize(event, track.id, clip)}
                  onkeydown={(event) => {
                    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                      event.preventDefault();
                      editor.resizeSelectedLoop(
                        clip.id,
                        clip.lengthTicks + (event.key === 'ArrowLeft' ? -24 : 24),
                      );
                    }
                  }}
                ></span>
              {/if}
            {/each}
            {#if ghostFor(track.id, loopLane)}
              <i
                aria-hidden="true"
                class:loop={loopLane}
                class="ghost"
                style={ghostFor(track.id, loopLane)}
              ></i>
            {/if}
            <i aria-hidden="true" class="playhead"></i>
          </div>
        </div>
      {/each}
      {#if marquee}
        <i
          aria-hidden="true"
          class="marquee"
          style={`left: ${Math.min(marquee.startX, marquee.endX)}px; top: ${Math.min(marquee.startY, marquee.endY)}px; width: ${Math.abs(marquee.endX - marquee.startX)}px; height: ${Math.abs(marquee.endY - marquee.startY)}px`}
        ></i>
      {/if}
    </div>
  </div>
</section>

<style>
  .grid[role='region'] {
    --header-w: 172px;
    --bar-min: 260px;
    display: block;
    position: relative;
    min-inline-size: max(100%, calc(var(--header-w) + var(--bar-min) * var(--bars, 1)));
  }

  @media (min-width: 960px) {
    .grid[role='region'] {
      --bar-min: 120px;
    }
  }

  .ruler {
    grid-template-columns: var(--header-w) repeat(var(--bars), minmax(var(--bar-min), 1fr));
  }

  .lane {
    grid-template-columns: var(--header-w) minmax(calc(var(--bar-min) * var(--bars, 1)), 1fr);
  }

  /* --drag previews a move as a percentage of the lane, which is the size container below. */
  .clip,
  .resize {
    translate: calc(var(--drag, 0%) / 100% * 100cqi) 0;
  }

  .timeline.dragging .clip {
    cursor: grabbing;
  }

  .clip.hit::before {
    content: '';
    position: absolute;
    inset: -8px -4px;
  }

  .lane.source-known .clip:not(.selected) {
    box-shadow:
      inset 0 0 0 1px oklch(var(--source) / 0.42),
      inset 0 0 0 2px var(--audle-loop-light);
  }

  .lane.source-known .clip.hit:not(.selected) {
    box-shadow:
      inset 0 0 0 1px oklch(var(--source) / 0.42),
      inset 0 0 0 2px var(--audle-one-shot-light);
  }

  .playhead,
  .playhead-ruler {
    position: absolute;
    z-index: 4;
    inset-block: 0;
    /* --playhead-ratio lives on the grid: one write per frame moves every lane's playhead. */
    inset-inline-start: calc(var(--playhead-ratio, 0) * 100%);
    inline-size: 2px;
    background: var(--audle-playback-light);
    pointer-events: none;
  }

  .playhead-ruler {
    z-index: 6;
    inset-inline-start: calc(var(--header-w) + (100% - var(--header-w)) * var(--playhead-ratio, 0));
  }

  .ghost {
    position: absolute;
    z-index: 1;
    inset-block: 8px;
    inset-inline-start: var(--start);
    inline-size: var(--width);
    border: 1px dashed var(--audle-one-shot-light);
    opacity: 0.45;
    pointer-events: none;
  }

  .ghost.loop {
    border-color: var(--audle-loop-light);
  }

  .marquee {
    position: absolute;
    z-index: 8;
    border: 2px dashed var(--audle-selection-light);
    background: oklch(0.25 0.06 28 / 0.18);
    pointer-events: none;
  }

  .timeline.dragging .grid[role='region'] {
    touch-action: none;
  }
</style>
