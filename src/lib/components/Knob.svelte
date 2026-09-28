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

<label class:disabled class:dial class="knob">
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
  <span class="label">{label}</span>
  <output>{valueText}</output>
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
</label>

<style>
  .knob {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 5px 8px;
    min-inline-size: 0;
    padding: 10px;
    background: var(--audle-control);
    box-shadow: var(--audle-control-rest);
    color: var(--audle-text);
  }

  .label {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  output {
    color: var(--audle-playback-light);
    font-family: ui-monospace, monospace;
    font-size: 0.75rem;
  }
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
    grid-template-columns: 48px minmax(0, 1fr);
    grid-template-rows: repeat(3, auto);
    align-content: center;
    column-gap: 8px;
    min-block-size: 66px;
    padding: 0 2px;
    background: transparent;
    box-shadow: none;
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
  .dial:has(input:focus-visible) .dial-face {
    outline: 3px solid var(--audle-focus);
    outline-offset: 3px;
  }
</style>
