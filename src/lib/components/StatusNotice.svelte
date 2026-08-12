<script lang="ts">
  let { message, tone = 'neutral', onDismiss }: {
    message: string | undefined;
    tone?: 'neutral' | 'error' | 'record';
    onDismiss?: () => void;
  } = $props();
</script>

{#if message}
  <aside class:danger={tone === 'error'} class:recording={tone === 'record'} class="notice" role="status">
    <span aria-hidden="true">{tone === 'error' ? '!' : tone === 'record' ? '●' : 'i'}</span>
    <p>{message}</p>
    {#if onDismiss}
      <button type="button" aria-label="Dismiss notice" onclick={onDismiss}>×</button>
    {/if}
  </aside>
{/if}

<style>
  .notice {
    display: flex;
    align-items: center;
    gap: 10px;
    min-block-size: 48px;
    padding: 10px 12px;
    color: var(--audle-text);
    background: var(--audle-deck-raised);
    border: 1px solid var(--audle-outline);
    box-shadow: var(--audle-control-rest);
  }

  .notice > span { color: var(--audle-playback-light); font-family: ui-monospace, monospace; font-weight: 800; }
  .notice p { flex: 1; margin: 0; font-size: 0.875rem; }
  .notice button { inline-size: 32px; block-size: 32px; border: 0; background: transparent; cursor: pointer; }
  .notice.danger { border-color: var(--audle-record-light); box-shadow: inset 0 0 0 1px var(--audle-record-light); }
  .notice.danger > span, .notice.recording > span { color: var(--audle-record-light); }
</style>
