<script lang="ts">
  let {
    label,
    value,
    min,
    max,
    step,
    valueText,
    onStart,
    onChange,
    onEnd,
    dial = false,
    detail,
    disabled = false,
    resetValue,
    onReset,
  }: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    valueText: string;
    onStart: () => void;
    onChange: (value: number) => void;
    onEnd: () => void;
    dial?: boolean;
    detail?: string;
    disabled?: boolean;
    resetValue?: number;
    onReset?: () => void;
  } = $props();

  let gestureActive = false;
  const progress = $derived(
    max === min ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min))),
  );
  const adjustmentKeys: Record<string, true> = {
    ArrowDown: true,
    ArrowLeft: true,
    ArrowRight: true,
    ArrowUp: true,
    End: true,
    Home: true,
    PageDown: true,
    PageUp: true,
  };

  const beginGesture = () => {
    if (disabled || gestureActive) return;
    gestureActive = true;
    onStart();
  };

  const endGesture = () => {
    if (!gestureActive) return;
    gestureActive = false;
    onEnd();
  };
</script>

<div
  class:disabled
  class={dial
    ? 'knob dial grid min-h-[66px] min-w-0 grid-cols-[48px_minmax(0,1fr)_44px] content-center gap-[5px_8px] bg-transparent px-[2px] py-0 text-audle-text max-[540px]:grid-cols-[48px_minmax(0,1fr)] max-[400px]:grid-cols-[48px_minmax(0,1fr)_44px]'
    : 'knob grid min-w-0 grid-cols-[1fr_auto] gap-[5px_8px] bg-audle-control p-2.5 text-audle-text shadow-[var(--audle-control-rest)]'}
>
  {#if dial}
    <span class="dial-face" aria-hidden="true">
      <svg class="dial-arc" viewBox="0 0 56 56">
        <circle class="dial-track" cx="28" cy="28" r="22" pathLength="100" />
        <circle
          class="dial-value"
          cx="28"
          cy="28"
          r="22"
          pathLength="100"
          style={`stroke-dasharray: ${progress * 75} 100`}
        />
      </svg>
      <span class="dial-rotor" style={`--needle-angle: ${-135 + progress * 270}deg`}></span>
    </span>
  {/if}
  <span class="label text-xs font-bold tracking-[0.06em] uppercase">{label}</span>
  <output class="font-mono text-xs text-audle-playback-light">{valueText}</output>
  {#if detail}<small class="detail">{detail}</small>{/if}
  <input
    aria-label={label}
    aria-valuemax={max}
    aria-valuemin={min}
    aria-valuenow={value}
    {disabled}
    {max}
    {min}
    {step}
    type="range"
    {value}
    onpointerdown={beginGesture}
    onpointerup={endGesture}
    onpointercancel={endGesture}
    onblur={endGesture}
    onkeydown={(event) => {
      if (adjustmentKeys[event.key]) beginGesture();
    }}
    onkeyup={(event) => {
      if (adjustmentKeys[event.key]) endGesture();
    }}
    oninput={(event) => onChange(Number(event.currentTarget.value))}
    onchange={endGesture}
  />
  {#if dial && onReset && resetValue !== undefined}
    <button
      type="button"
      class="dial-reset min-h-11 min-w-11 cursor-pointer border border-audle-outline-subtle bg-audle-control px-1 text-[0.65rem] font-bold text-audle-text hover:bg-audle-control-hover disabled:cursor-not-allowed disabled:opacity-50"
      aria-label={`Reset ${label}`}
      disabled={disabled || value === resetValue}
      onclick={onReset}>Reset</button
    >
  {/if}
</div>

<style>
  input {
    grid-column: 1 / -1;
    inline-size: 100%;
    accent-color: var(--audle-playback-light);
    cursor: ew-resize;
  }
  .knob:has(input:active) {
    background: var(--audle-control-pressed);
    box-shadow: var(--audle-control-contact);
  }
  .knob.disabled {
    background: var(--audle-disabled);
    color: var(--audle-disabled-ink);
  }
  .knob.disabled output {
    color: var(--audle-disabled-ink);
  }
  .knob.disabled input {
    cursor: not-allowed;
  }

  .knob.dial {
    grid-template-rows: repeat(3, auto);
  }
  .knob.dial:has(input:active),
  .knob.dial.disabled {
    background: transparent;
    box-shadow: none;
  }
  .knob.dial output {
    color: oklch(var(--source, var(--audle-source-1)));
  }
  .dial-face {
    grid-column: 1;
    grid-row: 1 / 4;
    position: relative;
    block-size: 48px;
    inline-size: 48px;
    border-radius: 50%;
    background: var(--audle-well);
  }
  .dial-arc {
    position: absolute;
    inset: 0;
    display: block;
    block-size: 100%;
    inline-size: 100%;
    transform: rotate(135deg);
  }
  .dial-track,
  .dial-value {
    fill: none;
    stroke-width: 4;
  }
  .dial-track {
    stroke: var(--audle-outline-subtle);
    stroke-dasharray: 75 100;
  }
  .dial-value {
    stroke: oklch(var(--source, var(--audle-source-1)));
    stroke-linecap: round;
  }
  .dial-rotor {
    position: absolute;
    inset: 8px;
    border: 1px solid var(--audle-outline);
    border-radius: 50%;
    background: var(--audle-control);
    box-shadow:
      inset 0 2px 0 var(--audle-edge-light),
      inset 0 -3px 0 var(--audle-edge-shadow);
    transform: rotate(var(--needle-angle));
  }
  .dial-rotor::after {
    position: absolute;
    inset-block-start: 3px;
    inset-inline-start: calc(50% - 3px);
    block-size: 10px;
    inline-size: 6px;
    border-radius: 2px;
    background: oklch(var(--source, var(--audle-source-1)));
    content: '';
  }
  .dial:has(input:hover:not(:disabled)) .dial-rotor {
    background: var(--audle-control-hover);
  }
  .dial:has(input:active) .dial-rotor {
    background: var(--audle-control-pressed);
  }
  .dial.disabled .dial-face {
    opacity: 0.55;
  }
  .dial .label,
  .dial output,
  .dial .detail {
    grid-column: 2;
    min-inline-size: 0;
    white-space: nowrap;
  }
  .dial .label {
    grid-row: 1;
  }
  .dial output {
    grid-row: 2;
  }
  .dial .detail {
    grid-row: 3;
    color: var(--audle-text-muted);
    font-size: 0.6rem;
  }
  .dial input {
    grid-column: 1;
    grid-row: 1 / 4;
    z-index: 1;
    block-size: 48px;
    inline-size: 48px;
    justify-self: center;
    margin: 0;
    opacity: 0;
  }
  .dial-reset {
    grid-column: 3;
    grid-row: 1 / 4;
    align-self: center;
  }
  @media (min-width: 401px) and (max-width: 540px) {
    .dial-reset {
      grid-column: 2;
      grid-row: 4;
      justify-self: start;
    }
  }
  .dial:has(input:focus-visible) .dial-face {
    outline: 3px solid var(--audle-focus);
    outline-offset: 3px;
  }
</style>
