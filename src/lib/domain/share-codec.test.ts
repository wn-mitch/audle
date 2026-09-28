import { strToU8, zlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { challengeForDate } from './challenge';
import type { CompositionV1, Track } from './model';
import { validateComposition } from './schema';
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
      space: 0,
      echo: 0,
      fuzz: 0,
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
    // The eight one-shot pads are the second source of each percussive role.
    const hitTracks = composition.tracks.slice(8, 16);
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
          space: 0,
          echo: 0,
          fuzz: 0,
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

    expect(decoded.value.tracks).toHaveLength(24);
    expect(decoded.value.tracks.flatMap((track) => track.clips)).toHaveLength(512);
    expect(
      decoded.value.tracks
        .slice(16)
        .every((track) => track.sampleId === composition.challenge.sampleIds[2]),
    ).toBe(true);
    expect(decoded.value.tracks[0]?.id).toBe('track-0');
    expect(decoded.value.tracks[8]?.clips[0]?.id).toBe('clip-8-0');
    expect(await fingerprintForComposition(decoded.value)).toBe(
      await fingerprintForComposition(composition),
    );
  });

  it('round-trips effects in the current wire while old sixteen-source links stay dry', () => {
    const composition = baseComposition();
    composition.tracks[0]!.controls = {
      ...composition.tracks[0]!.controls,
      space: 0.25,
      echo: 0.5,
      fuzz: 0.75,
    };

    const wire = compositionToWire(composition);
    expect(wire[0]).toBe(5);
    const current = decodeShare(encodeShare(composition));
    expect(current.ok && current.value.tracks[0]?.controls).toMatchObject({
      space: 0.25,
      echo: 0.5,
      fuzz: 0.75,
    });

    const savedDraft = structuredClone(baseComposition());
    for (const track of savedDraft.tracks) {
      delete (track.controls as Partial<Track['controls']>).space;
      delete (track.controls as Partial<Track['controls']>).echo;
      delete (track.controls as Partial<Track['controls']>).fuzz;
    }
    expect(validateComposition(savedDraft)?.tracks[0]?.controls).toMatchObject({
      space: 0,
      echo: 0,
      fuzz: 0,
    });

    const legacyWire = [3, wire[1], wire[2], wire[3].map((track) => track.slice(0, 9))];
    const legacy = decodeShare(encodedWire(legacyWire));
    expect(legacy.ok && legacy.value.tracks[0]?.controls).toMatchObject({
      space: 0,
      echo: 0,
      fuzz: 0,
    });
    const legacyPerformance = decodeShared(encodedWire([4, legacyWire, 384, [[0, 0, 0, 1]]]));
    expect(
      legacyPerformance.ok && legacyPerformance.value.performance?.composition.tracks[0]?.controls,
    ).toMatchObject({ space: 0, echo: 0, fuzz: 0 });
  });

  it('refuses links from the eight-source format and replays takes otherwise', () => {
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
