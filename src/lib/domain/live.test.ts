import { describe, expect, it } from 'vitest';
import { sampleById } from '../data/samples';
import { ROLES, challengeForDate } from './challenge';
import { LIVE_PATTERNS, clipsForPattern, patternOf, setLivePattern } from './live';
import {
  DEFAULT_TRACK_CONTROLS,
  DEFAULT_SOURCE_TICKS,
  TICKS_PER_BAR,
  type Clip,
  type CompositionV1,
  type SampleKind,
  type Track,
} from './model';

const LENGTHS = [1, 2, 3, 4] as const;
const challenge = challengeForDate('2026-09-25');

/** The day's kit in its required order, so every fixture passes composition validation. */
const kitTrack = (index: number): Track => {
  const sample = sampleById(challenge.sampleIds[index]!)!;
  return {
    id: `track-${index}`,
    sampleId: sample.id,
    label: sample.label,
    controls: { ...DEFAULT_TRACK_CONTROLS },
    clips: [],
  };
};

const kindAt = (index: number): SampleKind => sampleById(challenge.sampleIds[index]!)!.kind;

/** The day's kit with every track empty, ready for one pattern to be applied. */
const emptyComposition = (bars: CompositionV1['bars']): CompositionV1 => ({
  version: 1,
  challenge,
  bars,
  tracks: challenge.sampleIds.map((_, index) => kitTrack(index)),
});

/** Compares only what the loop plays, not the generated clip ids. */
const shapeOf = (clips: Clip[]): string =>
  JSON.stringify(
    clips.map((clip) =>
      clip.kind === 'loop'
        ? ['loop', clip.startTick, clip.lengthTicks, clip.sourceOffsetTick]
        : ['hit', clip.startTick, clip.ratchet],
    ),
  );

describe('live patterns', () => {
  it('draws every feel differently for every role and loop length', () => {
    for (const [index, role] of ROLES.entries()) {
      const track = kitTrack(index);
      for (const bars of LENGTHS) {
        const claimed = new Map<string, string>();
        for (const feel of LIVE_PATTERNS) {
          const shape = shapeOf(clipsForPattern(track, bars, feel));
          const clash = claimed.get(shape);
          expect(
            clash,
            `${role} over ${bars} bars: ${feel} is identical to ${clash}`,
          ).toBeUndefined();
          claimed.set(shape, feel);
        }
      }
    }
  });

  it('fills every feel without leaving the loop, and reports the feel back', () => {
    for (const [index, role] of ROLES.entries()) {
      const track = kitTrack(index);
      for (const bars of LENGTHS) {
        const end = bars * TICKS_PER_BAR;
        for (const feel of LIVE_PATTERNS) {
          const label = `${role} over ${bars} bars: ${feel}`;
          const result = setLivePattern(emptyComposition(bars), track.id, feel);
          expect(result.ok, `${label} was rejected`).toBe(true);
          if (!result.ok) continue;

          const filled = result.value.tracks[index]!;
          expect(filled.clips.length, `${label} filled nothing`).toBeGreaterThan(0);
          for (const clip of filled.clips) {
            const clipEnd = clip.startTick + (clip.kind === 'loop' ? clip.lengthTicks : 0);
            expect(clipEnd, `${label} runs past the loop`).toBeLessThanOrEqual(end);
          }
          // The strip lights the feel you tapped, so the name must survive the round trip.
          expect(patternOf(result.value, filled), label).toBe(feel);
        }
      }
    }
  });

  it('keeps every loop feel reading from inside the two-bar source', () => {
    for (const [index, role] of ROLES.entries()) {
      if (kindAt(index) !== 'loop') continue;
      const track = kitTrack(index);
      for (const feel of LIVE_PATTERNS) {
        for (const clip of clipsForPattern(track, 4, feel)) {
          if (clip.kind !== 'loop') throw new Error(`${feel} gave the ${role} role hits`);
          expect(
            clip.sourceOffsetTick + clip.lengthTicks,
            `${role} on ${feel} reads past the source`,
          ).toBeLessThanOrEqual(DEFAULT_SOURCE_TICKS);
        }
      }
    }
  });
});
