import { z } from 'zod';
import { sampleById } from '../data/samples';
import { roleForSource } from '../domain/challenge';
import {
  BASE_TRACKS,
  PITCH_CLASSES,
  TICKS_PER_BAR,
  TICKS_PER_SIXTEENTH,
  type CompositionV1,
} from '../domain/model';
import type { ClipPlacement } from '../domain/operations';
import { expandPattern, optionsFor } from './catalog';

/**
 * What the browser sends to `/api/jev`. The server builds Jev's state and questions from this
 * itself, so the endpoint can only ever ask Jev to pick Audle patterns.
 */
export const JAM_REQUEST_SCHEMA = z.strictObject({
  bars: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  bpm: z.number().int().min(40).max(220),
  key: z.strictObject({ root: z.enum(PITCH_CLASSES), mode: z.enum(['major', 'minor']) }),
  vibe: z.string().max(80),
  tracks: z
    .array(
      z.strictObject({
        index: z
          .number()
          .int()
          .min(0)
          .max(BASE_TRACKS - 1),
        label: z.string().max(24),
        fill: z.boolean(),
        summary: z.string().max(80),
      }),
    )
    .max(BASE_TRACKS)
    .refine((tracks) => new Set(tracks.map((track) => track.index)).size === tracks.length)
    .refine((tracks) => tracks.some((track) => track.fill)),
});

export type JamRequest = z.infer<typeof JAM_REQUEST_SCHEMA>;
export type JevAnswers = Record<string, Record<string, number>>;

const questionKey = (index: number) => `track-${index}`;

const INSTRUCTIONS: Record<string, string> = {
  beat: 'Where should the drum-loop sample play?',
  bass: 'Where should the bass-loop sample play?',
  chord: 'Where should the chord-loop sample play?',
  texture: 'Where should the texture-loop sample play?',
  kick: 'Which kick drum pattern should play?',
  clap: 'Which clap pattern should play?',
  hat: 'Which hi-hat pattern should play?',
  fx: 'Which effect-hit pattern should play?',
};

/** Jev's state and one choice question per track to fill. */
export const buildJevPayload = (request: JamRequest) => {
  const kit = request.tracks
    .map((track) => `${track.label} (${roleForSource(track.index)})`)
    .join(', ');
  const playing = request.tracks
    .filter((track) => !track.fill && track.summary)
    .map((track) => `${track.label} (${roleForSource(track.index)}): ${track.summary}`);
  const state = {
    piece: `A ${request.bars}-bar repeating loop at ${request.bpm} BPM in ${request.key.root} ${request.key.mode}. Today's kit: ${kit}.`,
    already_playing: playing.join('\n') || 'Nothing yet: every part is being chosen now.',
    vibe: request.vibe.trim() || 'No vibe given: make a loop that grooves and has some shape.',
  };
  const questions = Object.fromEntries(
    request.tracks
      .filter((track) => track.fill)
      .map((track) => {
        const role = roleForSource(track.index);
        return [
          questionKey(track.index),
          {
            type: 'choice',
            instructions: INSTRUCTIONS[role],
            criteria: optionsFor(role, request.bars),
          },
        ];
      }),
  );
  return { state, questions };
};

const summarize = (composition: CompositionV1, trackIndex: number): string => {
  const track = composition.tracks[trackIndex]!;
  if (track.clips.length === 0 || track.controls.muted) return '';
  const hits = track.clips.filter((clip) => clip.kind === 'hit');
  if (hits.length > 0) {
    const perBar = hits.length / composition.bars;
    return `${hits.length} hits, about ${Math.round(perBar)} per bar`;
  }
  const bars = new Set<number>();
  for (const clip of track.clips) {
    if (clip.kind !== 'loop') continue;
    const end = clip.startTick + clip.lengthTicks;
    for (let tick = clip.startTick; tick < end; tick += TICKS_PER_SIXTEENTH)
      bars.add(Math.floor(tick / TICKS_PER_BAR) + 1);
  }
  return `plays in bar${bars.size === 1 ? '' : 's'} ${[...bars].sort((a, b) => a - b).join(', ')}`;
};

/** The jam request for a composition: every empty base track is filled. Undefined when none are empty. */
export const jamRequestFor = (composition: CompositionV1, vibe: string): JamRequest | undefined => {
  const tracks = composition.tracks.slice(0, BASE_TRACKS).map((track, index) => ({
    index,
    label: track.label.slice(0, 24),
    fill: track.clips.length === 0,
    summary: summarize(composition, index).slice(0, 80),
  }));
  if (!tracks.some((track) => track.fill)) return undefined;
  return {
    bars: composition.bars,
    bpm: composition.challenge.bpm,
    key: composition.challenge.key,
    vibe: vibe.slice(0, 80),
    tracks,
  };
};

/** Samples one option, ignoring options under 5% so a stray long-shot never lands. */
export const pickFromProbabilities = (
  probabilities: Readonly<Record<string, number>>,
  random: () => number,
): string | undefined => {
  const options = Object.entries(probabilities).filter(
    ([, probability]) => Number.isFinite(probability) && probability >= 0.05,
  );
  const total = options.reduce((sum, [, probability]) => sum + probability, 0);
  if (options.length === 0 || total <= 0) return undefined;
  let remaining = random() * total;
  for (const [name, probability] of options) {
    remaining -= probability;
    if (remaining < 0) return name;
  }
  return options.at(-1)![0];
};

const ANSWERS_SCHEMA = z.record(
  z.string(),
  z.looseObject({ probabilities: z.record(z.string(), z.number()) }),
);

/** Extracts per-question probabilities from a TypeSafe response body. */
export const parseJevAnswers = (body: unknown): JevAnswers | undefined => {
  const answers = z.looseObject({ answers: ANSWERS_SCHEMA }).safeParse(body);
  if (!answers.success) return undefined;
  return Object.fromEntries(
    Object.entries(answers.data.answers).map(([key, answer]) => [key, answer.probabilities]),
  );
};

export interface JamResult {
  placements: Record<string, ClipPlacement[]>;
  picks: Record<string, string>;
}

/**
 * Turns Jev's answers into clip placements for the tracks that were empty when the jam was
 * requested. Tracks that gained clips since, or answers for unknown patterns, are skipped.
 */
export const placementsFromAnswers = (
  composition: CompositionV1,
  answers: JevAnswers,
  random: () => number,
): JamResult => {
  const result: JamResult = { placements: {}, picks: {} };
  composition.tracks.slice(0, BASE_TRACKS).forEach((track, index) => {
    const probabilities = answers[questionKey(index)];
    const role = sampleById(track.sampleId)?.role;
    if (!probabilities || !role || track.clips.length > 0) return;
    const offered = optionsFor(role, composition.bars);
    const allowed = Object.fromEntries(
      Object.entries(probabilities).filter(([name]) => Object.hasOwn(offered, name)),
    );
    const pick = pickFromProbabilities(allowed, random);
    if (!pick) return;
    result.picks[track.id] = pick;
    const clips = expandPattern(role, pick, composition.bars);
    if (clips.length > 0) result.placements[track.id] = clips;
  });
  return result;
};
