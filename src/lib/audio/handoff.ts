import * as Tone from 'tone';

export const HANDOFF_SECONDS = 0.01;
const STEPS = 16;
const FADE_IN = Array.from({ length: STEPS + 1 }, (_, step) =>
  Math.sin((step / STEPS) * (Math.PI / 2)),
);
const FADE_OUT = Array.from({ length: STEPS + 1 }, (_, step) =>
  Math.cos((step / STEPS) * (Math.PI / 2)),
);

/** Let overlapping grains finish underneath a short, equal-power clip handoff. */
export const handoffLoop = (envelope: Tone.Gain, start: number, duration: number): void => {
  envelope.gain.setValueCurveAtTime(FADE_IN, start, HANDOFF_SECONDS);
  envelope.gain.setValueCurveAtTime(FADE_OUT, start + duration, HANDOFF_SECONDS);
};

/** Move the effective track gain at a switch without stepping a sustained waveform. */
export const handoffTrack = (gain: Tone.Gain, value: number, time: number): void => {
  const previous = gain.gain.getValueAtTime(time);
  if (previous === value) return;
  gain.gain.setValueAtTime(previous, time);
  gain.gain.linearRampToValueAtTime(value, time + HANDOFF_SECONDS);
};
