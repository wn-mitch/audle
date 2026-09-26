<script lang="ts">
  import { rise } from '../motion';
  import Icon from './Icon.svelte';
  let {
    message,
    tone = 'neutral',
    actions = [],
    onDismiss,
  }: {
    message: string | undefined;
    tone?: 'neutral' | 'error' | 'record';
    /** Follow-up actions that belong to this message, such as playing a take just saved. */
    actions?: Array<{ label: string; onClick: () => void }>;
    onDismiss?: () => void;
  } = $props();
</script>

{#if message}
  <aside
    class:danger={tone === 'error'}
    class:recording={tone === 'record'}
    class="notice"
    role="status"
    transition:rise={{ y: -8 }}
  >
    <span aria-hidden="true">{tone === 'error' ? '!' : tone === 'record' ? '●' : 'i'}</span>
    <p>{message}</p>
    {#each actions as action (action.label)}
      <button type="button" class="action" onclick={action.onClick}>{action.label}</button>
    {/each}
    {#if onDismiss}
      <button type="button" class="dismiss" aria-label="Dismiss notice" onclick={onDismiss}
        ><Icon name="close" /></button
      >
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

  .notice > span {
    color: var(--audle-playback-light);
    font-family: ui-monospace, monospace;
    font-weight: 800;
  }
  .notice p {
    flex: 1;
    margin: 0;
    font-size: 0.875rem;
  }
  .notice .dismiss {
    display: grid;
    place-items: center;
    inline-size: 36px;
    block-size: 36px;
    border: 0;
    background: transparent;
    color: var(--audle-text-muted);
    cursor: pointer;
  }
  .notice .action {
    min-block-size: 36px;
    padding-inline: 12px;
    border: 1px solid var(--audle-accent-dim);
    background: var(--audle-control);
    color: var(--audle-text);
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 700;
  }
  .notice .action:hover {
    background: var(--audle-playback-surface);
  }
  .notice.danger {
    border-color: var(--audle-record-light);
    box-shadow: inset 0 0 0 1px var(--audle-record-light);
  }
  .notice.danger > span,
  .notice.recording > span {
    color: var(--audle-record-light);
  }
</style>
