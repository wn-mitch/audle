import {
  DEFAULT_SOURCE_TICKS,
  TICKS_PER_BAR,
  TICKS_PER_SIXTEENTH,
  type CompositionV1,
  type SampleRole,
} from '../domain/model';
import type { ClipPlacement } from '../domain/operations';

/**
 * The vetted pattern catalog Jev chooses from, one list per sample role.
 *
 * Jev sees only pattern names and descriptions. Descriptions state what a pattern sounds like,
 * never when to use it, so the choice reflects Jev's reading of the loop and the vibe.
 */

type Bars = CompositionV1['bars'];
type Ratchet = 1 | 2 | 3 | 4;

/** A per-bar one-shot pattern. Steps are sixteenths within a bar (0-15). */
export interface HitPattern {
  description: string;
  steps: readonly number[];
  /** Replaces `steps` in the final bar, giving multi-bar loops a turnaround. */
  lastBarSteps?: readonly number[];
  /** Restricts the pattern to the first or last bar of the loop. */
  onlyBar?: 'first' | 'last';
  ratchets?: Readonly<Record<number, Ratchet>>;
}

/** A loop pattern: which bars (0-indexed) the role's source loop plays in. */
export interface LoopPattern {
  description: string;
  activeBars: (bars: Bars) => number[];
}

export type RolePatterns =
  | { kind: 'hit'; patterns: Readonly<Record<string, HitPattern>> }
  | { kind: 'loop'; patterns: Readonly<Record<string, LoopPattern>> };

const range = (from: number, to: number): number[] =>
  Array.from({ length: Math.max(0, to - from) }, (_, index) => from + index);

const half = (bars: Bars) => Math.ceil(bars / 2);

const LOOP_PATTERNS: Readonly<Record<string, LoopPattern>> = {
  rest: { description: 'Silent: this sound stays out of the loop', activeBars: () => [] },
  full: {
    description: 'Plays through every bar of the loop',
    activeBars: (bars) => range(0, bars),
  },
  late: {
    description: 'Silent at first, then comes in halfway through: builds up',
    activeBars: (bars) => (bars > 1 ? range(half(bars), bars) : []),
  },
  early: {
    description: 'Plays the first half, then drops out: leaves space',
    activeBars: (bars) => (bars > 1 ? range(0, half(bars)) : []),
  },
  alternate: {
    description: 'Plays every other bar: call and space',
    activeBars: (bars) => (bars > 2 ? range(0, bars).filter((bar) => bar % 2 === 0) : []),
  },
  gap: {
    description:
      'Plays throughout but drops out in the final bar, a breath before the loop restarts',
    activeBars: (bars) => (bars > 1 ? range(0, bars - 1) : []),
  },
  turnaround: {
    description: 'Only in the final bar: a short turnaround',
    activeBars: (bars) => (bars > 1 ? [bars - 1] : []),
  },
};

const EIGHTHS = range(0, 16).filter((step) => step % 2 === 0);

export const ROLE_PATTERNS: Readonly<Record<SampleRole, RolePatterns>> = {
  beat: { kind: 'loop', patterns: LOOP_PATTERNS },
  bass: { kind: 'loop', patterns: LOOP_PATTERNS },
  chord: { kind: 'loop', patterns: LOOP_PATTERNS },
  texture: { kind: 'loop', patterns: LOOP_PATTERNS },
  kick: {
    kind: 'hit',
    patterns: {
      rest: { description: 'No kick at all', steps: [] },
      four: {
        description: 'A kick on every beat: four on the floor, steady dance drive',
        steps: [0, 4, 8, 12],
      },
      anchor: {
        description: 'Kicks on beats one and three: a simple, sturdy anchor',
        steps: [0, 8],
      },
      halftime: {
        description: 'Kick on beat one and just before beat three: heavy and slow-feeling',
        steps: [0, 10],
      },
      bounce: {
        description: 'Syncopated kicks that skip around the beat: bouncy',
        steps: [0, 3, 6, 10],
      },
      drive: {
        description: 'A kick on every eighth note: relentless and pounding',
        steps: EIGHTHS,
      },
    },
  },
  clap: {
    kind: 'hit',
    patterns: {
      rest: { description: 'No claps', steps: [] },
      backbeat: {
        description: 'Claps on beats two and four: the classic backbeat',
        steps: [4, 12],
      },
      halftime: {
        description: 'One clap on beat three of each bar: laid back and spacious',
        steps: [8],
      },
      offbeat: {
        description: 'Claps on every off-beat: skippy and restless',
        steps: [2, 6, 10, 14],
      },
      riser: {
        description: 'Backbeat claps, then a fast roll that rises into the loop restart',
        steps: [4, 12],
        lastBarSteps: [4, 8, 10, 12, 13, 14, 15],
      },
    },
  },
  hat: {
    kind: 'hit',
    patterns: {
      rest: { description: 'No hats', steps: [] },
      sparse: { description: 'A hat on beats one and three: minimal', steps: [0, 8] },
      eighths: { description: 'Hats on every eighth note: steady motion', steps: EIGHTHS },
      sixteenths: {
        description: 'Hats on every sixteenth note: busy and energetic',
        steps: range(0, 16),
      },
      offbeat: {
        description: 'Hats only on the off-beats: a bouncing house feel',
        steps: [2, 6, 10, 14],
      },
      skitter: {
        description: 'Eighth-note hats with fast stuttering rolls: trap-style skitter',
        steps: EIGHTHS,
        ratchets: { 6: 3, 14: 2 },
      },
    },
  },
  fx: {
    kind: 'hit',
    patterns: {
      rest: { description: 'No effect hits', steps: [] },
      top: {
        description: 'One hit at the very start of the loop: marks the top',
        steps: [0],
        onlyBar: 'first',
      },
      signal: {
        description: 'One hit near the end of the loop: a signal that it is about to restart',
        steps: [12],
        onlyBar: 'last',
      },
      punctuate: {
        description: 'A hit at the start of every bar: regular punctuation',
        steps: [0],
      },
      glitch: {
        description: 'Scattered off-grid accents with a stutter: glitchy',
        steps: [3, 11],
        ratchets: { 11: 2 },
      },
    },
  },
};

const BAR_OFFSET_TICKS = TICKS_PER_BAR % DEFAULT_SOURCE_TICKS;

/**
 * Converts active bars into loop clips that stay in phase with the two-bar source loop: bar `b`
 * always plays source bar `b % 2`, and no clip runs past a source-loop boundary.
 */
const loopClipsForBars = (activeBars: readonly number[]): ClipPlacement[] => {
  const clips: ClipPlacement[] = [];
  const sorted = [...new Set(activeBars)].sort((a, b) => a - b);
  for (const bar of sorted) {
    const startTick = bar * TICKS_PER_BAR;
    const sourceOffsetTick = (bar * BAR_OFFSET_TICKS) % DEFAULT_SOURCE_TICKS;
    const previous = clips.at(-1);
    const contiguous =
      previous?.kind === 'loop' &&
      previous.startTick + previous.lengthTicks === startTick &&
      sourceOffsetTick !== 0;
    if (contiguous) previous.lengthTicks += TICKS_PER_BAR;
    else clips.push({ kind: 'loop', startTick, lengthTicks: TICKS_PER_BAR, sourceOffsetTick });
  }
  return clips;
};

const hitClips = (pattern: HitPattern, bars: Bars): ClipPlacement[] =>
  range(0, bars).flatMap((bar) => {
    if (pattern.onlyBar === 'first' && bar !== 0) return [];
    if (pattern.onlyBar === 'last' && bar !== bars - 1) return [];
    const steps = bar === bars - 1 && pattern.lastBarSteps ? pattern.lastBarSteps : pattern.steps;
    return steps.map((step) => ({
      kind: 'hit' as const,
      startTick: bar * TICKS_PER_BAR + step * TICKS_PER_SIXTEENTH,
      ratchet: pattern.ratchets?.[step] ?? 1,
    }));
  });

/** Expands a named pattern into clip placements for a loop of `bars` bars. Unknown names expand to nothing. */
export const expandPattern = (role: SampleRole, name: string, bars: Bars): ClipPlacement[] => {
  const entry = ROLE_PATTERNS[role];
  if (!Object.hasOwn(entry.patterns, name)) return [];
  return entry.kind === 'loop'
    ? loopClipsForBars(entry.patterns[name]!.activeBars(bars))
    : hitClips(entry.patterns[name]!, bars);
};

/**
 * The patterns offered for a role at a loop length: `rest` plus every pattern whose expansion is
 * non-empty and differs from an earlier one, so Jev never weighs two names for the same result.
 */
export const optionsFor = (role: SampleRole, bars: Bars): Record<string, string> => {
  const seen = new Set<string>();
  const options: Record<string, string> = {};
  for (const [name, pattern] of Object.entries(ROLE_PATTERNS[role].patterns)) {
    const clips = expandPattern(role, name, bars);
    const signature = JSON.stringify(clips);
    if (name !== 'rest' && (clips.length === 0 || seen.has(signature))) continue;
    seen.add(signature);
    options[name] = pattern.description;
  }
  return options;
};
