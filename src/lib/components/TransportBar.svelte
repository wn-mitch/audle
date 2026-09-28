<script lang="ts">
  import { press } from '../motion';
  import Icon from './Icon.svelte';
  import type { EditorState } from '../state/editor.svelte';

  let { editor, onShare }: { editor: EditorState; onShare: () => void } = $props();
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
    <button
      class="record inline-flex min-h-12 items-center justify-center gap-1.5 border border-audle-outline bg-audle-control px-3 font-bold text-audle-text shadow-[var(--audle-control-rest)] hover:enabled:bg-audle-control-hover disabled:cursor-not-allowed disabled:bg-audle-disabled disabled:text-audle-disabled-ink [&_.icon]:text-audle-record-light"
      aria-pressed={editor.recording}
      class:recording={editor.recording}
      disabled={editor.loading || Boolean(editor.loadingError)}
      type="button"
      onclick={() => void editor.toggleRecording()}
    >
      <Icon name="record" />
      {editor.recording ? 'Recording' : 'Record'}
    </button>
    <div
      class="bars grid gap-0.5 text-[0.65rem] font-bold tracking-[0.08em] text-audle-text-muted uppercase max-[400px]:w-full"
      role="group"
      aria-label="Loop length in bars"
    >
      <span>Bars</span>
      <div class="segments flex [&>button+button]:border-l-0">
        {#each [1, 2, 3, 4] as bars (bars)}
          <button
            class="min-h-[30px] min-w-[34px] border border-audle-outline bg-audle-control px-0 text-[0.85rem] font-bold text-audle-text shadow-[var(--audle-control-rest)] hover:enabled:bg-audle-control-hover disabled:cursor-not-allowed disabled:bg-audle-disabled disabled:text-audle-disabled-ink"
            type="button"
            aria-pressed={editor.composition.bars === bars}
            aria-label={`${bars} ${bars === 1 ? 'bar' : 'bars'}`}
            use:press
            onclick={() => editor.setBars(bars as 1 | 2 | 3 | 4)}>{bars}</button
          >
        {/each}
      </div>
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
