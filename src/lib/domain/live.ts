import { sampleById } from '../data/samples';
import {
  sourceTicks,
  TICKS_PER_BAR,
  TICKS_PER_QUARTER,
  type Clip,
  type CompositionV1,
  type SampleRole,
  type Track,
} from './model';
import { validateComposition } from './schema';
import type { OperationResult } from './operations';

export type LivePattern = 'steady' | 'sparse' | 'moving' | 'offbeat' | 'dense' | 'halftime';

/** The Play feel controls show these in order, and `patternOf` matches in the same order. */
export const LIVE_PATTERNS: readonly LivePattern[] = [
  'steady',
  'sparse',
  'moving',
  'offbeat',
  'dense',
  'halftime',
];

type OneShotRole = Extract<SampleRole, 'kick' | 'clap' | 'hat' | 'fx'>;

const isOneShotRole = (role: SampleRole | undefined): role is OneShotRole =>
  role === 'kick' || role === 'clap' || role === 'hat' || role === 'fx';

const BEAT = TICKS_PER_QUARTER;
const EIGHTH = BEAT / 2;
const SIXTEENTH = BEAT / 4;
const HALF_BAR = TICKS_PER_BAR / 2;
const QUARTER_BAR = TICKS_PER_BAR / 4;

const eighths = (): number[] => Array.from({ length: 8 }, (_, step) => step * EIGHTH);
const sixteenths = (): number[] => Array.from({ length: 16 }, (_, step) => step * SIXTEENTH);

/**
 * Where a one-shot plays inside one bar, in ticks, per feel. No two feels may hold the same list
 * for a role: `patternOf` reports the first feel whose clips match, so a duplicate would make one
 * of them unselectable.
 */
const HITS_PER_BAR: Record<OneShotRole, Record<LivePattern, readonly number[]>> = {
  kick: {
    steady: [0, BEAT, BEAT * 2, BEAT * 3],
    sparse: [0],
    moving: [0, BEAT * 1.5, BEAT * 2.5],
    offbeat: [EIGHTH, BEAT * 2.5],
    dense: eighths(),
    halftime: [0, BEAT * 2],
  },
  clap: {
    steady: [BEAT, BEAT * 3],
    sparse: [0],
    moving: [0, BEAT * 1.5, BEAT * 2.5],
    offbeat: [BEAT * 1.5, BEAT * 3.5],
    dense: eighths(),
    halftime: [0, BEAT * 2],
  },
  hat: {
    steady: [0, BEAT, BEAT * 2, BEAT * 3],
    sparse: [0],
    moving: eighths(),
    offbeat: [EIGHTH, EIGHTH + BEAT, EIGHTH + BEAT * 2, EIGHTH + BEAT * 3],
    dense: sixteenths(),
    halftime: [0, BEAT * 2],
  },
  fx: {
    steady: [BEAT * 3],
    sparse: [0],
    moving: [0, BEAT * 1.5, BEAT * 2.5],
    offbeat: [BEAT * 3.5],
    dense: eighths(),
    halftime: [0, BEAT * 2],
  },
};

const positionsFor = (track: Track, bars: number, pattern: LivePattern): number[] => {
  const role = sampleById(track.sampleId)?.role;
  const offsets = (isOneShotRole(role) ? HITS_PER_BAR[role] : HITS_PER_BAR.kick)[pattern];
  const positions: number[] = [];
  for (let bar = 0; bar < bars; bar += 1) {
    for (const offset of offsets) positions.push(bar * TICKS_PER_BAR + offset);
  }
  return positions;
};

/** One piece of a loop source placed inside a bar. */
interface LoopSlice {
  offsetInBar: number;
  lengthTicks: number;
  sourceOffsetTick: number;
}

const slice = (offsetInBar: number, lengthTicks: number, sourceOffsetTick: number): LoopSlice => ({
  offsetInBar,
  lengthTicks,
  sourceOffsetTick,
});

/**
 * Tile each feel from source windows, bar by bar. `span` bounds source reads, so longer sources
 * expose later windows instead of wrapping after two bars. Returning nothing leaves a rest.
 * Distinct source paths matter: dividing a continuous pass into clips is not a different feel.
 */
const LOOP_SLICES: Record<LivePattern, (bar: number, span: number) => readonly LoopSlice[]> = {
  steady: (bar, span) => [slice(0, TICKS_PER_BAR, (bar * TICKS_PER_BAR) % span)],
  sparse: (bar) => (bar % 2 ? [] : [slice(0, HALF_BAR, 0)]),
  moving: (bar, span) =>
    [0, 1].map((half) =>
      // Walk one window further through the source every half bar, wrapping inside it.
      slice(
        half * HALF_BAR,
        HALF_BAR,
        (HALF_BAR * (((bar * 2 + half) % (span / HALF_BAR)) + 1)) % span,
      ),
    ),
  // Hold one pushed window, so the phrase always starts an eighth late and its accents miss the beat.
  offbeat: () => [slice(0, HALF_BAR, HALF_BAR), slice(HALF_BAR, HALF_BAR, HALF_BAR)],
  dense: (bar, span) => {
    const sourceQuarters = span / QUARTER_BAR;
    return [0, 2, 1, 2].map((sourceQuarter, quarter) =>
      slice(
        quarter * QUARTER_BAR,
        QUARTER_BAR,
        QUARTER_BAR * ((bar * 4 + sourceQuarter) % sourceQuarters),
      ),
    );
  },
  // The source's closing bar, held for a whole bar.
  halftime: (bar, span) => (bar % 2 ? [] : [slice(0, TICKS_PER_BAR, span - TICKS_PER_BAR)]),
};

const loopClips = (track: Track, bars: number, pattern: LivePattern): Clip[] => {
  const sample = sampleById(track.sampleId);
  const span = sourceTicks(sample);
  const clips: Clip[] = [];
  for (let bar = 0; bar < bars; bar += 1) {
    for (const piece of LOOP_SLICES[pattern](bar, span)) {
      clips.push({
        id: `live-${track.id}-${clips.length}`,
        kind: 'loop',
        startTick: bar * TICKS_PER_BAR + piece.offsetInBar,
        lengthTicks: piece.lengthTicks,
        sourceOffsetTick: piece.sourceOffsetTick,
      });
    }
  }
  return clips;
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
  return loopClips(track, bars, pattern);
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

/**
 * Shifts a sound's pattern one sixteenth later (`1`) or earlier (`-1`), wrapping inside the loop.
 * Hits rotate around the loop; a loop source instead rotates where it reads from, so its slices
 * stay in place while the audio inside them shifts. Clips come back sorted by start so a rotated
 * pattern that lands on a known feel is recognised by `patternOf`.
 */
export const offsetLivePattern = (
  composition: CompositionV1,
  trackId: string,
  direction: -1 | 1,
): OperationResult => {
  const track = composition.tracks.find((candidate) => candidate.id === trackId);
  if (!track) return { ok: false, reason: 'That sound is not in today’s kit.' };
  if (track.clips.length === 0) return { ok: false, reason: 'Add a pattern before offsetting it.' };
  const totalTicks = composition.bars * TICKS_PER_BAR;
  const span = sourceTicks(sampleById(track.sampleId));
  const wrap = (tick: number, modulus: number) => ((tick % modulus) + modulus) % modulus;
  const clips = track.clips
    .map((clip): Clip =>
      clip.kind === 'hit'
        ? { ...clip, startTick: wrap(clip.startTick + direction * SIXTEENTH, totalTicks) }
        : { ...clip, sourceOffsetTick: wrap(clip.sourceOffsetTick + direction * SIXTEENTH, span) },
    )
    .sort((a, b) => a.startTick - b.startTick);
  const validated = validateComposition({
    ...composition,
    tracks: composition.tracks.map((candidate) =>
      candidate.id === trackId ? { ...candidate, clips } : candidate,
    ),
  });
  return validated
    ? { ok: true, value: validated }
    : { ok: false, reason: 'That offset would leave the loop’s limits.' };
};
