import { describe, expect, it } from 'vitest';
import { sampleById } from '../data/samples';
import { ROLES, challengeForDate } from './challenge';
import {
  LIVE_PATTERNS,
  clipsForPattern,
  offsetLivePattern,
  patternOf,
  setLivePattern,
} from './live';
import {
  DEFAULT_TRACK_CONTROLS,
  DEFAULT_SOURCE_TICKS,
  MAX_CLIPS,
  TICKS_PER_BAR,
  sourceTicks,
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

  it('keeps every loop feel inside its declared source length', () => {
    for (const [index, role] of ROLES.entries()) {
      if (kindAt(index) !== 'loop') continue;
      const track = kitTrack(index);
      const span = sourceTicks(sampleById(track.sampleId));
      for (const feel of LIVE_PATTERNS) {
        for (const clip of clipsForPattern(track, 4, feel)) {
          if (clip.kind !== 'loop') throw new Error(`${feel} gave the ${role} role hits`);
          expect(
            clip.sourceOffsetTick + clip.lengthTicks,
            `${role} on ${feel} reads past the source`,
          ).toBeLessThanOrEqual(span);
        }
      }
    }
  });

  it('reorders and retriggers dense Ukulele Texture slices instead of walking steady source', () => {
    for (const sampleId of ['texture-04', 'chord-05'] as const) {
      const sample = sampleById(sampleId)!;
      const track: Track = {
        id: sample.id,
        sampleId: sample.id,
        label: sample.label,
        controls: { ...DEFAULT_TRACK_CONTROLS },
        clips: [],
      };
      const sourceSpan = sourceTicks(sample);

      for (const bars of [1, 2, 4] as const) {
        const denseLoops = clipsForPattern(track, bars, 'dense').filter(
          (clip) => clip.kind === 'loop',
        );
        const steadyWindows = clipsForPattern(track, bars, 'steady')
          .filter((clip) => clip.kind === 'loop')
          .flatMap((clip) =>
            Array.from(
              { length: clip.lengthTicks / (TICKS_PER_BAR / 4) },
              (_, quarter) => clip.sourceOffsetTick + quarter * (TICKS_PER_BAR / 4),
            ),
          );

        expect(denseLoops).toHaveLength(bars * 4);
        expect(denseLoops.map((clip) => clip.startTick)).toEqual(
          Array.from({ length: bars * 4 }, (_, quarter) => quarter * (TICKS_PER_BAR / 4)),
        );
        expect(denseLoops.map((clip) => clip.lengthTicks)).toEqual(
          Array.from({ length: bars * 4 }, () => TICKS_PER_BAR / 4),
        );
        expect(denseLoops.map((clip) => clip.sourceOffsetTick)).not.toEqual(steadyWindows);
        expect(
          denseLoops.every((clip) => clip.sourceOffsetTick + clip.lengthTicks <= sourceSpan),
        ).toBe(true);
        expect(denseLoops.slice(0, 4).map((clip) => clip.sourceOffsetTick)).toEqual([
          0,
          TICKS_PER_BAR / 2,
          TICKS_PER_BAR / 4,
          TICKS_PER_BAR / 2,
        ]);
      }
    }
  });

  it('keeps a four-bar full kit dense pattern within the clip limit', () => {
    let composition = emptyComposition(4);
    for (const track of composition.tracks) {
      const result = setLivePattern(composition, track.id, 'dense');
      expect(result.ok).toBe(true);
      if (result.ok) composition = result.value;
    }

    expect(
      composition.tracks.reduce((count, track) => count + track.clips.length, 0),
    ).toBeLessThanOrEqual(MAX_CLIPS);
  });
});

describe('offsetLivePattern', () => {
  const firstOfKind = (kind: SampleKind) =>
    challenge.sampleIds.findIndex((_, index) => kindAt(index) === kind);
  const withPattern = (index: number, pattern: (typeof LIVE_PATTERNS)[number]) => {
    const result = setLivePattern(emptyComposition(2), `track-${index}`, pattern);
    if (!result.ok) throw new Error(result.reason);
    return result.value;
  };
  const apply = (composition: CompositionV1, trackId: string, direction: -1 | 1) => {
    const result = offsetLivePattern(composition, trackId, direction);
    if (!result.ok) throw new Error(result.reason);
    return result.value;
  };

  it('rotates hits one sixteenth and wraps them around the loop', () => {
    const index = firstOfKind('one-shot');
    const id = `track-${index}`;
    const before = withPattern(index, 'steady');
    const later = apply(before, id, 1);
    const track = later.tracks[index]!;
    expect(track.clips.map((clip) => clip.startTick)).toEqual(
      before.tracks[index]!.clips.map((clip) => clip.startTick + 24),
    );
    const earlier = apply(before, id, -1);
    const starts = earlier.tracks[index]!.clips.map((clip) => clip.startTick);
    expect(starts[0]).toBeGreaterThanOrEqual(0);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(starts).toContain(2 * TICKS_PER_BAR - 24);
  });

  it('comes back to the same feel after a full loop of offsets', () => {
    const index = firstOfKind('one-shot');
    const id = `track-${index}`;
    let composition = withPattern(index, 'moving');
    for (let step = 0; step < 32; step += 1) composition = apply(composition, id, 1);
    expect(patternOf(composition, composition.tracks[index]!)).toBe('moving');
  });

  it('recognises a rotated pattern that lands on another feel', () => {
    const index = challenge.sampleIds.findIndex((sampleId) => sampleById(sampleId)!.role === 'hat');
    const id = `track-${index}`;
    let composition = withPattern(index, 'steady');
    composition = apply(apply(composition, id, 1), id, 1);
    expect(patternOf(composition, composition.tracks[index]!)).toBe('offbeat');
  });

  it('rotates where a loop reads from instead of moving its slices', () => {
    const index = firstOfKind('loop');
    const id = `track-${index}`;
    const before = withPattern(index, 'steady');
    const after = apply(before, id, -1);
    const span = DEFAULT_SOURCE_TICKS;
    after.tracks[index]!.clips.forEach((clip, position) => {
      const reference = before.tracks[index]!.clips[position]!;
      expect(clip.startTick).toBe(reference.startTick);
      if (clip.kind === 'loop' && reference.kind === 'loop')
        expect(clip.sourceOffsetTick).toBe((reference.sourceOffsetTick - 24 + span) % span);
    });
  });

  it('refuses an empty sound', () => {
    const result = offsetLivePattern(emptyComposition(2), 'track-0', 1);
    expect(result.ok).toBe(false);
  });
});
