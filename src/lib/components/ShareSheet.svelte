<script lang="ts">
  import { renderWav } from '../audio/export';
  import type { CompositionV1 } from '../domain/model';
  import type { PerformanceV1 } from '../domain/performance';
  import { press } from '../motion';
  import type { EditorState } from '../state/editor.svelte';
  import Icon from './Icon.svelte';

  let {
    editor,
    open,
    history,
    fallbackLink,
    onClose,
    onShareLoop,
    onShareTake,
    onOpen,
  }: {
    editor: EditorState;
    open: boolean;
    /** Compositions opened from links on this device. */
    history: CompositionV1[];
    /** A link to copy by hand when the platform share sheet and clipboard are unavailable. */
    fallbackLink: string | undefined;
    onClose: () => void;
    onShareLoop: () => void;
    onShareTake: (take: PerformanceV1) => void;
    onOpen: (composition: CompositionV1) => void;
  } = $props();
  let dialog: HTMLDialogElement;
  let fallbackInput: HTMLInputElement | undefined = $state(undefined);
  let exporting = $state(false);
  let exportError = $state('');
  const hasLoop = $derived(editor.composition.tracks.some((track) => track.clips.length));
  const takeSeconds = $derived(
    editor.performance
      ? Math.round(
          (editor.performance.durationTicks * 60) /
            (96 * editor.performance.composition.challenge.bpm),
        )
      : 0,
  );

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  });
  $effect(() => {
    if (fallbackLink && fallbackInput) {
      fallbackInput.focus();
      fallbackInput.select();
    }
  });

  const download = async (take = false) => {
    exporting = true;
    exportError = '';
    try {
      const blob = await renderWav(editor.composition, take ? editor.performance : undefined);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audle-${editor.challenge.date}-${take ? 'take' : 'loop'}.wav`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      exportError = 'The audio could not be rendered. Try again.';
    } finally {
      exporting = false;
    }
  };
</script>

<dialog
  bind:this={dialog}
  class="sheet"
  aria-labelledby="share-title"
  onclose={onClose}
  onclick={(event) => {
    if (event.target === dialog) onClose();
  }}
>
  <div class="sheet-body">
    <header>
      <h2 id="share-title">Share</h2>
      <button type="button" aria-label="Close" class="close" onclick={onClose}
        ><Icon name="close" /></button
      >
    </header>

    <section aria-labelledby="share-loop-title">
      <h3 id="share-loop-title">Your loop</h3>
      <div class="actions">
        <button type="button" class="primary" disabled={!hasLoop} use:press onclick={onShareLoop}
          ><Icon name="share" /> Copy link</button
        ><button
          type="button"
          aria-label="Download loop WAV"
          disabled={!hasLoop || exporting}
          use:press
          onclick={() => void download()}><Icon name="download" /> Download WAV</button
        >
      </div>
    </section>

    <section aria-labelledby="share-take-title">
      <h3 id="share-take-title">Live take</h3>
      {#if editor.performance}
        <p>{takeSeconds} seconds of switching sounds in and out, replayed exactly as performed.</p>
        <div class="actions">
          <button type="button" use:press onclick={() => void editor.playCapture()}
            >{#if editor.playingPerformance}<Icon name="stop" /> Stop take{:else}<Icon
                name="play"
              /> Play take{/if}</button
          ><button
            type="button"
            class="primary"
            use:press
            onclick={() => onShareTake(editor.performance!)}
            ><Icon name="share" /> Copy take link</button
          ><button
            type="button"
            aria-label="Download take WAV"
            disabled={exporting}
            use:press
            onclick={() => void download(true)}><Icon name="download" /> Download WAV</button
          ><button
            type="button"
            class="quiet"
            disabled={editor.playingPerformance}
            onclick={() => editor.discardCapture()}>Discard take</button
          >
        </div>
      {:else}
        <p>Press Record on the Play field, switch sounds on and off as the loop runs, then save.</p>
      {/if}
    </section>

    {#if fallbackLink}
      <section class="fallback" aria-labelledby="share-fallback-title">
        <h3 id="share-fallback-title">Copy this link</h3>
        <input bind:this={fallbackInput} readonly value={fallbackLink} />
      </section>
    {/if}
    {#if exportError}<p class="error" role="alert">{exportError}</p>{/if}
    {#if exporting}<p class="status" role="status">Rendering audio in your browser…</p>{/if}

    {#if history.length}
      <section aria-labelledby="share-history-title">
        <h3 id="share-history-title">Shared with you</h3>
        <ul class="history">
          {#each history as composition (composition.challenge.date + composition.tracks
              .map((track) => track.id)
              .join(':'))}
            <li>
              <button type="button" onclick={() => onOpen(composition)}
                ><span
                  >Made for {composition.challenge.date} · {composition.tracks.length} voices</span
                ><Icon name="play" /></button
              >
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <p class="footnote">
      No account needed. Your loop and take stay in this browser until you share them; a share link
      is kept on our server for 90 days.
    </p>
  </div>
</dialog>

<style>
  .sheet {
    inline-size: min(100% - 24px, 520px);
    max-block-size: min(100dvh - 24px, 720px);
    margin: auto auto 12px;
    padding: 0;
    border: 1px solid var(--audle-outline);
    background: var(--audle-deck-raised);
    color: var(--audle-text);
    box-shadow: var(--audle-deck-edge);
  }
  .sheet::backdrop {
    background: oklch(0.05 0.01 232 / 0.6);
  }
  .sheet-body {
    display: grid;
    gap: 20px;
    padding: 18px 20px 20px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h2 {
    margin: 0;
    font-size: 1.25rem;
    letter-spacing: -0.02em;
  }
  h3 {
    margin: 0 0 8px;
    color: var(--audle-text-muted);
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  p {
    margin: 0 0 10px;
    color: var(--audle-text-muted);
    font-size: 0.875rem;
    line-height: 1.5;
  }
  .close {
    display: grid;
    place-items: center;
    inline-size: 40px;
    block-size: 40px;
    border: 0;
    background: transparent;
    color: var(--audle-text-muted);
    cursor: pointer;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .actions button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-block-size: 44px;
    padding-inline: 14px;
    border: 1px solid var(--audle-outline);
    background: var(--audle-control);
    box-shadow: var(--audle-control-rest);
    color: var(--audle-text);
    cursor: pointer;
    font-weight: 700;
  }
  .actions button:hover:not(:disabled) {
    background: var(--audle-control-hover);
  }
  .actions .primary {
    border-color: var(--audle-accent);
    background: var(--audle-accent);
    color: var(--audle-accent-ink);
  }
  .actions .quiet {
    border-color: transparent;
    background: transparent;
    box-shadow: none;
    color: var(--audle-text-muted);
  }
  .actions button:disabled {
    background: var(--audle-disabled);
    border-color: var(--audle-disabled);
    box-shadow: none;
    color: var(--audle-disabled-ink);
    cursor: not-allowed;
  }
  .fallback input {
    inline-size: 100%;
    min-block-size: 44px;
    padding-inline: 8px;
    border: 1px solid var(--audle-outline);
    background: var(--audle-well);
    color: var(--audle-text);
    font-family: ui-monospace, monospace;
    font-size: 0.8rem;
  }
  .history {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
    border-block-start: 1px solid var(--audle-outline-subtle);
  }
  .history button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    inline-size: 100%;
    min-block-size: 48px;
    padding: 0;
    border: 0;
    border-block-end: 1px solid var(--audle-outline-subtle);
    background: transparent;
    color: var(--audle-text);
    cursor: pointer;
    font-size: 0.875rem;
    text-align: start;
  }
  .history button:hover {
    color: var(--audle-accent);
  }
  .error {
    color: var(--audle-record-light);
  }
  .status,
  .footnote {
    margin: 0;
    color: var(--audle-text-dim);
    font-size: 0.78rem;
  }
</style>
