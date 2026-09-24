import { z } from 'zod';
import { TICKS_PER_BAR, TICKS_PER_SIXTEENTH, type CompositionV1 } from './model';
import { validateComposition } from './schema';

export const MAX_PERFORMANCE_BARS = 32;
export const MAX_PERFORMANCE_EVENTS = 128;

export interface PerformanceEvent {
  tick: number;
  trackId: string;
  kind: 'mute' | 'solo';
  value: boolean;
}

export interface PerformanceV1 {
  version: 1;
  composition: CompositionV1;
  durationTicks: number;
  events: PerformanceEvent[];
}

export interface SharedAudle {
  composition: CompositionV1;
  performance?: PerformanceV1;
}

const eventSchema = z
  .object({
    tick: z.number().int().nonnegative(),
    trackId: z.string(),
    kind: z.enum(['mute', 'solo']),
    value: z.boolean(),
  })
  .strict();

const performanceSchema = z
  .object({
    version: z.literal(1),
    composition: z.unknown(),
    durationTicks: z
      .number()
      .int()
      .min(TICKS_PER_BAR)
      .max(MAX_PERFORMANCE_BARS * TICKS_PER_BAR),
    events: z.array(eventSchema).max(MAX_PERFORMANCE_EVENTS),
  })
  .strict();

export const validatePerformance = (value: unknown): PerformanceV1 | undefined => {
  const result = performanceSchema.safeParse(value);
  if (!result.success || result.data.durationTicks % TICKS_PER_SIXTEENTH !== 0) return undefined;
  const composition = validateComposition(result.data.composition);
  if (!composition) return undefined;
  const trackIds = new Set(composition.tracks.map((track) => track.id));
  const keys = new Set<string>();
  let previousTick = -1;
  for (const event of result.data.events) {
    const key = `${event.tick}:${event.trackId}:${event.kind}`;
    if (
      event.tick >= result.data.durationTicks ||
      event.tick % TICKS_PER_SIXTEENTH !== 0 ||
      event.tick < previousTick ||
      !trackIds.has(event.trackId) ||
      keys.has(key)
    )
      return undefined;
    keys.add(key);
    previousTick = event.tick;
  }
  return {
    version: 1,
    composition,
    durationTicks: result.data.durationTicks,
    events: result.data.events,
  };
};
