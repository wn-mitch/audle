import { samplesForRole } from '../data/samples';
import type { ChallengeSnapshot, PitchClass, SampleRole } from './model';

const ROLES: readonly SampleRole[] = [
  'beat',
  'bass',
  'chord',
  'texture',
  'kick',
  'clap',
  'hat',
  'fx',
];

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
  const sampleIds = ROLES.map((role) => {
    const pool = samplesForRole(role);
    return pool[Math.floor(random() * pool.length)]!.id;
  }) as ChallengeSnapshot['sampleIds'];
  const chord = samplesForRole('chord').find((sample) => sample.id === sampleIds[2]);

  if (!chord?.sourceBpm || !chord.rootPitchClass || !chord.mode) {
    throw new Error('The challenge chord metadata is invalid.');
  }

  return {
    version: 1,
    date,
    seed,
    bpm: chord.sourceBpm,
    key: { root: chord.rootPitchClass, mode: chord.mode },
    sampleIds,
  };
};

export const shortestSemitoneInterval = (from: PitchClass, to: PitchClass): number => {
  const fromIndex = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].indexOf(from);
  const toIndex = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].indexOf(to);
  const ascending = (toIndex - fromIndex + 12) % 12;
  return ascending > 5 ? ascending - 12 : ascending;
};
