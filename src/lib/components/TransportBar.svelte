<script lang="ts">
  import { press } from '../motion';
  import Icon from './Icon.svelte';
  import { TICKS_PER_BAR } from '../domain/model';
  import type { EditorState } from '../state/editor.svelte';

  let { editor, onShare }: { editor: EditorState; onShare: () => void } = $props();
  type Bars = 1 | 2 | 3 | 4;
  let pendingLength = $state<{ bars: Bars; affected: number } | undefined>(undefined);
  const affectedBy = (bars: Bars) => {
    const end = bars * TICKS_PER_BAR;
    let affected = 0;
    for (const track of editor.composition.tracks)
      for (const clip of track.clips)
        if (
          clip.startTick >= end ||
          (clip.kind === 'loop' && clip.startTick + clip.lengthTicks > end)
        )
          affected += 1;
    return affected;
  };
  const chooseLength = (bars: Bars) => {
    pendingLength = undefined;
    if (bars === editor.composition.bars) return;
    const affected = bars < editor.composition.bars ? affectedBy(bars) : 0;
    if (affected) pendingLength = { bars, affected };
    else editor.setBars(bars);
  };
  const confirmLength = () => {
    if (!pendingLength) return;
    const affected = affectedBy(pendingLength.bars);
    if (affected !== pendingLength.affected) {
      pendingLength = affected ? { ...pendingLength, affected } : undefined;
      return;
    }
    editor.setBars(pendingLength.bars);
    pendingLength = undefined;
  };
</script>

<nav
  aria-label="Transport"
  class="transport flex items-stretch justify-between gap-2.5 border-t border-audle-outline bg-audle-deck p-2.5 max-[620px]:flex-wrap"
>
  <div
    class="transport-main flex min-w-0 items-center gap-2 max-[620px]:w-full max-[620px]:justify-between max-[400px]:flex-wrap"
  >
    <button
      class="play inline-flex min-h-12 items-center justify-center gap-1.5 border border-audle-outline bg-audle-control px-3 font-bold text-audle-text shadow-[var(--audle-control-rest)] hover:enabled:bg-audle-control-hover disabled:cursor-not-allowed disabled:bg-audle-disabled disabled:text-audle-disabled-ink"
      aria-label={editor.playing ? 'Stop playback' : 'Play composition'}
      class:playing={editor.playing}
      disabled={editor.loading || Boolean(editor.loadingError)}
      type="button"
      onclick={() => void editor.togglePlayback()}
    >
      <Icon name={editor.playing ? 'stop' : 'play'} />
      {editor.playing ? 'Stop' : 'Play'}
    </button>
    <div class="grid justify-items-center">
      <button
        class="record inline-flex min-h-12 items-center justify-center gap-1.5 border border-audle-outline bg-audle-control px-3 font-bold text-audle-text shadow-[var(--audle-control-rest)] hover:enabled:bg-audle-control-hover disabled:cursor-not-allowed disabled:bg-audle-disabled disabled:text-audle-disabled-ink [&_.icon]:text-audle-record-light"
        aria-pressed={editor.recording}
        class:recording={editor.recording}
        disabled={editor.loading || Boolean(editor.loadingError)}
        type="button"
        onclick={() => void editor.toggleRecording()}
      >
        <Icon name="record" />
        {editor.recording ? 'Stop recording pads' : 'Record pads'}
      </button>
      {#if editor.recording}
        <small role="status" class="text-audle-text-muted">Pad taps add clips</small>
      {/if}
    </div>
    <div
      class="bars grid gap-0.5 text-[0.65rem] font-bold tracking-[0.08em] text-audle-text-muted uppercase max-[400px]:w-full"
      role="group"
      aria-label="Arrangement length in bars"
    >
      <span>Arrangement length</span>
      <div class="segments flex [&>button+button]:border-l-0">
        {#each [1, 2, 3, 4] as bars (bars)}
          <button
            class="min-h-11 min-w-11 border border-audle-outline bg-audle-control px-0 text-[0.85rem] font-bold text-audle-text shadow-[var(--audle-control-rest)] hover:enabled:bg-audle-control-hover disabled:cursor-not-allowed disabled:bg-audle-disabled disabled:text-audle-disabled-ink"
            type="button"
            aria-pressed={editor.composition.bars === bars}
            aria-label={`${bars} ${bars === 1 ? 'bar' : 'bars'}`}
            use:press
            onclick={() => chooseLength(bars as Bars)}>{bars}</button
          >
        {/each}
      </div>
      {#if pendingLength}
        <div class="grid gap-1.5 normal-case tracking-normal" role="alert">
          <span>
            Shortening to {pendingLength.bars}
            {pendingLength.bars === 1 ? 'bar' : 'bars'} trims or removes {pendingLength.affected}
            {pendingLength.affected === 1 ? 'clip' : 'clips'}. Undo restores them.
          </span>
          <div class="flex flex-wrap gap-1.5">
            <button
              class="min-h-11 border border-audle-outline bg-audle-control px-2 text-audle-text"
              type="button"
              onclick={() => (pendingLength = undefined)}>Keep length</button
            >
            <button
              class="min-h-11 border border-audle-record-light bg-audle-record-surface px-2 text-audle-text"
              type="button"
              aria-label={`Shorten arrangement to ${pendingLength.bars} ${pendingLength.bars === 1 ? 'bar' : 'bars'}`}
              onclick={confirmLength}>Shorten arrangement</button
            >
          </div>
        </div>
      {/if}
    </div>
  </div>
  <div
    class="transport-secondary flex items-center gap-2 max-[620px]:w-full max-[620px]:justify-between"
  >
    <button
      class="inline-flex min-h-12 items-center justify-center gap-1.5 border border-audle-outline bg-audle-control px-3 font-bold text-audle-text shadow-[var(--audle-control-rest)] hover:enabled:bg-audle-control-hover disabled:cursor-not-allowed disabled:bg-audle-disabled disabled:text-audle-disabled-ink max-[620px]:min-h-11 max-[620px]:px-2"
      aria-label="Undo"
      disabled={!editor.canUndo}
      type="button"
      onclick={() => editor.undo()}><Icon name="undo" /> Undo</button
    >
    <button
      class="inline-flex min-h-12 items-center justify-center gap-1.5 border border-audle-outline bg-audle-control px-3 font-bold text-audle-text shadow-[var(--audle-control-rest)] hover:enabled:bg-audle-control-hover disabled:cursor-not-allowed disabled:bg-audle-disabled disabled:text-audle-disabled-ink max-[620px]:min-h-11 max-[620px]:px-2"
      aria-label="Redo"
      disabled={!editor.canRedo}
      type="button"
      onclick={() => editor.redo()}><Icon name="redo" /> Redo</button
    >
    <button
      class="share inline-flex min-h-12 items-center justify-center gap-1.5 border border-audle-accent-dim bg-audle-control px-3 font-bold text-audle-text shadow-[var(--audle-control-rest)] hover:enabled:bg-audle-control-hover max-[620px]:min-h-11 max-[620px]:px-2"
      type="button"
      use:press
      onclick={onShare}><Icon name="share" /> Share</button
    >
  </div>
</nav>

<style>
  button.play.playing,
  .segments button[aria-pressed='true'] {
    background: var(--audle-playback-surface);
    box-shadow:
      inset 0 0 0 1px var(--audle-playback-light),
      var(--audle-control-contact);
  }

  button.record.recording {
    background: var(--audle-record-surface);
    box-shadow:
      inset 0 0 0 1px var(--audle-record-light),
      var(--audle-control-contact);
  }
</style>
