import { Unzlib, strFromU8, strToU8, zlibSync } from 'fflate';
import { PITCH_CLASSES, type Clip, type CompositionV1, type Track } from './model';
import { ShareWireSchema, type ShareWire, validateComposition } from './schema';

const MAX_FRAGMENT_LENGTH = 8192;
const MAX_INFLATED_LENGTH = 65_536;

export type ShareError =
  | 'too-long'
  | 'invalid-base64'
  | 'invalid-compression'
  | 'too-large'
  | 'invalid-payload'
  | 'invalid-composition';

export type ShareResult<T> = { ok: true; value: T } | { ok: false; error: ShareError };

export class ShareCodecError extends Error {
  constructor(readonly code: ShareError) {
    super(code);
  }
}

const asBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
};

const fromBase64Url = (payload: string): Uint8Array => {
  if (!/^[A-Za-z0-9_-]+$/u.test(payload)) throw new ShareCodecError('invalid-base64');
  try {
    const encoded = payload.replaceAll('-', '+').replaceAll('_', '/');
    const binary = atob(encoded + '='.repeat((4 - (encoded.length % 4)) % 4));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new ShareCodecError('invalid-base64');
  }
};

const clipComparator = (left: Clip, right: Clip): number => {
  if (left.startTick !== right.startTick) return left.startTick - right.startTick;
  if (left.kind !== right.kind) return left.kind === 'loop' ? -1 : 1;
  if (left.kind === 'loop' && right.kind === 'loop') {
    return left.lengthTicks - right.lengthTicks || left.sourceOffsetTick - right.sourceOffsetTick;
  }
  if (left.kind === 'hit' && right.kind === 'hit') return left.ratchet - right.ratchet;
  return 0;
};

const clipToWire = (clip: Clip): ShareWire[3][number][8][number] =>
  clip.kind === 'loop'
    ? [0, clip.startTick, clip.lengthTicks, clip.sourceOffsetTick]
    : [1, clip.startTick, clip.ratchet];

const trackToWire = (
  track: Track,
  sampleIds: CompositionV1['challenge']['sampleIds'],
): ShareWire[3][number] => {
  const sampleIndex = sampleIds.indexOf(track.sampleId);
  if (sampleIndex < 0) throw new ShareCodecError('invalid-composition');

  return [
    sampleIndex,
    track.label,
    track.controls.gainDb,
    track.controls.pan,
    track.controls.tuneSemitones,
    track.controls.cutoffHz,
    track.controls.muted ? 1 : 0,
    track.controls.solo ? 1 : 0,
    [...track.clips].sort(clipComparator).map(clipToWire),
  ];
};

export const compositionToWire = (composition: CompositionV1): ShareWire => {
  const validated = validateComposition(composition);
  if (!validated) throw new ShareCodecError('invalid-composition');

  const rootIndex = PITCH_CLASSES.indexOf(validated.challenge.key.root);
  return [
    1,
    [
      1,
      validated.challenge.date,
      validated.challenge.seed,
      validated.challenge.bpm,
      rootIndex,
      validated.challenge.key.mode === 'major' ? 0 : 1,
      validated.challenge.sampleIds,
    ],
    validated.bars,
    validated.tracks.map((track) => trackToWire(track, validated.challenge.sampleIds)),
  ];
};

const wireToComposition = (wire: ShareWire): CompositionV1 | undefined => {
  const [, challengeTuple, bars, wireTracks] = wire;
  const [, date, seed, bpm, rootIndex, modeBit, sampleIds] = challengeTuple;
  const root = PITCH_CLASSES[rootIndex];
  if (!root) return undefined;

  const composition = {
    version: 1,
    challenge: {
      version: 1,
      date,
      seed,
      bpm,
      key: { root, mode: modeBit === 0 ? 'major' : 'minor' },
      sampleIds,
    },
    bars,
    tracks: wireTracks.map((wireTrack, trackIndex) => {
      const [
        sampleIndex,
        label,
        gainDb,
        pan,
        tuneSemitones,
        cutoffHz,
        mutedBit,
        soloBit,
        wireClips,
      ] = wireTrack;
      const sampleId = sampleIds[sampleIndex];
      return {
        id: `track-${trackIndex}`,
        sampleId,
        label,
        controls: {
          gainDb,
          pan,
          tuneSemitones,
          cutoffHz,
          muted: mutedBit === 1,
          solo: soloBit === 1,
        },
        clips: wireClips.map((wireClip, clipIndex) =>
          wireClip[0] === 0
            ? {
                id: `clip-${trackIndex}-${clipIndex}`,
                kind: 'loop' as const,
                startTick: wireClip[1],
                lengthTicks: wireClip[2],
                sourceOffsetTick: wireClip[3],
              }
            : {
                id: `clip-${trackIndex}-${clipIndex}`,
                kind: 'hit' as const,
                startTick: wireClip[1],
                ratchet: wireClip[2] as 1 | 2 | 3 | 4,
              },
        ),
      };
    }),
  };

  return validateComposition(composition);
};

const inflatePayload = (compressed: Uint8Array): string => {
  const chunks: Uint8Array[] = [];
  let length = 0;
  const inflater = new Unzlib((chunk) => {
    length += chunk.length;
    if (length > MAX_INFLATED_LENGTH) throw new ShareCodecError('too-large');
    chunks.push(chunk);
  });

  try {
    inflater.push(compressed, true);
  } catch (error) {
    if (error instanceof ShareCodecError) throw error;
    throw new ShareCodecError('invalid-compression');
  }

  const inflated = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    inflated.set(chunk, offset);
    offset += chunk.length;
  }
  return strFromU8(inflated);
};

export const encodeShare = (composition: CompositionV1): string => {
  const wire = compositionToWire(composition);
  const encoded = asBase64Url(zlibSync(strToU8(JSON.stringify(wire))));
  if (encoded.length > MAX_FRAGMENT_LENGTH) throw new ShareCodecError('too-long');
  return encoded;
};

export const decodeShare = (payload: string): ShareResult<CompositionV1> => {
  if (payload.length === 0 || payload.length > MAX_FRAGMENT_LENGTH)
    return { ok: false, error: 'too-long' };

  try {
    const compressed = fromBase64Url(payload);
    const parsedJson: unknown = JSON.parse(inflatePayload(compressed));
    const wireResult = ShareWireSchema.safeParse(parsedJson);
    if (!wireResult.success) return { ok: false, error: 'invalid-payload' };
    const composition = wireToComposition(wireResult.data);
    return composition
      ? { ok: true, value: composition }
      : { ok: false, error: 'invalid-composition' };
  } catch (error) {
    if (error instanceof ShareCodecError) return { ok: false, error: error.code };
    return { ok: false, error: 'invalid-payload' };
  }
};

export const fingerprintForComposition = async (composition: CompositionV1): Promise<string> => {
  const source = strToU8(JSON.stringify(compositionToWire(composition)));
  const digest = await crypto.subtle.digest('SHA-256', source);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};
