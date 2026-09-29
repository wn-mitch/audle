<script lang="ts">
  import { RotateCcw } from '@lucide/svelte';
  /** One 16px stroke icon set, so every control shares a vocabulary instead of text glyphs. */
  export type IconName =
    | 'play'
    | 'stop'
    | 'record'
    | 'share'
    | 'download'
    | 'arrow-right'
    | 'arrow-left'
    | 'chevron-down'
    | 'undo'
    | 'reset'
    | 'redo'
    | 'spark'
    | 'check'
    | 'close'
    | 'help'
    | 'loop'
    | 'hit';

  let { name, size = 16 }: { name: IconName; size?: number } = $props();

  const paths: Record<Exclude<IconName, 'reset'>, string> = {
    play: 'M5 3.5v9l7.5-4.5z',
    stop: 'M4 4h8v8H4z',
    record: 'M8 4.2a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6z',
    share: 'M8 2.5v8M5 5.5l3-3 3 3M3.5 9.5v3h9v-3',
    download: 'M8 2.5v8M5 7.5l3 3 3-3M3.5 13.5h9',
    'arrow-right': 'M3 8h10M9 4l4 4-4 4',
    'arrow-left': 'M13 8H3M7 4L3 8l4 4',
    'chevron-down': 'M4 6l4 4 4-4',
    undo: 'M6 4.5H2.5V1M2.8 4.6A6 6 0 1 1 2 9',
    redo: 'M10 4.5h3.5V1M13.2 4.6A6 6 0 1 0 14 9',
    spark: 'M8 1.5l1.6 4.9 4.9 1.6-4.9 1.6L8 14.5l-1.6-4.9L1.5 8l4.9-1.6z',
    check: 'M3 8.5l3 3 7-7',
    close: 'M4 4l8 8M12 4l-8 8',
    help: 'M6 6a2 2 0 1 1 3 1.7c-.7.4-1 .9-1 1.8M8 12.2v.1',
    loop: 'M3 8a5 5 0 0 1 8.5-3.6M13 8a5 5 0 0 1-8.5 3.6M11 1.5v3h-3M5 14.5v-3h3',
    hit: 'M8 5.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
  };
  const filled = new Set<IconName>(['play', 'stop', 'record', 'spark', 'hit']);
</script>

{#if name === 'reset'}
  <RotateCcw aria-hidden="true" class="icon shrink-0 align-[-0.15em]" {size} strokeWidth={2.4} />
{:else}
  <svg
    aria-hidden="true"
    class="icon shrink-0 align-[-0.15em]"
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill={filled.has(name) ? 'currentColor' : 'none'}
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d={paths[name]} />
  </svg>
{/if}
