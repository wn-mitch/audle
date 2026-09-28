<script lang="ts">
  import type { EditorState } from '../state/editor.svelte';
  import { SOURCES_PER_DAY } from '../domain/model';
  import Icon from './Icon.svelte';

  let { editor }: { editor: EditorState } = $props();
  let vibe = $state('');
  const hasEmptyTrack = $derived(
    editor.composition.tracks.slice(0, SOURCES_PER_DAY).some((track) => track.clips.length === 0),
  );
</script>

<form
  aria-label="Jam with Jev"
  class="jam flex items-end gap-2 bg-audle-deck-raised px-3.5 py-2.5 shadow-[var(--audle-deck-edge)]"
  onsubmit={(event) => {
    event.preventDefault();
    void editor.jamWithJev(vibe);
  }}
>
  <label
    class="grid min-w-0 flex-1 gap-0.5 text-[0.65rem] font-bold tracking-[0.08em] text-audle-text-muted uppercase"
  >
    <span>Vibe for Jev</span>
    <input
      class="min-h-12 min-w-0 w-full border border-audle-outline bg-audle-well px-2.5 text-[0.9rem] tracking-normal text-audle-text normal-case"
      maxlength="80"
      placeholder="eerie and slow"
      bind:value={vibe}
    />
  </label>
  <button
    class="inline-flex min-h-12 cursor-pointer items-center gap-1.5 border border-audle-loop-light bg-audle-control px-3.5 font-bold whitespace-nowrap text-audle-text shadow-[inset_0_0_0_1px_var(--audle-loop-light),var(--audle-control-rest)] hover:enabled:bg-audle-loop-surface disabled:cursor-not-allowed disabled:border-audle-disabled disabled:bg-audle-disabled disabled:text-audle-disabled-ink disabled:shadow-none"
    aria-busy={editor.jamming}
    disabled={editor.jamming || editor.loading || !hasEmptyTrack}
    title={hasEmptyTrack
      ? 'Jev picks a pattern for every empty track'
      : 'Every track has clips. Clear one to let Jev jam.'}
    type="submit"
  >
    <span class="spark inline-flex text-audle-loop-light" aria-hidden="true"
      ><Icon name="spark" /></span
    >
    {editor.jamming ? 'Jev is jamming…' : 'Jam with Jev'}
  </button>
</form>

<style>
  button[aria-busy='true'] .spark {
    animation: spin 900ms linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    button[aria-busy='true'] .spark {
      animation: none;
    }
  }
</style>
