import { strToU8, zlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { challengeForDate } from './challenge';
import type { CompositionV1, Track } from './model';
import {
  compositionToWire,
  decodeShare,
  decodeShared,
  encodeShare,
  encodePerformanceShare,
  fingerprintForComposition,
} from './share-codec';

const baseComposition = (): CompositionV1 => {
  const challenge = challengeForDate('2026-08-12');
  const tracks: Track[] = challenge.sampleIds.map((sampleId, index) => ({
    id: `source-${index}`,
    sampleId,
    label: `Source ${index + 1}`,
    controls: {
      gainDb: index % 2 === 0 ? -0.5 : 0,
      pan: index % 2 === 0 ? -0.05 : 0.05,
      tuneSemitones: 0,
      cutoffHz: 18000,
      muted: false,
      solo: false,
    },
    clips: [],
  }));
  return { version: 1, challenge, bars: 4, tracks };
};

const encodedWire = (wire: unknown): string => {
  const compressed = zlibSync(strToU8(JSON.stringify(wire)));
  return btoa(String.fromCharCode(...compressed))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
};

describe('share codec', () => {
  it('round-trips a maximal composition without serializing ephemeral IDs', async () => {
    const composition = baseComposition();
    const hitTracks = composition.tracks.slice(4);
    for (const [trackIndex, track] of hitTracks.entries()) {
      for (let tick = 0; tick < 1536; tick += 24) {
        track.clips.push({
          id: `original-${trackIndex}-${tick}`,
          kind: 'hit',
          startTick: tick,
          ratchet: (((tick / 24) % 4) + 1) as 1 | 2 | 3 | 4,
        });
      }
    }
    for (let index = 0; index < 8; index += 1) {
      composition.tracks.push({
        id: `clone-${index}`,
        sampleId: composition.challenge.sampleIds[2],
        label: `Layer ${index + 2}`,
        controls: {
          gainDb: 0,
          pan: 0,
          tuneSemitones: index - 4,
          cutoffHz: 18000,
          muted: false,
          solo: false,
        },
        clips: [],
      });
    }

    const payload = encodeShare(composition);
    const decoded = decodeShare(payload);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;

    expect(decoded.value.tracks).toHaveLength(16);
    expect(decoded.value.tracks.flatMap((track) => track.clips)).toHaveLength(256);
    expect(
      decoded.value.tracks
        .slice(8)
        .every((track) => track.sampleId === composition.challenge.sampleIds[2]),
    ).toBe(true);
    expect(decoded.value.tracks[0]?.id).toBe('track-0');
    expect(decoded.value.tracks[4]?.clips[0]?.id).toBe('clip-4-0');
    expect(await fingerprintForComposition(decoded.value)).toBe(
      await fingerprintForComposition(composition),
    );
  });

  it('preserves legacy links and replays performance events against reconstructed track IDs', () => {
    const composition = baseComposition();
    composition.tracks[0]!.clips.push({
      id: 'original-loop',
      kind: 'loop',
      startTick: 0,
      lengthTicks: 384,
      sourceOffsetTick: 0,
    });
    const legacy = decodeShared(encodeShare(composition));
    expect(legacy.ok && legacy.value.performance).toBeUndefined();
    const encoded = encodePerformanceShare({
      version: 1,
      composition,
      durationTicks: 768,
      events: [{ tick: 384, trackId: composition.tracks[0]!.id, kind: 'mute', value: true }],
    });
    const decoded = decodeShared(encoded);
    expect(decoded.ok && decoded.value.performance?.events).toEqual([
      { tick: 384, trackId: 'track-0', kind: 'mute', value: true },
    ]);
    expect(
      decodeShared(encodedWire([2, compositionToWire(composition), 768, [[384, 99, 0, 1]]])).ok,
    ).toBe(false);
  });

  it('fails closed for malformed, unsupported, or non-canonical payloads', () => {
    const composition = baseComposition();
    const wire = compositionToWire(composition);
    const cases: unknown[] = [
      [2, wire[1], wire[2], wire[3]],
      [1, wire[1], wire[2], wire[3].slice(0, 7)],
      [
        1,
        wire[1],
        wire[2],
        [
          ...wire[3],
          wire[3][0],
          wire[3][0],
          wire[3][0],
          wire[3][0],
          wire[3][0],
          wire[3][0],
          wire[3][0],
          wire[3][0],
          wire[3][0],
        ],
      ],
      [1, [...wire[1].slice(0, 6), ['unknown', ...wire[1][6].slice(1)]], wire[2], wire[3]],
      [1, wire[1], wire[2], [[1, ...wire[3][0]!.slice(1)], ...wire[3].slice(1)]],
      [
        1,
        wire[1],
        wire[2],
        [...wire[3].slice(0, 4), [...wire[3][4]!.slice(0, 8), [[1, 1, 5]]], ...wire[3].slice(5)],
      ],
      [
        1,
        wire[1],
        wire[2],
        [...wire[3].slice(0, 4), [...wire[3][4]!.slice(0, 8), [[1, 1, 1]]], ...wire[3].slice(5)],
      ],
      [...wire, 'extra'],
    ];

    for (const malformedWire of cases) {
      expect(decodeShare(encodedWire(malformedWire)).ok).toBe(false);
    }
    expect(decodeShare('eJw').ok).toBe(false);
    expect(decodeShare('a'.repeat(8193))).toEqual({ ok: false, error: 'too-long' });
    expect(decodeShare(encodedWire('x'.repeat(65_537)))).toEqual({ ok: false, error: 'too-large' });
  });
});
