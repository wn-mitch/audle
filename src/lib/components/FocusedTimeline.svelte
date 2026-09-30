<script lang="ts">
  import { sampleById } from '../data/samples';
  import { TICKS_PER_BAR, TICKS_PER_SIXTEENTH, type Clip, type Track } from '../domain/model';
  import type { EditorState } from '../state/editor.svelte';
  import { motion, subscribeFrame } from '../motion';
  import Icon from './Icon.svelte';

  let { editor }: { editor: EditorState } = $props();
  let surface = $state<HTMLElement | undefined>();
  let selectMode = $state(false);
  let hitBar = $state(0);
  let pendingMove = $state<{ clipId: string; trackId: string; startTick: number } | undefined>();
  let status = $state('');

  const totalTicks = $derived(editor.composition.bars * TICKS_PER_BAR);
  const tracks = $derived(editor.composition.tracks);
  const selected = $derived(editor.selectedClips);
  const soloed = $derived(tracks.some((track) => track.controls.solo));
  const activeHitBar = $derived(Math.min(hitBar, editor.composition.bars - 1));
  const focusedTrack = $derived(
    tracks.find((track) => track.id === editor.selectedTrackId) ?? tracks[0],
  );
  const focusedSample = $derived(focusedTrack && sampleById(focusedTrack.sampleId));
  const bars = $derived(Array.from({ length: editor.composition.bars }, (_, index) => index));
  const hitSteps = $derived(Array.from({ length: 16 }, (_, index) => index));
  $effect(() => {
    if (!surface) return;
    const element = surface;
    const markers =
      focusedSample?.kind === 'loop'
        ? [...element.querySelectorAll<HTMLElement>('.loop-playhead')]
        : [];
    const hitMarker =
      focusedSample?.kind === 'loop' ? null : element.querySelector<HTMLElement>('.hit-playhead');
    let activeBar = -1;
    for (const marker of markers) marker.style.display = 'none';
    const draw = (tick: number) => {
      element.style.setProperty('--playhead-ratio', String(tick / totalTicks));
      const bar = Math.floor(tick / TICKS_PER_BAR);
      if (activeBar !== bar) {
        if (markers[activeBar]) markers[activeBar].style.display = 'none';
        if (markers[bar]) markers[bar].style.display = 'block';
        activeBar = bar;
      }
      if (markers[bar])
        markers[bar].style.left = `${((tick % TICKS_PER_BAR) / TICKS_PER_BAR) * 100}%`;
      if (hitMarker)
        hitMarker.style.left = `${((tick - activeHitBar * TICKS_PER_BAR) / TICKS_PER_BAR) * 100}%`;
    };
    if (editor.playing && motion.allowed) {
      return subscribeFrame(() => draw(editor.currentTick()));
    }
    draw(editor.playheadTick);
  });

  const sourceNumber = (track: Track) => {
    const index = editor.challenge.sampleIds.indexOf(track.sampleId);
    return index >= 0 ? String(index + 1).padStart(2, '0') : '—';
  };

  const trackLabel = (track: Track) => {
    const sample = sampleById(track.sampleId);
    return `${sourceNumber(track)} ${track.label} · ${sample?.kind === 'loop' ? 'Loop' : 'Hit'}`;
  };

  const clipEnd = (clip: Clip) =>
    clip.kind === 'loop' ? clip.startTick + clip.lengthTicks : clip.startTick + TICKS_PER_SIXTEENTH;

  const clipAt = (track: Track, tick: number): Clip | undefined =>
    track.clips.find((clip) =>
      clip.kind === 'loop'
        ? tick >= clip.startTick && tick < clipEnd(clip)
        : clip.startTick === tick,
    );

  const barOf = (tick: number) => Math.floor(tick / TICKS_PER_BAR) + 1;
  const beatOf = (step: number) => Math.floor(step / 4) + 1;
  const stepOf = (step: number) => (step % 4) + 1;

  const spanLabel = (clip: Clip) => {
    if (clip.kind === 'hit') return clip.ratchet === 1 ? 'Hit' : `Hit ×${clip.ratchet}`;
    const steps = clip.lengthTicks / TICKS_PER_SIXTEENTH;
    const wholeBars = Math.floor(steps / 16);
    const remainder = steps % 16;
    const barsLabel = wholeBars ? `${wholeBars} bar${wholeBars === 1 ? '' : 's'}` : '';
    const stepsLabel = remainder ? `${remainder} step${remainder === 1 ? '' : 's'}` : '';
    return `Loop · ${[barsLabel, stepsLabel].filter(Boolean).join(' ')}`;
  };

  const isSounding = (track: Track) => (soloed ? track.controls.solo : !track.controls.muted);

  const otherSoundCount = (bar: number) => {
    const start = bar * TICKS_PER_BAR;
    const end = start + TICKS_PER_BAR;
    return tracks.filter(
      (track) =>
        track.id !== focusedTrack?.id &&
        isSounding(track) &&
        track.clips.some((clip) => clip.startTick < end && clipEnd(clip) > start),
    ).length;
  };

  const timeLabel = (tick: number) => {
    const step = (tick % TICKS_PER_BAR) / TICKS_PER_SIXTEENTH;
    return `Bar ${barOf(tick)}, beat ${beatOf(step)}, step ${stepOf(step)}`;
  };
  const positionLabel = (tick: number, occupied?: Clip) => {
    const base = timeLabel(tick);
    if (!occupied) return `${base}, empty`;
    const continuation = occupied.kind === 'loop' && occupied.startTick < tick;
    return `${base}, occupied by ${spanLabel(occupied)}${
      continuation ? ` continuing from bar ${barOf(occupied.startTick)}` : ''
    }`;
  };

  const cancelMove = (message = 'Move cancelled.') => {
    pendingMove = undefined;
    status = message;
  };
  let previousTrackId: string | undefined;
  $effect(() => {
    const trackId = editor.selectedTrackId;
    if (previousTrackId === undefined) {
      previousTrackId = trackId;
      return;
    }
    if (trackId === previousTrackId) return;
    previousTrackId = trackId;
    if (!selectMode && editor.selectedClipIds.length) editor.clearSelection();
    cancelMove(
      selectMode
        ? 'Sound changed. Multiple selection is kept.'
        : 'Sound changed. Selection cleared.',
    );
    hitBar = 0;
  });
  $effect(() => {
    if (!pendingMove) return;
    if (focusedTrack?.id !== pendingMove.trackId) {
      cancelMove('Sound changed. Move cancelled.');
    } else if (!focusedTrack.clips.some((clip) => clip.id === pendingMove?.clipId)) {
      cancelMove('That clip is no longer available to move.');
    }
  });

  const selectClip = (clip: Clip, track: Track) => {
    // The tapped target is also the exact playhead position for Split in Selection actions.
    editor.selectClip(clip.id, selectMode);
    if (selectMode) {
      status = editor.selectedClipIds.includes(clip.id)
        ? `${spanLabel(clip)} selected. Select more clips or turn off multiple selection to move one.`
        : 'Clip removed from the selection.';
      return;
    }
    pendingMove = { clipId: clip.id, trackId: track.id, startTick: clip.startTick };
    status = `${spanLabel(clip)} selected. Tap a destination to move it, or Cancel move.`;
  };

  const destinationIsValid = (track: Track, moving: Clip, tick: number) => {
    const end = tick + (moving.kind === 'loop' ? moving.lengthTicks : TICKS_PER_SIXTEENTH);
    if (tick < 0 || end > totalTicks) return 'That destination would exceed the arrangement.';
    const collides = track.clips.some((clip) => {
      if (clip.id === moving.id) return false;
      if (moving.kind === 'loop' && clip.kind === 'loop')
        return tick < clipEnd(clip) && clip.startTick < end;
      return moving.kind === 'hit' && clip.kind === 'hit' && clip.startTick === tick;
    });
    return collides ? 'That destination is occupied. Choose an empty position.' : undefined;
  };

  const usePosition = (tick: number) => {
    const track = focusedTrack;
    if (!track) return;
    const pending = pendingMove;
    if (pending) {
      const moving =
        track.id === pending.trackId
          ? track.clips.find((clip) => clip.id === pending.clipId)
          : undefined;
      if (!moving) {
        cancelMove('That clip is no longer available to move.');
        return;
      }
      if (tick === pending.startTick) {
        cancelMove('Move cancelled.');
        return;
      }
      const invalid = destinationIsValid(track, moving, tick);
      if (invalid) {
        status = `${invalid} The move is still ready.`;
        return;
      }
      const before = editor.composition;
      editor.setPlayhead(tick);
      editor.selectClip(moving.id);
      editor.moveSelection(tick - moving.startTick);
      if (editor.composition === before) {
        status = editor.notice ?? 'That move could not be completed. Choose another position.';
        return;
      }
      pendingMove = undefined;
      status = `${spanLabel(moving)} moved to ${timeLabel(tick)}.`;
      return;
    }

    const occupied = clipAt(track, tick);
    editor.setPlayhead(tick);
    if (occupied) {
      selectClip(occupied, track);
      return;
    }
    if (selectMode) {
      status = 'Multiple selection is on. Turn it off to place a sound.';
      return;
    }
    const before = editor.composition;
    editor.placeAt(track.id, tick);
    status =
      editor.composition === before
        ? (editor.notice ?? 'That position is unavailable.')
        : `${focusedSample?.kind === 'loop' ? 'Loop' : 'Hit'} placed at ${timeLabel(tick)}.`;
  };

  const switchTrack = (event: Event) => {
    editor.selectedTrackId = (event.currentTarget as HTMLSelectElement).value;
  };

  const editHitBar = (bar: number) => {
    hitBar = bar;
    editor.setPlayhead(bar * TICKS_PER_BAR);
    status = `Editing Bar ${bar + 1}. Choose a beat and step.`;
  };

  const onPositionKeydown = (event: KeyboardEvent) => {
    const target = event.currentTarget as HTMLButtonElement;
    const tick = Number(target.dataset.tick);
    const track = focusedTrack;
    if (!track) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      const clip = clipAt(track, tick);
      if (!clip) return;
      event.preventDefault();
      editor.selectClip(clip.id);
      editor.deleteSelection();
      cancelMove('Clip deleted. Undo to restore it.');
      return;
    }
    const container = target.closest('.loop-positions, .hit-positions');
    if (!container) return;
    const positions = [...container.querySelectorAll<HTMLButtonElement>('.arrange-position')];
    const index = positions.indexOf(target);
    const columns = focusedSample?.kind === 'loop' ? 1 : 4;
    const next =
      event.key === 'ArrowLeft'
        ? index - 1
        : event.key === 'ArrowRight'
          ? index + 1
          : event.key === 'ArrowUp'
            ? index - columns
            : event.key === 'ArrowDown'
              ? index + columns
              : event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? positions.length - 1
                  : undefined;
    if (next === undefined) return;
    event.preventDefault();
    const destination = positions[Math.max(0, Math.min(next, positions.length - 1))];
    destination?.focus();
    editor.setPlayhead(Number(destination?.dataset.tick));
    status = `Position: ${timeLabel(editor.playheadTick)}.`;
  };
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && pendingMove) {
      event.preventDefault();
      cancelMove();
    }
  };
</script>

<svelte:window onkeydown={onKeydown} />

<section
  aria-label="Focused Arrange editor"
  bind:this={surface}
  class="focused-timeline timeline grid gap-3 bg-audle-deck-raised p-3 shadow-[var(--audle-deck-edge)]"
>
  <header class="flex flex-wrap items-end justify-between gap-3 border-b border-audle-outline pb-3">
    <div>
      <h1 class="m-0 text-base">Arrange</h1>
      <p class="m-0 mt-1 text-[0.78rem] text-audle-text-muted">
        One sound at a time. Tap an empty position to place; tap a clip, then its destination to
        move.
      </p>
    </div>
    <label class="grid gap-1 text-[0.75rem] font-bold text-audle-text-muted">
      Sound to arrange
      <select
        aria-label="Sound to arrange"
        class="min-h-11 border border-audle-outline bg-audle-control px-2 text-sm font-bold text-audle-text"
        value={focusedTrack?.id}
        onchange={switchTrack}
      >
        {#each tracks as track (track.id)}
          <option value={track.id}>{trackLabel(track)}</option>
        {/each}
      </select>
    </label>
  </header>

  <div class="flex flex-wrap items-center gap-2">
    <button
      aria-pressed={selectMode}
      class:active={selectMode}
      class="min-h-11 border border-audle-outline bg-audle-control px-3 text-[0.78rem] font-bold shadow-[var(--audle-control-rest)]"
      type="button"
      onclick={() => {
        selectMode = !selectMode;
        if (selectMode) {
          cancelMove('Multiple selection is on. Tap clips to add or remove them.');
          return;
        }
        const clip =
          selected.length === 1 &&
          focusedTrack?.clips.find((candidate) => candidate.id === selected[0]?.id);
        if (clip && focusedTrack) selectClip(clip, focusedTrack);
        else
          cancelMove(
            selected.length
              ? `${selected.length} clips selected. Edit below or clear the selection.`
              : 'Multiple selection is off.',
          );
      }}>Select multiple clips</button
    >
    {#if pendingMove}
      <button
        class="min-h-11 border border-audle-selection-light bg-audle-selection-surface px-3 text-[0.78rem] font-bold text-audle-text shadow-[var(--audle-control-rest)]"
        type="button"
        onclick={() => cancelMove()}>Cancel move</button
      >
    {/if}
    {#if selected.length}
      <button
        class="min-h-11 border border-audle-outline bg-audle-control px-3 text-[0.78rem] font-bold shadow-[var(--audle-control-rest)]"
        type="button"
        onclick={() => {
          editor.clearSelection();
          cancelMove('Selection cleared.');
        }}>Clear selection</button
      >
    {/if}
    <span class="text-[0.76rem] text-audle-text-muted">{selected.length} selected</span>
  </div>

  <output class="min-h-5 text-[0.8rem] text-audle-text-muted">{status}</output>

  {#if focusedTrack && focusedSample}
    <section aria-label={`${trackLabel(focusedTrack)} positions`} class="grid gap-3">
      <header class="flex items-baseline justify-between gap-3">
        <div>
          <span
            class="source-number font-mono text-sm font-extrabold"
            style={`--source:var(--audle-source-${Math.max(1, editor.challenge.sampleIds.indexOf(focusedTrack.sampleId) + 1)})`}
            >{sourceNumber(focusedTrack)}</span
          >
          <strong class="ml-2">{focusedTrack.label}</strong>
          <span
            class="ml-2 text-[0.75rem] font-bold uppercase tracking-[0.08em] text-audle-text-muted"
            >{focusedSample.kind === 'loop' ? 'Loop' : 'Hit'}</span
          >
          {#if editor.jamPicks[focusedTrack.id]}
            <span
              class="jam-pick ml-2 inline-flex items-center gap-1 text-[0.72rem] text-audle-loop-light"
              ><Icon name="spark" size={12} /> {editor.jamPicks[focusedTrack.id]}</span
            >
          {/if}
        </div>
        <span class="text-[0.75rem] text-audle-text-muted"
          >Playhead: Bar {barOf(editor.playheadTick)}</span
        >
      </header>

      {#if focusedSample.kind === 'loop'}
        <div class="loop-positions grid gap-2" style={`--bars:${editor.composition.bars}`}>
          {#each bars as bar (bar)}
            {@const tick = bar * TICKS_PER_BAR}
            {@const occupied = clipAt(focusedTrack, tick)}
            <div class="grid min-w-0 content-start gap-1">
              <button
                aria-label={`Bar ${bar + 1}${occupied ? `, occupied by ${spanLabel(occupied)}${occupied.startTick < tick ? ` continuing from Bar ${barOf(occupied.startTick)}` : ''}` : ', empty'}`}
                aria-pressed={occupied ? editor.selectedClipIds.includes(occupied.id) : undefined}
                class:occupied={Boolean(occupied)}
                class:selected={Boolean(occupied && editor.selectedClipIds.includes(occupied.id))}
                class:continuing={Boolean(
                  occupied && occupied.kind === 'loop' && occupied.startTick < tick,
                )}
                class="arrange-position relative grid min-h-11 content-center gap-0.5 border border-audle-grid-major bg-audle-well px-2 text-left shadow-[var(--audle-control-contact)]"
                data-tick={tick}
                type="button"
                onclick={() => usePosition(tick)}
                onkeydown={onPositionKeydown}
              >
                <span class="font-mono text-[0.72rem] font-bold text-audle-text-muted"
                  >Bar {bar + 1}</span
                >
                {#if occupied}
                  <strong class="text-[0.78rem]"
                    >{occupied.startTick < tick ? 'Continues' : 'Starts loop'}</strong
                  >
                  <span class="text-[0.68rem] text-audle-text-muted">{spanLabel(occupied)}</span>
                {:else}
                  <span class="text-[0.78rem] text-audle-text-muted">Place loop</span>
                {/if}
                <span class="loop-playhead" aria-hidden="true"></span>
              </button>
              {#each focusedTrack.clips.filter((clip) => clip.kind === 'loop' && clip.startTick > tick && clip.startTick < tick + TICKS_PER_BAR) as fragment (fragment.id)}
                <button
                  aria-label={`Select ${focusedTrack.label} loop at Bar ${bar + 1}, beat ${beatOf((fragment.startTick - tick) / TICKS_PER_SIXTEENTH)}`}
                  aria-pressed={editor.selectedClipIds.includes(fragment.id)}
                  class:selected={editor.selectedClipIds.includes(fragment.id)}
                  class="fragment min-h-11 border border-audle-loop-light bg-audle-loop-surface px-2 text-left text-[0.76rem] text-audle-text"
                  data-tick={fragment.startTick}
                  type="button"
                  onclick={() => {
                    editor.setPlayhead(fragment.startTick);
                    selectClip(fragment, focusedTrack);
                  }}
                  onkeydown={onPositionKeydown}
                  >Beat {beatOf((fragment.startTick - tick) / TICKS_PER_SIXTEENTH)} · {spanLabel(
                    fragment,
                  )}</button
                >
              {/each}
            </div>
          {/each}
        </div>
        <label class="grid gap-1 text-[0.75rem] text-audle-text-muted">
          Split position · {timeLabel(editor.playheadTick)}
          <input
            aria-label="Split position"
            aria-valuetext={timeLabel(editor.playheadTick)}
            class="min-h-11 w-full accent-audle-accent"
            type="range"
            min="0"
            max={totalTicks - TICKS_PER_SIXTEENTH}
            step={TICKS_PER_SIXTEENTH}
            value={editor.playheadTick}
            oninput={(event) => editor.setPlayhead(Number(event.currentTarget.value))}
          />
        </label>
      {:else}
        <div class="flex flex-wrap gap-2" role="group" aria-label="Choose a bar to edit">
          {#each bars as bar (bar)}
            <button
              aria-label={`Edit bar ${bar + 1}`}
              aria-pressed={activeHitBar === bar}
              class="min-h-11 min-w-11 border border-audle-outline bg-audle-control px-3 text-[0.78rem] font-bold aria-pressed:border-audle-one-shot-light aria-pressed:bg-audle-one-shot-surface"
              type="button"
              onclick={() => editHitBar(bar)}>Bar {bar + 1}</button
            >
          {/each}
        </div>
        <div
          aria-label={`Bar ${activeHitBar + 1} hit positions`}
          class="hit-positions relative grid grid-cols-4 gap-2 overflow-hidden"
        >
          {#each hitSteps as step (step)}
            {@const tick = activeHitBar * TICKS_PER_BAR + step * TICKS_PER_SIXTEENTH}
            {@const occupied = clipAt(focusedTrack, tick)}
            <button
              aria-label={positionLabel(tick, occupied)}
              aria-pressed={occupied ? editor.selectedClipIds.includes(occupied.id) : undefined}
              class:occupied={Boolean(occupied)}
              class:selected={Boolean(occupied && editor.selectedClipIds.includes(occupied.id))}
              class="arrange-position grid min-h-11 content-center border border-audle-grid-minor bg-audle-well p-1 text-center shadow-[var(--audle-control-contact)]"
              data-tick={tick}
              type="button"
              onclick={() => usePosition(tick)}
              onkeydown={onPositionKeydown}
            >
              <span class="font-mono text-[0.68rem] text-audle-text-muted">Beat {beatOf(step)}</span
              >
              <strong class="text-[0.76rem]"
                >{occupied ? spanLabel(occupied) : `Step ${stepOf(step)}`}</strong
              >
            </button>
          {/each}
          <span class="hit-playhead" aria-hidden="true"></span>
        </div>
      {/if}

      <div
        class="context-counts flex flex-wrap gap-x-3 gap-y-1 border-t border-audle-outline-subtle pt-2 text-[0.72rem] text-audle-text-muted"
        aria-label="Other active sounds by bar"
      >
        {#each bars as bar (bar)}
          {@const count = otherSoundCount(bar)}
          <span>Bar {bar + 1}: {count} other active sound{count === 1 ? '' : 's'}</span>
        {/each}
      </div>
    </section>
  {/if}
</section>

<style>
  .loop-positions {
    grid-template-columns: repeat(var(--bars), minmax(0, 1fr));
  }

  .arrange-position {
    min-inline-size: 48px;
    min-block-size: 48px;
  }

  .loop-playhead,
  .hit-playhead {
    position: absolute;
    z-index: 2;
    inset-block: 0;
    inline-size: 2px;
    background: var(--audle-playback-light);
    pointer-events: none;
  }

  .loop-playhead {
    display: none;
  }
  .arrange-position:hover {
    background: var(--audle-control-hover);
  }

  .arrange-position.occupied {
    border-color: var(--audle-loop-light);
    background: var(--audle-loop-surface);
  }

  .hit-positions .arrange-position.occupied {
    border-color: var(--audle-one-shot-light);
    background: var(--audle-one-shot-surface);
  }

  .arrange-position.continuing {
    border-style: dashed;
  }

  .arrange-position.selected,
  .fragment.selected,
  button.active {
    outline: 2px dashed var(--audle-selection-light);
    outline-offset: 2px;
  }

  button:focus-visible,
  select:focus-visible {
    outline: 3px solid var(--audle-accent);
    outline-offset: 2px;
  }

  .source-number {
    color: oklch(var(--source));
  }

  @media (max-width: 480px) {
    .loop-positions {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
