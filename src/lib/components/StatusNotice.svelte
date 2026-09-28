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
    class="notice flex min-h-12 items-center gap-2.5 border bg-audle-deck-raised px-3 py-2.5 text-audle-text shadow-[var(--audle-control-rest)] {tone ===
    'error'
      ? 'border-audle-record-light shadow-[inset_0_0_0_1px_var(--audle-record-light)]'
      : 'border-audle-outline'}"
    role="status"
    transition:rise={{ y: -8 }}
  >
    <span
      aria-hidden="true"
      class="font-mono font-extrabold {tone === 'neutral'
        ? 'text-audle-playback-light'
        : 'text-audle-record-light'}">{tone === 'error' ? '!' : tone === 'record' ? '●' : 'i'}</span
    >
    <p class="m-0 flex-1 text-sm">{message}</p>
    {#each actions as action (action.label)}
      <button
        type="button"
        class="action min-h-11 cursor-pointer border border-audle-accent-dim bg-audle-control px-3 text-[0.8rem] font-bold text-audle-text hover:bg-audle-playback-surface"
        onclick={action.onClick}>{action.label}</button
      >
    {/each}
    {#if onDismiss}
      <button
        type="button"
        class="dismiss grid size-11 cursor-pointer place-items-center border-0 bg-transparent text-audle-text-muted"
        aria-label="Dismiss notice"
        onclick={onDismiss}><Icon name="close" /></button
      >
    {/if}
  </aside>
{/if}
