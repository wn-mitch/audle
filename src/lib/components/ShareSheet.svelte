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
  class="sheet m-auto mb-3 max-h-[min(calc(100dvh_-_24px),_720px)] w-[min(calc(100%_-_24px),_520px)] border border-audle-outline bg-audle-deck-raised p-0 text-audle-text [box-shadow:var(--audle-deck-edge)]"
  aria-labelledby="share-title"
  onclose={onClose}
  onclick={(event) => {
    if (event.target === dialog) onClose();
  }}
>
  <div class="grid gap-5 px-5 pt-[18px] pb-5">
    <header class="flex items-center justify-between">
      <h2 id="share-title" class="m-0 text-xl tracking-[-0.02em]">Share</h2>
      <button
        type="button"
        aria-label="Close"
        class="grid size-11 cursor-pointer place-items-center border-0 bg-transparent text-audle-text-muted"
        onclick={onClose}><Icon name="close" /></button
      >
    </header>

    <section aria-labelledby="share-loop-title">
      <h3
        id="share-loop-title"
        class="m-0 mb-2 text-[0.7rem] font-extrabold uppercase tracking-[0.08em] text-audle-text-muted"
      >
        Your loop
      </h3>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="inline-flex min-h-11 cursor-pointer items-center gap-2 border border-audle-accent bg-audle-accent px-3.5 font-bold text-audle-accent-ink enabled:hover:bg-audle-control-hover disabled:cursor-not-allowed disabled:border-audle-disabled disabled:bg-audle-disabled disabled:text-audle-disabled-ink disabled:shadow-none [box-shadow:var(--audle-control-rest)]"
          disabled={!hasLoop}
          use:press
          onclick={onShareLoop}><Icon name="share" /> Copy link</button
        >
        <button
          type="button"
          aria-label="Download loop WAV"
          class="inline-flex min-h-11 cursor-pointer items-center gap-2 border border-audle-outline bg-audle-control px-3.5 font-bold text-audle-text enabled:hover:bg-audle-control-hover disabled:cursor-not-allowed disabled:border-audle-disabled disabled:bg-audle-disabled disabled:text-audle-disabled-ink disabled:shadow-none [box-shadow:var(--audle-control-rest)]"
          disabled={!hasLoop || exporting}
          use:press
          onclick={() => void download()}><Icon name="download" /> Download WAV</button
        >
      </div>
    </section>

    <section aria-labelledby="share-take-title">
      <h3
        id="share-take-title"
        class="m-0 mb-2 text-[0.7rem] font-extrabold uppercase tracking-[0.08em] text-audle-text-muted"
      >
        Live take
      </h3>
      {#if editor.performance}
        <p class="m-0 mb-2.5 text-sm leading-6 text-audle-text-muted">
          {takeSeconds} seconds of switching sounds in and out, replayed exactly as performed.
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="inline-flex min-h-11 cursor-pointer items-center gap-2 border border-audle-outline bg-audle-control px-3.5 font-bold text-audle-text enabled:hover:bg-audle-control-hover disabled:cursor-not-allowed disabled:border-audle-disabled disabled:bg-audle-disabled disabled:text-audle-disabled-ink disabled:shadow-none [box-shadow:var(--audle-control-rest)]"
            use:press
            onclick={() => void editor.playCapture()}
            >{#if editor.playingPerformance}<Icon name="stop" /> Stop take{:else}<Icon
                name="play"
              /> Play take{/if}</button
          >
          <button
            type="button"
            class="inline-flex min-h-11 cursor-pointer items-center gap-2 border border-audle-accent bg-audle-accent px-3.5 font-bold text-audle-accent-ink enabled:hover:bg-audle-control-hover disabled:cursor-not-allowed disabled:border-audle-disabled disabled:bg-audle-disabled disabled:text-audle-disabled-ink disabled:shadow-none [box-shadow:var(--audle-control-rest)]"
            use:press
            onclick={() => onShareTake(editor.performance!)}
            ><Icon name="share" /> Copy take link</button
          >
          <button
            type="button"
            aria-label="Download take WAV"
            class="inline-flex min-h-11 cursor-pointer items-center gap-2 border border-audle-outline bg-audle-control px-3.5 font-bold text-audle-text enabled:hover:bg-audle-control-hover disabled:cursor-not-allowed disabled:border-audle-disabled disabled:bg-audle-disabled disabled:text-audle-disabled-ink disabled:shadow-none [box-shadow:var(--audle-control-rest)]"
            disabled={exporting}
            use:press
            onclick={() => void download(true)}><Icon name="download" /> Download WAV</button
          >
          <button
            type="button"
            class="inline-flex min-h-11 cursor-pointer items-center gap-2 border border-transparent bg-transparent px-3.5 font-bold text-audle-text-muted shadow-none enabled:hover:bg-audle-control-hover disabled:cursor-not-allowed disabled:border-audle-disabled disabled:bg-audle-disabled disabled:text-audle-disabled-ink disabled:shadow-none"
            disabled={editor.playingPerformance}
            onclick={() => editor.discardCapture()}>Discard take</button
          >
        </div>
      {:else}
        <p class="m-0 mb-2.5 text-sm leading-6 text-audle-text-muted">
          Press Record on the Play field, switch sounds on and off as the loop runs, then save.
        </p>
      {/if}
    </section>

    {#if fallbackLink}
      <section class="fallback" aria-labelledby="share-fallback-title">
        <h3
          id="share-fallback-title"
          class="m-0 mb-2 text-[0.7rem] font-extrabold uppercase tracking-[0.08em] text-audle-text-muted"
        >
          Copy this link
        </h3>
        <input
          bind:this={fallbackInput}
          class="min-h-11 w-full border border-audle-outline bg-audle-well px-2 font-mono text-[0.8rem] text-audle-text"
          readonly
          value={fallbackLink}
        />
      </section>
    {/if}
    {#if exportError}<p class="m-0 mb-2.5 text-sm leading-6 text-audle-record-light" role="alert">
        {exportError}
      </p>{/if}
    {#if exporting}<p class="m-0 text-[0.78rem] text-audle-text-dim" role="status">
        Rendering audio in your browser…
      </p>{/if}

    {#if history.length}
      <section aria-labelledby="share-history-title">
        <h3
          id="share-history-title"
          class="m-0 mb-2 text-[0.7rem] font-extrabold uppercase tracking-[0.08em] text-audle-text-muted"
        >
          Shared with you
        </h3>
        <ul class="history grid m-0 list-none border-t border-audle-outline-subtle p-0">
          {#each history as composition (composition.challenge.date + composition.tracks
              .map((track) => track.id)
              .join(':'))}
            <li>
              <button
                type="button"
                class="flex min-h-12 w-full cursor-pointer items-center justify-between border-0 border-b border-audle-outline-subtle bg-transparent p-0 text-left text-sm text-audle-text hover:text-audle-accent"
                onclick={() => onOpen(composition)}
                ><span
                  >Made for {composition.challenge.date} · {composition.tracks.length} voices</span
                ><Icon name="play" /></button
              >
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <p class="m-0 text-[0.78rem] text-audle-text-dim">
      No account needed. Your loop and take stay in this browser until you share them; a share link
      is kept on our server for 90 days.
    </p>
  </div>
</dialog>

<style>
  .sheet::backdrop {
    background: oklch(0.05 0.01 232 / 0.6);
  }
</style>
