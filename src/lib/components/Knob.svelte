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
      <span class="dial-needle" style={`--needle-angle: ${-135 + progress * 270}deg`}></span>
    </span>
  {/if}
  <span class="label">{label}</span>
  <output>{valueText}</output>
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
    onpointerup={() => setTimeout(endGesture, 0)}
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
    grid-template-rows: 56px auto;
    gap: 4px 8px;
    justify-items: stretch;
    min-block-size: 112px;
    padding: 0 5px;
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
    grid-column: 1 / -1;
    grid-row: 1;
    position: relative;
    place-self: center;
    block-size: 56px;
    inline-size: 56px;
  }
  .dial-arc {
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
  .dial-needle {
    position: absolute;
    inset: 8px 27px;
    background: oklch(var(--source, var(--audle-source-1)));
    border-radius: 999px;
    transform: rotate(var(--needle-angle));
    transform-origin: center 20px;
  }
  .dial .label,
  .dial output {
    grid-row: 2;
  }
  .dial input {
    grid-column: 1 / -1;
    grid-row: 1;
    z-index: 1;
    block-size: 56px;
    inline-size: 56px;
    justify-self: center;
    margin: 0;
    opacity: 0;
  }
  .dial:has(input:focus-visible) .dial-face {
    outline: 3px solid var(--audle-focus);
    outline-offset: 3px;
  }
</style>
