import { describe, expect, it } from 'vitest';
import { starterForChallenge } from '../data/examples';
import { challengeForDate } from '../domain/challenge';
import { createDailyDraft, fillTracks } from '../domain/operations';
import {
  buildJevPayload,
  jamRequestFor,
  parseJevAnswers,
  pickFromProbabilities,
  placementsFromAnswers,
} from './jam';
import { handleJevRequest } from './proxy';

const challenge = challengeForDate('2026-08-12');

const sequence =
  (...values: number[]) =>
  () =>
    values.shift() ?? 0;

describe('pickFromProbabilities', () => {
  it('samples in proportion and never lands on an option under 5%', () => {
    const probabilities = { rest: 0.04, four: 0.48, drive: 0.48 };
    expect(pickFromProbabilities(probabilities, () => 0)).toBe('four');
    expect(pickFromProbabilities(probabilities, () => 0.49)).toBe('four');
    expect(pickFromProbabilities(probabilities, () => 0.51)).toBe('drive');
    expect(pickFromProbabilities(probabilities, () => 0.999999)).toBe('drive');
  });

  it('returns nothing for empty, all-tiny, or malformed probabilities', () => {
    expect(pickFromProbabilities({}, Math.random)).toBeUndefined();
    expect(pickFromProbabilities({ a: 0.01, b: 0.02 }, Math.random)).toBeUndefined();
    expect(pickFromProbabilities({ a: Number.NaN, b: -1 }, Math.random)).toBeUndefined();
  });
});

describe('jam requests', () => {
  it('asks only about empty base tracks and describes what already plays', () => {
    const composition = starterForChallenge(challenge);
    const request = jamRequestFor(composition, 'eerie and slow')!;
    expect(request.tracks.filter((track) => track.fill).map((track) => track.index)).toEqual([
      1, 3, 4, 5, 7,
    ]);
    const payload = buildJevPayload(request);
    expect(Object.keys(payload.questions)).toEqual([
      'track-1',
      'track-3',
      'track-4',
      'track-5',
      'track-7',
    ]);
    expect(payload.questions['track-4']!.criteria).toHaveProperty('four');
    expect(payload.state.already_playing).toContain('plays in bars 1, 2');
    expect(payload.state.already_playing).toContain('4 hits, about 2 per bar');
    expect(payload.state.vibe).toBe('eerie and slow');
  });

  it('has nothing to ask once every base track has clips', () => {
    const composition = createDailyDraft(challenge);
    const full = fillTracks(
      composition,
      Object.fromEntries(
        composition.tracks.map((track, index) => [
          track.id,
          [
            index < 4
              ? { kind: 'loop' as const, startTick: 0, lengthTicks: 384, sourceOffsetTick: 0 }
              : { kind: 'hit' as const, startTick: 0, ratchet: 1 as const },
          ],
        ]),
      ),
    );
    if (!full.ok) throw new Error(full.reason);
    expect(jamRequestFor(full.value, '')).toBeUndefined();
  });

  it('ignores answers for filled tracks, unknown patterns, and rests', () => {
    const composition = starterForChallenge(challenge);
    const result = placementsFromAnswers(
      composition,
      {
        'track-0': { full: 1 },
        'track-4': { polka: 0.9, four: 0.1 },
        'track-5': { backbeat: 1 },
        'track-7': { rest: 1 },
        'track-9': { full: 1 },
      },
      sequence(0, 0, 0),
    );
    expect(result.picks).toEqual({ 'track-4': 'four', 'track-5': 'backbeat', 'track-7': 'rest' });
    expect(Object.keys(result.placements)).toEqual(['track-4', 'track-5']);
  });

  it('reads probabilities out of a TypeSafe response', () => {
    expect(
      parseJevAnswers({
        model: 'jev-1.13.0',
        answers: {
          'track-4': { type: 'choice', choice: 'four', probabilities: { four: 0.9, rest: 0.1 } },
        },
      }),
    ).toEqual({ 'track-4': { four: 0.9, rest: 0.1 } });
    expect(parseJevAnswers({ error: 'nope' })).toBeUndefined();
    expect(parseJevAnswers(undefined)).toBeUndefined();
  });
});

describe('handleJevRequest', () => {
  const jam = () => JSON.stringify(jamRequestFor(starterForChallenge(challenge), 'bright')!);
  const post = (body: string) =>
    new Request('https://audle.test/api/jev', { method: 'POST', body });

  it('builds the Jev request server-side and returns only probabilities', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Response.json({
        answers: { 'track-4': { choice: 'four', probabilities: { four: 1 } } },
        usage: { input_tokens: 1 },
      });
    }) as unknown as typeof fetch;
    const response = await handleJevRequest(post(jam()), 'secret', fetchImpl);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ answers: { 'track-4': { four: 1 } } });
    expect(calls[0]!.url).toBe('https://api.typesafe.ai/v1/systemone');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer secret');
    const sent = JSON.parse(calls[0]!.init.body as string);
    expect(sent.model).toBe('jev-1.13.0');
    expect(sent.state.vibe).toBe('bright');
    expect(Object.keys(sent.questions)).toContain('track-4');
  });

  it('refuses without a key, with bad bodies, and for arbitrary questions', async () => {
    const never = (async () => {
      throw new Error('should not be called');
    }) as unknown as typeof fetch;
    expect((await handleJevRequest(post(jam()), undefined, never)).status).toBe(503);
    expect((await handleJevRequest(post('not json'), 'k', never)).status).toBe(400);
    expect((await handleJevRequest(post('x'.repeat(5000)), 'k', never)).status).toBe(413);
    const smuggled = { ...JSON.parse(jam()), questions: { q: { type: 'choice' } } };
    expect((await handleJevRequest(post(JSON.stringify(smuggled)), 'k', never)).status).toBe(400);
    const longVibe = { ...JSON.parse(jam()), vibe: 'v'.repeat(81) };
    expect((await handleJevRequest(post(JSON.stringify(longVibe)), 'k', never)).status).toBe(400);
    const get = new Request('https://audle.test/api/jev');
    expect((await handleJevRequest(get, 'k', never)).status).toBe(405);
  });

  it('maps upstream failures to 502', async () => {
    const failing = (async () => new Response('bad', { status: 500 })) as unknown as typeof fetch;
    expect((await handleJevRequest(post(jam()), 'k', failing)).status).toBe(502);
    const throwing = (async () => {
      throw new Error('network');
    }) as unknown as typeof fetch;
    expect((await handleJevRequest(post(jam()), 'k', throwing)).status).toBe(502);
    const garbled = (async () => Response.json({ nope: true })) as unknown as typeof fetch;
    expect((await handleJevRequest(post(jam()), 'k', garbled)).status).toBe(502);
  });
});
