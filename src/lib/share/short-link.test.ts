import { describe, expect, it } from 'vitest';
import { challengeForDate } from '../domain/challenge';
import { encodeShare } from '../domain/share-codec';
import {
  SHARE_ID_LENGTH,
  SHARE_TTL_SECONDS,
  createShareId,
  handleShareCreate,
  handleShareOpen,
  isSharePayload,
  memoryShareStore,
  type ShortLinkStore,
} from './short-link';

const payload = (() => {
  const challenge = challengeForDate('2026-09-25');
  return encodeShare({
    version: 1,
    challenge,
    bars: 4,
    tracks: challenge.sampleIds.map((sampleId, index) => ({
      id: `track-${index}`,
      sampleId,
      label: `Source ${index + 1}`,
      controls: {
        gainDb: 0,
        pan: 0,
        tuneSemitones: 0,
        cutoffHz: 18000,
        space: 0,
        echo: 0,
        fuzz: 0,
        muted: false,
        solo: false,
      },
      clips: [],
    })),
  });
})();

const create = (body: unknown, init: RequestInit = {}) =>
  new Request('https://audle.example/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...init,
  });

const recordingStore = () => {
  const puts: Array<{ key: string; value: string; ttl: number }> = [];
  const store: ShortLinkStore = {
    async put(key, value, options) {
      puts.push({ key, value, ttl: options.expirationTtl });
    },
    async get() {
      return null;
    },
  };
  return { store, puts };
};

describe('short share links', () => {
  it('stores a payload under a fresh id and returns an absolute short url', async () => {
    const { store, puts } = recordingStore();
    const response = await handleShareCreate(create({ payload }), store);

    expect(response.status).toBe(201);
    const body = (await response.json()) as { url: string };
    expect(body.url).toMatch(
      new RegExp(`^https://audle\\.example/s/[A-Za-z0-9_-]{${SHARE_ID_LENGTH}}$`, 'u'),
    );
    expect(puts).toEqual([
      { key: body.url.slice(-SHARE_ID_LENGTH), value: payload, ttl: SHARE_TTL_SECONDS },
    ]);
  });

  it('gives every link its own id', async () => {
    const ids = new Set(
      Array.from({ length: 200 }, () => createShareId(crypto.getRandomValues(new Uint8Array(9)))),
    );
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toHaveLength(SHARE_ID_LENGTH);
  });

  it('refuses anything that is not a share payload', async () => {
    const { store } = recordingStore();
    const cases: Array<[string, Request]> = [
      ['GET', new Request('https://audle.example/api/share')],
      [
        'not-json',
        new Request('https://audle.example/api/share', { method: 'POST', body: 'not json' }),
      ],
      ['missing-payload', create({})],
      ['empty-payload', create({ payload: '' })],
      ['short-payload', create({ payload: 'abc' })],
      ['unsafe-characters', create({ payload: `${payload}<script>` })],
      ['over-cap', create({ payload: 'A'.repeat(8193) })],
    ];

    for (const [label, request] of cases) {
      const response = await handleShareCreate(request, store);
      expect(response.status, label).toBeGreaterThanOrEqual(400);
      expect(response.status, label).toBeLessThan(500);
    }
  });

  it('redirects a stored id to the self-contained link', async () => {
    const store = memoryShareStore();
    const created = (await (await handleShareCreate(create({ payload }), store)).json()) as {
      url: string;
    };
    const id = created.url.slice(-SHARE_ID_LENGTH);

    const response = await handleShareOpen(new Request(`https://audle.example/s/${id}`), store, id);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(`/#audle=${payload}`);
  });

  it('reports a missing link instead of redirecting', async () => {
    const store = memoryShareStore();
    const cases: Array<[string, string]> = [
      ['unknown-id', 'AAAAAAAAAAAA'],
      ['mistyped-id', 'too-short'],
      ['path-traversal', '../../api/share'],
    ];

    for (const [label, id] of cases) {
      const response = await handleShareOpen(
        new Request(`https://audle.example/s/${id}`),
        store,
        id,
      );
      expect(response.status, label).toBe(404);
      expect(response.headers.get('Content-Type'), label).toContain('text/html');
    }
  });

  it('stops serving a payload once its ttl has passed', async () => {
    const values = new Map<string, { value: string; ttl: number }>();
    let now = 1_000_000;
    const store: ShortLinkStore = {
      async put(key, value, options) {
        values.set(key, { value, ttl: options.expirationTtl });
      },
      async get(key) {
        const entry = values.get(key);
        if (!entry || now >= entry.ttl * 1000) return null;
        return entry.value;
      },
    };
    const created = (await (await handleShareCreate(create({ payload }), store)).json()) as {
      url: string;
    };
    const id = created.url.slice(-SHARE_ID_LENGTH);

    expect(
      (await handleShareOpen(new Request('https://audle.example/s/x'), store, id)).status,
    ).toBe(302);
    now += SHARE_TTL_SECONDS * 1000;
    expect(
      (await handleShareOpen(new Request('https://audle.example/s/x'), store, id)).status,
    ).toBe(404);
  });

  it('only treats base64url payloads of a plausible size as shareable', () => {
    expect(isSharePayload(payload)).toBe(true);
    expect(isSharePayload('a'.repeat(16))).toBe(true);
    expect(isSharePayload('a'.repeat(8193))).toBe(false);
    expect(isSharePayload('a'.repeat(15))).toBe(false);
    expect(isSharePayload('padding==')).toBe(false);
    expect(isSharePayload(undefined)).toBe(false);
    expect(isSharePayload(42)).toBe(false);
  });
});
