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
  } = $props();
</script>

<label class="knob">
  <span>{label}</span>
  <output>{valueText}</output>
  <input
    aria-label={label}
    aria-valuemax={max}
    aria-valuemin={min}
    aria-valuenow={value}
    max={max}
    min={min}
    step={step}
    type="range"
    value={value}
    onpointerdown={onStart}
    onpointerup={onEnd}
    onkeydown={onStart}
    onkeyup={onEnd}
    oninput={(event) => onChange(Number(event.currentTarget.value))}
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

  .knob > span { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
  output { color: var(--audle-playback-light); font-family: ui-monospace, monospace; font-size: 0.75rem; }
  input { grid-column: 1 / -1; inline-size: 100%; accent-color: var(--audle-playback-light); cursor: ew-resize; }
  .knob:has(input:active) { background: var(--audle-control-pressed); box-shadow: var(--audle-control-contact); }
</style>
