import { MAX_FRAGMENT_LENGTH } from '../domain/share-codec';

/** The slice of Cloudflare's `KVNamespace` the share endpoints use. */
export interface ShortLinkStore {
  put(key: string, value: string, options: { expirationTtl: number }): Promise<void>;
  get(key: string): Promise<string | null>;
}

/** 72 random bits per link: enough that a shared Audle is not guessable by iterating ids. */
export const SHARE_ID_BYTES = 9;
export const SHARE_ID_LENGTH = 12;
export const SHARE_TTL_SECONDS = 90 * 24 * 60 * 60;
/** Short links survive 90 days; the same composition sent as a `#audle=` fragment never expires. */
export const SHARE_TTL_DAYS = SHARE_TTL_SECONDS / (24 * 60 * 60);

const ID_PATTERN = new RegExp(`^[A-Za-z0-9_-]{${SHARE_ID_LENGTH}}$`, 'u');
const PAYLOAD_PATTERN = /^[A-Za-z0-9_-]+$/u;
/** The compressed payload is shorter than its JSON envelope, so allow a little slack over the cap. */
const MAX_BODY_BYTES = MAX_FRAGMENT_LENGTH + 64;
const MIN_PAYLOAD_LENGTH = 16;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/**
 * A stored payload is base64url and nothing else. This is what keeps a value from KV safe to place
 * in a `Location` header, so it is re-checked on read as well as on write.
 */
export const isSharePayload = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length >= MIN_PAYLOAD_LENGTH &&
  value.length <= MAX_FRAGMENT_LENGTH &&
  PAYLOAD_PATTERN.test(value);

export const createShareId = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
};

export const sharePath = (id: string): string => `/s/${id}`;

/** The page a visitor sees when a short link is unknown, mistyped, or older than the TTL. */
const missingPage = () =>
  new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Audle link not found</title>
  </head>
  <body style="margin:0;display:grid;place-content:center;min-height:100vh;background:#111827;color:#f9fafb;font:16px/1.5 system-ui">
    <main style="max-width:32rem;padding:2rem">
      <h1 style="margin:0 0 0.5rem;font-size:1.5rem">That link did not open.</h1>
      <p style="margin:0 0 1.5rem;color:#9ca3af">
        Short share links are kept for ${SHARE_TTL_DAYS} days. Ask for a fresh one, or make your own Audle.
      </p>
      <a href="/" style="color:#f9fafb">Make today's Audle →</a>
    </main>
  </body>
</html>`,
    {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    },
  );

/**
 * Handles `POST /api/share`: stores a `#audle=` payload under a fresh random id and returns the
 * short URL. Only the compressed payload is stored — no account, no request metadata.
 */
export const handleShareCreate = async (
  request: Request,
  store: ShortLinkStore,
): Promise<Response> => {
  if (request.method !== 'POST') return json(405, { error: 'Use POST.' });
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES)
    return json(413, { error: 'Share link is too large.' });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json(400, { error: 'Request must be JSON.' });
  }
  const payload = (body as { payload?: unknown } | null)?.payload;
  if (!isSharePayload(payload)) return json(400, { error: 'Request is not an Audle share.' });

  const id = createShareId(crypto.getRandomValues(new Uint8Array(SHARE_ID_BYTES)));
  await store.put(id, payload, { expirationTtl: SHARE_TTL_SECONDS });
  return json(201, { url: new URL(sharePath(id), new URL(request.url).origin).toString() });
};

/** Handles `GET /s/:id`: sends the visitor to the self-contained link the app already understands. */
export const handleShareOpen = async (
  request: Request,
  store: ShortLinkStore,
  id: string,
): Promise<Response> => {
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return json(405, { error: 'Use GET.' });
  if (!ID_PATTERN.test(id)) return missingPage();
  const payload = await store.get(id);
  if (!isSharePayload(payload)) return missingPage();
  return new Response(null, {
    status: 302,
    headers: { Location: `/#audle=${payload}`, 'Cache-Control': 'no-store' },
  });
};

/**
 * An in-memory `ShortLinkStore` that honours `expirationTtl`. `vite dev` and the test suite use it
 * so both exercise the real handlers without a Cloudflare KV binding.
 */
export const memoryShareStore = (): ShortLinkStore => {
  const entries = new Map<string, { value: string; expiresAt: number }>();
  return {
    async put(key, value, options) {
      entries.set(key, { value, expiresAt: Date.now() + options.expirationTtl * 1000 });
    },
    async get(key) {
      const entry = entries.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= Date.now()) {
        entries.delete(key);
        return null;
      }
      return entry.value;
    },
  };
};
