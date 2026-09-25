import { samplesForRole } from '../data/samples';
import {
  SOURCES_PER_ROLE,
  type ChallengeSnapshot,
  type Mode,
  type PitchClass,
  type SampleRole,
} from './model';

export const ROLES: readonly SampleRole[] = [
  'beat',
  'bass',
  'chord',
  'texture',
  'kick',
  'clap',
  'hat',
  'fx',
];

/** Which role the pad at `index` plays, given two sources per role. */
export const roleForSource = (index: number): SampleRole =>
  ROLES[Math.floor(index / SOURCES_PER_ROLE)] ?? 'beat';

/** The pad holding the first source dealt for a role. */
export const firstPadFor = (role: SampleRole): number => ROLES.indexOf(role) * SOURCES_PER_ROLE;

/** Draws `count` different entries, consuming one seed step each so days stay reproducible. */
const pickDistinct = <T>(pool: readonly T[], count: number, random: () => number): T[] => {
  const remaining = [...pool];
  const picked: T[] = [];
  while (picked.length < count && remaining.length > 0) {
    picked.push(...remaining.splice(Math.floor(random() * remaining.length), 1));
  }
  return picked;
};

export const fnv1a32 = (value: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

export const mulberry32 = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let result = Math.imul(state ^ (state >>> 15), 1 | state);
    result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result;
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
};

export const assertUtcDate = (date: string): void => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Challenge dates must use UTC YYYY-MM-DD.');
  }
  const [year, month, day] = date.split('-').map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new Error('Challenge dates must be valid UTC calendar dates.');
  }
};

export const challengeForDate = (date: string): ChallengeSnapshot => {
  assertUtcDate(date);
  const seed = fnv1a32(`audle:challenge:v1:${date}`);
  const random = mulberry32(seed);

  // Both chord pads must share a mode. Playback transposes every pitched loop onto the day's root
  // but cannot turn a minor chord into a major one, so a mixed pair would clash on every bar.
  const mode: Mode = random() < 0.5 ? 'major' : 'minor';
  const chords = samplesForRole('chord').filter((sample) => sample.mode === mode);
  const chordPair = pickDistinct(chords, SOURCES_PER_ROLE, random);
  const tonic = chordPair[0];
  if (!tonic) throw new Error('The challenge chord pool is empty.');

  const byRole = new Map<SampleRole, string[]>(ROLES.map((role) => [role, []]));
  byRole.set(
    'chord',
    chordPair.map((sample) => sample.id),
  );
  for (const role of ROLES) {
    if (role === 'chord') continue;
    byRole.set(
      role,
      pickDistinct(samplesForRole(role), SOURCES_PER_ROLE, random).map((sample) => sample.id),
    );
  }

  if (!tonic.sourceBpm || !tonic.rootPitchClass)
    throw new Error('The challenge chord metadata is invalid.');

  return {
    version: 1,
    date,
    seed,
    // The faster chord sets the day's tempo, so the slower one stretches up rather than the kit
    // dragging down behind it.
    bpm: Math.max(...chordPair.map((sample) => sample.sourceBpm ?? 0)),
    key: { root: tonic.rootPitchClass, mode },
    sampleIds: ROLES.flatMap((role) => byRole.get(role) ?? []) as ChallengeSnapshot['sampleIds'],
  };
};

export const shortestSemitoneInterval = (from: PitchClass, to: PitchClass): number => {
  const fromIndex = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].indexOf(from);
  const toIndex = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].indexOf(to);
  const ascending = (toIndex - fromIndex + 12) % 12;
  return ascending > 5 ? ascending - 12 : ascending;
};
