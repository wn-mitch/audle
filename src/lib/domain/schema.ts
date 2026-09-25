import { z } from 'zod';
import { sampleById } from '../data/samples';
import { challengeForDate } from './challenge';
import {
  BASE_TRACKS,
  MAX_CLIPS,
  MAX_SOURCE_TICKS,
  MAX_TRACKS,
  PITCH_CLASSES,
  TICKS_PER_BAR,
  TICKS_PER_SIXTEENTH,
  type CompositionV1,
} from './model';

const isGridTick = (value: number): boolean => value % TICKS_PER_SIXTEENTH === 0;
const hasCodePointLength = (value: string): boolean => {
  const length = Array.from(value).length;
  return length >= 1 && length <= 24;
};
const hasStep = (value: number, step: number): boolean =>
  Math.abs(value / step - Math.round(value / step)) < Number.EPSILON * 16;

const pitchClassSchema = z.enum(PITCH_CLASSES);
const sampleIdsSchema = z.tuple([
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
]);

export const ChallengeSnapshotSchema = z
  .object({
    version: z.literal(1),
    date: z.string(),
    seed: z.number().int().min(0).max(0xffff_ffff),
    bpm: z.number().int().positive(),
    key: z.object({ root: pitchClassSchema, mode: z.enum(['major', 'minor']) }).strict(),
    sampleIds: sampleIdsSchema,
  })
  .strict()
  .superRefine((snapshot, context) => {
    try {
      const expected = challengeForDate(snapshot.date);
      if (JSON.stringify(snapshot) !== JSON.stringify(expected)) {
        context.addIssue({
          code: 'custom',
          message: 'Challenge snapshot does not match its UTC date.',
        });
      }
    } catch {
      context.addIssue({ code: 'custom', message: 'Challenge date is invalid.' });
    }
  });

const controlsSchema = z
  .object({
    gainDb: z
      .number()
      .min(-24)
      .max(6)
      .refine((value) => hasStep(value, 0.5)),
    pan: z
      .number()
      .min(-1)
      .max(1)
      .refine((value) => hasStep(value, 0.05)),
    tuneSemitones: z.number().int().min(-12).max(12),
    cutoffHz: z.number().min(200).max(18000),
    muted: z.boolean(),
    solo: z.boolean(),
  })
  .strict();

const loopClipSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal('loop'),
    startTick: z.number().int().nonnegative().refine(isGridTick),
    lengthTicks: z.number().int().positive().refine(isGridTick),
    sourceOffsetTick: z
      .number()
      .int()
      .min(0)
      .max(MAX_SOURCE_TICKS - TICKS_PER_SIXTEENTH)
      .refine(isGridTick),
  })
  .strict();

const hitClipSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal('hit'),
    startTick: z.number().int().nonnegative().refine(isGridTick),
    ratchet: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  })
  .strict();

const trackSchema = z
  .object({
    id: z.string().min(1),
    sampleId: z.string().refine((id) => sampleById(id) !== undefined, 'Unknown sample ID.'),
    label: z.string().refine(hasCodePointLength, 'Labels must contain 1–24 code points.'),
    controls: controlsSchema,
    clips: z.array(z.discriminatedUnion('kind', [loopClipSchema, hitClipSchema])),
  })
  .strict();

export const CompositionSchema = z
  .object({
    version: z.literal(1),
    challenge: ChallengeSnapshotSchema,
    bars: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    tracks: z.array(trackSchema).min(BASE_TRACKS).max(MAX_TRACKS),
  })
  .strict()
  .superRefine((composition, context) => {
    const totalTicks = composition.bars * TICKS_PER_BAR;
    const trackIds = new Set<string>();
    let clipCount = 0;

    composition.tracks.forEach((track, trackIndex) => {
      if (trackIds.has(track.id)) {
        context.addIssue({
          code: 'custom',
          path: ['tracks', trackIndex, 'id'],
          message: 'Track IDs must be unique.',
        });
      }
      trackIds.add(track.id);
      clipCount += track.clips.length;

      const allowedSample = composition.challenge.sampleIds.includes(track.sampleId);
      if (!allowedSample) {
        context.addIssue({
          code: 'custom',
          path: ['tracks', trackIndex, 'sampleId'],
          message: 'Track sample is not in this challenge.',
        });
      }
      if (
        trackIndex < BASE_TRACKS &&
        track.sampleId !== composition.challenge.sampleIds[trackIndex]
      ) {
        context.addIssue({
          code: 'custom',
          path: ['tracks', trackIndex, 'sampleId'],
          message: 'Base tracks must match challenge order.',
        });
      }

      const sample = sampleById(track.sampleId);
      const loopRanges: Array<[number, number]> = [];
      const hitTicks = new Set<number>();
      track.clips.forEach((clip, clipIndex) => {
        if (clip.kind === 'loop') {
          if (sample?.kind !== 'loop') {
            context.addIssue({
              code: 'custom',
              path: ['tracks', trackIndex, 'clips', clipIndex],
              message: 'Only loop sources may have loop clips.',
            });
          }
          if (clip.startTick + clip.lengthTicks > totalTicks) {
            context.addIssue({
              code: 'custom',
              path: ['tracks', trackIndex, 'clips', clipIndex],
              message: 'Loop ends outside composition.',
            });
          }
          if (
            loopRanges.some(
              ([start, end]) => clip.startTick < end && start < clip.startTick + clip.lengthTicks,
            )
          ) {
            context.addIssue({
              code: 'custom',
              path: ['tracks', trackIndex, 'clips', clipIndex],
              message: 'Loop clips may not overlap.',
            });
          }
          loopRanges.push([clip.startTick, clip.startTick + clip.lengthTicks]);
        } else {
          if (sample?.kind !== 'one-shot') {
            context.addIssue({
              code: 'custom',
              path: ['tracks', trackIndex, 'clips', clipIndex],
              message: 'Only one-shot sources may have hit clips.',
            });
          }
          if (clip.startTick >= totalTicks) {
            context.addIssue({
              code: 'custom',
              path: ['tracks', trackIndex, 'clips', clipIndex],
              message: 'Hit lies outside composition.',
            });
          }
          if (hitTicks.has(clip.startTick)) {
            context.addIssue({
              code: 'custom',
              path: ['tracks', trackIndex, 'clips', clipIndex],
              message: 'Hit ticks must be unique per track.',
            });
          }
          hitTicks.add(clip.startTick);
        }
      });
    });

    if (clipCount > MAX_CLIPS) {
      context.addIssue({
        code: 'custom',
        path: ['tracks'],
        message: `A composition may contain at most ${MAX_CLIPS} clips.`,
      });
    }
  });

export type CompositionInput = z.input<typeof CompositionSchema>;

export const validateComposition = (value: unknown): CompositionV1 | undefined => {
  const result = CompositionSchema.safeParse(value);
  return result.success ? (result.data as CompositionV1) : undefined;
};

const wireSampleIdsSchema = z.tuple([
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
]);

const wireChallengeSchema = z.tuple([
  z.literal(1),
  z.string(),
  z.number().int().min(0).max(0xffff_ffff),
  z.number().int().positive(),
  z.number().int().min(0).max(11),
  z.union([z.literal(0), z.literal(1)]),
  wireSampleIdsSchema,
]);

const wireLoopClipSchema = z.tuple([
  z.literal(0),
  z.number().int(),
  z.number().int(),
  z.number().int(),
]);
const wireHitClipSchema = z.tuple([z.literal(1), z.number().int(), z.number().int()]);
const wireTrackSchema = z.tuple([
  z.number().int(),
  z.string(),
  z.number(),
  z.number(),
  z.number().int(),
  z.number(),
  z.union([z.literal(0), z.literal(1)]),
  z.union([z.literal(0), z.literal(1)]),
  z.array(z.union([wireLoopClipSchema, wireHitClipSchema])),
]);

export const ShareWireSchema = z.tuple([
  z.literal(1),
  wireChallengeSchema,
  z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  z.array(wireTrackSchema),
]);

export type ShareWire = z.infer<typeof ShareWireSchema>;

export const PerformanceShareWireSchema = z.tuple([
  z.literal(2),
  ShareWireSchema,
  z.number().int().positive(),
  z.array(
    z.tuple([
      z.number().int().nonnegative(),
      z.number().int().nonnegative(),
      z.union([z.literal(0), z.literal(1)]),
      z.union([z.literal(0), z.literal(1)]),
    ]),
  ),
]);

export type PerformanceShareWire = z.infer<typeof PerformanceShareWireSchema>;

/** Link formats carrying sixteen sources. The eight-source formats above stay readable. */
const wireSampleIdsV2Schema = z.tuple([
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
]);

const wireChallengeV2Schema = z.tuple([
  z.literal(1),
  z.string(),
  z.number().int().min(0).max(0xffff_ffff),
  z.number().int().positive(),
  z.number().int().min(0).max(11),
  z.union([z.literal(0), z.literal(1)]),
  wireSampleIdsV2Schema,
]);

export const ShareWireV2Schema = z.tuple([
  z.literal(3),
  wireChallengeV2Schema,
  z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  z.array(wireTrackSchema),
]);

export type ShareWireV2 = z.infer<typeof ShareWireV2Schema>;

export const PerformanceShareWireV2Schema = z.tuple([
  z.literal(4),
  ShareWireV2Schema,
  z.number().int().positive(),
  z.array(
    z.tuple([
      z.number().int().nonnegative(),
      z.number().int().nonnegative(),
      z.union([z.literal(0), z.literal(1)]),
      z.union([z.literal(0), z.literal(1)]),
    ]),
  ),
]);

export type PerformanceShareWireV2 = z.infer<typeof PerformanceShareWireV2Schema>;
