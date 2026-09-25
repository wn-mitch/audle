<script lang="ts">
  import type { EditorState } from '../state/editor.svelte';
  import { SOURCES_PER_DAY } from '../domain/model';

  let { editor }: { editor: EditorState } = $props();
  let vibe = $state('');
  const hasEmptyTrack = $derived(
    editor.composition.tracks.slice(0, SOURCES_PER_DAY).some((track) => track.clips.length === 0),
  );
</script>

<form
  aria-label="Jam with Jev"
  class="jam"
  onsubmit={(event) => {
    event.preventDefault();
    void editor.jamWithJev(vibe);
  }}
>
  <label>
    <span>Vibe for Jev</span>
    <input maxlength="80" placeholder="eerie and slow" bind:value={vibe} />
  </label>
  <button
    aria-busy={editor.jamming}
    disabled={editor.jamming || editor.loading || !hasEmptyTrack}
    title={hasEmptyTrack
      ? 'Jev picks a pattern for every empty track'
      : 'Every track has clips. Clear one to let Jev jam.'}
    type="submit"
  >
    <span aria-hidden="true">✦</span>
    {editor.jamming ? 'Jev is jamming…' : 'Jam with Jev'}
  </button>
</form>

<style>
  .jam {
    display: flex;
    align-items: end;
    gap: 8px;
    padding: 10px 14px;
    background: var(--audle-deck-raised);
    box-shadow: var(--audle-deck-edge);
  }
  label {
    display: grid;
    flex: 1;
    gap: 2px;
    min-inline-size: 0;
    color: var(--audle-text-muted);
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  input {
    min-block-size: 48px;
    padding-inline: 10px;
    border: 1px solid var(--audle-outline);
    background: var(--audle-well);
    color: var(--audle-text);
    font-size: 0.9rem;
    letter-spacing: normal;
    text-transform: none;
  }
  button {
    display: flex;
    align-items: center;
    gap: 6px;
    min-block-size: 48px;
    padding-inline: 14px;
    border: 1px solid var(--audle-loop-light);
    background: var(--audle-control);
    box-shadow:
      inset 0 0 0 1px var(--audle-loop-light),
      var(--audle-control-rest);
    color: var(--audle-text);
    cursor: pointer;
    font-weight: 700;
    white-space: nowrap;
  }
  button span {
    color: var(--audle-loop-light);
  }
  button:hover:not(:disabled) {
    background: var(--audle-loop-surface);
  }
  button:disabled {
    background: var(--audle-disabled);
    border-color: var(--audle-disabled);
    box-shadow: none;
    color: var(--audle-disabled-ink);
    cursor: not-allowed;
  }
  button[aria-busy='true'] span {
    animation: spin 900ms linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    button[aria-busy='true'] span {
      animation: none;
    }
  }
</style>
