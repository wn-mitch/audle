import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { challengeForDate, shortestSemitoneInterval } from '../domain/challenge';
import { BASE_TRACKS } from '../domain/model';
import { validateComposition } from '../domain/schema';
import { recordHit } from '../domain/operations';
import { cloneSelectedVoice } from '../domain/operations';
import { examplesForChallenge, starterForChallenge } from './examples';
import { SAMPLE_ASSETS, samplesForRole } from './samples';

describe('challengeForDate', () => {
  it('creates the specified stable challenge for 2026-08-11', () => {
    expect(challengeForDate('2026-08-11')).toEqual({
      version: 1,
      date: '2026-08-11',
      seed: 3986328180,
      bpm: 140,
      key: { root: 'E', mode: 'major' },
      sampleIds: [
        'beat-03',
        'beat-04',
        'bass-01',
        'bass-02',
        'chord-01',
        'chord-02',
        'texture-01',
        'texture-03',
        'kick-02',
        'kick-07',
        'clap-01',
        'clap-04',
        'hat-03',
        'hat-01',
        'fx-04',
        'fx-01',
      ],
    });
  });

  it('creates the specified stable challenge for 2026-08-12', () => {
    expect(challengeForDate('2026-08-12')).toEqual({
      version: 1,
      date: '2026-08-12',
      seed: 4036661037,
      bpm: 140,
      key: { root: 'A', mode: 'minor' },
      sampleIds: [
        'beat-01',
        'beat-05',
        'bass-02',
        'bass-03',
        'chord-05',
        'chord-04',
        'texture-02',
        'texture-01',
        'kick-04',
        'kick-07',
        'clap-04',
        'clap-07',
        'hat-04',
        'hat-03',
        'fx-04',
        'fx-03',
      ],
    });
  });

  it('rejects malformed or non-calendar UTC dates', () => {
    expect(() => challengeForDate('08/12/2026')).toThrow('UTC YYYY-MM-DD');
    expect(() => challengeForDate('2026-02-29')).toThrow('valid UTC calendar dates');
  });

  it('normalizes tonal playback through the shortest interval', () => {
    expect(shortestSemitoneInterval('A', 'C')).toBe(3);
    expect(shortestSemitoneInterval('C', 'F#')).toBe(-6);
    expect(shortestSemitoneInterval('B', 'C')).toBe(1);
  });
});

describe('deterministic examples', () => {
  it('keeps the starter and all examples inside the composition boundary', () => {
    const challenge = challengeForDate('2026-08-12');
    expect(validateComposition(starterForChallenge(challenge))).toBeDefined();
    const examples = examplesForChallenge(challenge);
    expect(examples).toHaveLength(3);
    expect(examples.every((example) => validateComposition(example) !== undefined)).toBe(true);
    expect(examples[2]!.tracks).toHaveLength(BASE_TRACKS + 2);
  });
  it('clones a populated starter voice within the valid composition boundary', () => {
    const starter = starterForChallenge(challengeForDate('2026-08-12'));
    const clone = cloneSelectedVoice(starter, 'track-4');
    expect(clone.ok).toBe(true);
    if (clone.ok) expect(clone.value.tracks).toHaveLength(BASE_TRACKS + 1);
  });

  it('records a hit in a populated starter composition', () => {
    const starter = starterForChallenge(challengeForDate('2026-08-12'));
    const recorded = recordHit(starter, 'track-12', 0);
    expect(recorded.ok).toBe(true);
    if (recorded.ok) expect(recorded.value.tracks[12]!.clips).toHaveLength(5);
  });
});

describe('sample manifest', () => {
  it('describes and vendors every source asset', () => {
    const assetDirectory = fileURLToPath(new URL('../../../public/samples/v1/', import.meta.url));
    const filenames = readdirSync(assetDirectory).filter((filename) => filename.endsWith('.wav'));

    expect(SAMPLE_ASSETS).toHaveLength(45);
    expect(filenames).toHaveLength(45);
    expect(
      SAMPLE_ASSETS.every((asset) =>
        existsSync(fileURLToPath(new URL(`../../../public${asset.url}`, import.meta.url))),
      ),
    ).toBe(true);
    expect(
      filenames.every((filename) =>
        /^(beat|bass|chord|texture|kick|clap|hat|fx)-0[1-7]\.wav$/.test(filename),
      ),
    ).toBe(true);
  });

  it('has BPM and length metadata for all loops and root metadata for tonal loops', () => {
    const loops = SAMPLE_ASSETS.filter((asset) => asset.kind === 'loop');
    expect(loops).toHaveLength(18);
    expect(loops.every((asset) => asset.sourceBpm && [2, 4].includes(asset.bars ?? 0))).toBe(true);
    expect(
      [
        ...samplesForRole('bass'),
        ...samplesForRole('chord'),
        ...samplesForRole('texture').slice(2),
      ].every((asset) => asset.rootPitchClass),
    ).toBe(true);
  });
});
