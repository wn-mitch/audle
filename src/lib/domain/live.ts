import { sampleById } from '../data/samples';
import {
  SOURCE_LOOP_TICKS,
  TICKS_PER_BAR,
  TICKS_PER_QUARTER,
  type Clip,
  type CompositionV1,
  type Track,
} from './model';
import { validateComposition } from './schema';
import type { OperationResult } from './operations';

export type LivePattern = 'steady' | 'sparse' | 'moving';
export const LIVE_PATTERNS: readonly LivePattern[] = ['steady', 'sparse', 'moving'];

const positionsFor = (track: Track, bars: number, pattern: LivePattern): number[] => {
  const role = sampleById(track.sampleId)?.role;
  const beat = TICKS_PER_QUARTER;
  const positions: number[] = [];
  for (let bar = 0; bar < bars; bar += 1) {
    const base = bar * TICKS_PER_BAR;
    if (pattern === 'sparse') {
      positions.push(base + (role === 'clap' ? beat * 2 : 0));
    } else if (pattern === 'moving') {
      if (role === 'hat') {
        for (let step = 0; step < 8; step += 1) positions.push(base + (step * beat) / 2);
      } else {
        positions.push(base, base + beat * 1.5, base + beat * 2.5);
      }
    } else if (role === 'clap') {
      positions.push(base + beat, base + beat * 3);
    } else if (role === 'fx') {
      positions.push(base + beat * 3);
    } else {
      for (let step = 0; step < 4; step += 1) positions.push(base + step * beat);
    }
  }
  return positions;
};

export const clipsForPattern = (track: Track, bars: number, pattern: LivePattern): Clip[] => {
  const sample = sampleById(track.sampleId);
  if (!sample) return [];
  if (sample.kind === 'one-shot') {
    return positionsFor(track, bars, pattern).map((startTick, index) => ({
      id: `live-${track.id}-${index}`,
      kind: 'hit',
      startTick,
      ratchet: 1,
    }));
  }
  if (pattern === 'steady') {
    return Array.from({ length: bars }, (_, bar) => ({
      id: `live-${track.id}-${bar}`,
      kind: 'loop' as const,
      startTick: bar * TICKS_PER_BAR,
      lengthTicks: TICKS_PER_BAR,
      sourceOffsetTick: (bar % 2) * TICKS_PER_BAR,
    }));
  }
  if (pattern === 'moving') {
    // Slice the two-bar source into half bars that start one step later each time, wrapping so
    // every offset stays inside the source.
    const halfBar = TICKS_PER_BAR / 2;
    const windows = SOURCE_LOOP_TICKS / halfBar;
    return Array.from({ length: bars * 2 }, (_, index) => ({
      id: `live-${track.id}-${index}`,
      kind: 'loop' as const,
      startTick: index * halfBar,
      lengthTicks: halfBar,
      sourceOffsetTick: (halfBar * ((index % windows) + 1)) % SOURCE_LOOP_TICKS,
    }));
  }
  return Array.from({ length: bars }, (_, bar) => bar)
    .filter((bar) => bar % 2 === 0)
    .map((bar, index) => ({
      id: `live-${track.id}-${index}`,
      kind: 'loop' as const,
      startTick: bar * TICKS_PER_BAR,
      lengthTicks: TICKS_PER_BAR,
      sourceOffsetTick: 0,
    }));
};

export const patternOf = (
  composition: CompositionV1,
  track: Track,
): LivePattern | 'custom' | 'empty' => {
  if (track.clips.length === 0) return 'empty';
  for (const pattern of LIVE_PATTERNS) {
    const expected = clipsForPattern(track, composition.bars, pattern);
    if (track.clips.length !== expected.length) continue;
    const matches = track.clips.every((clip, index) => {
      const reference = expected[index]!;
      if (clip.kind !== reference.kind || clip.startTick !== reference.startTick) return false;
      return clip.kind === 'loop' && reference.kind === 'loop'
        ? clip.lengthTicks === reference.lengthTicks &&
            clip.sourceOffsetTick === reference.sourceOffsetTick
        : clip.kind === 'hit' && reference.kind === 'hit' && clip.ratchet === reference.ratchet;
    });
    if (matches) return pattern;
  }
  return 'custom';
};

export const setLivePattern = (
  composition: CompositionV1,
  trackId: string,
  pattern: LivePattern,
): OperationResult => {
  const track = composition.tracks.find((candidate) => candidate.id === trackId);
  if (!track) return { ok: false, reason: 'That sound is not in today’s kit.' };
  const clips = clipsForPattern(track, composition.bars, pattern);
  const next = {
    ...composition,
    tracks: composition.tracks.map((candidate) =>
      candidate.id === trackId
        ? { ...candidate, clips, controls: { ...candidate.controls, muted: false } }
        : candidate,
    ),
  };
  const validated = validateComposition(next);
  return validated
    ? { ok: true, value: validated }
    : { ok: false, reason: 'This pattern exceeds the loop’s limits.' };
};
