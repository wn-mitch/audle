import { JAM_REQUEST_SCHEMA, buildJevPayload, parseJevAnswers } from './jam';

export const TYPESAFE_URL = 'https://api.typesafe.ai/v1/systemone';
export const JEV_MODEL = 'jev-1.13.0';
const MAX_BODY_BYTES = 12_288;
const UPSTREAM_TIMEOUT_MS = 10_000;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/**
 * Handles `POST /api/jev`: validates a jam request, asks Jev to choose a pattern per empty track,
 * and returns `{ answers: { [questionKey]: { [pattern]: probability } } }`. The TypeSafe key stays
 * server-side and request contents are never logged.
 */
export const handleJevRequest = async (
  request: Request,
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> => {
  if (request.method !== 'POST') return json(405, { error: 'Use POST.' });
  if (!apiKey) return json(503, { error: 'Jev is not configured.' });
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES)
    return json(413, { error: 'Request too large.' });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json(400, { error: 'Request must be JSON.' });
  }
  const parsed = JAM_REQUEST_SCHEMA.safeParse(body);
  if (!parsed.success) return json(400, { error: 'Request is not a valid jam.' });

  let upstream: Response;
  try {
    upstream = await fetchImpl(TYPESAFE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: JEV_MODEL, ...buildJevPayload(parsed.data) }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return json(502, { error: 'Jev did not answer.' });
  }
  if (!upstream.ok) return json(502, { error: `Jev returned ${upstream.status}.` });
  const answers = parseJevAnswers(await upstream.json().catch(() => undefined));
  if (!answers) return json(502, { error: 'Jev sent an unreadable answer.' });
  return json(200, { answers });
};
