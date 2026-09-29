import { expect, it } from 'vitest';
import { challengeForDate } from '../domain/challenge';
import { DEFAULT_TRACK_CONTROLS, type CompositionV1 } from '../domain/model';
import type { PerformanceV1 } from '../domain/performance';
import { createVideoScene, type VideoPalette } from './scene';

it('aggregates clones, repeats onset ticks, applies take switches, and reaches both cursor ends', () => {
  const challenge = challengeForDate('2026-08-12');
  const tracks: CompositionV1['tracks'] = challenge.sampleIds.map((sampleId, index) => ({
    id: `track-${index}`,
    sampleId,
    label: sampleId,
    controls: { ...DEFAULT_TRACK_CONTROLS },
    clips: [],
  }));
  tracks[0]!.controls.muted = true;
  tracks[0]!.clips = [
    { id: 'base', kind: 'loop', startTick: 0, lengthTicks: 384, sourceOffsetTick: 0 },
  ];
  tracks[12]!.clips = [{ id: 'hat', kind: 'hit', startTick: 24, ratchet: 2 }];
  tracks.push({
    id: 'clone',
    sampleId: tracks[0]!.sampleId,
    label: 'Layer',
    controls: { ...DEFAULT_TRACK_CONTROLS },
    clips: [{ id: 'layer', kind: 'loop', startTick: 96, lengthTicks: 288, sourceOffsetTick: 96 }],
  });
  const composition: CompositionV1 = { version: 1, challenge, bars: 1, tracks };
  const performance: PerformanceV1 = {
    version: 1,
    composition,
    durationTicks: 1536,
    events: [
      { tick: 384, trackId: 'clone', kind: 'mute', value: true },
      { tick: 768, trackId: 'track-0', kind: 'mute', value: false },
      { tick: 768, trackId: 'track-12', kind: 'solo', value: true },
      { tick: 1152, trackId: 'track-12', kind: 'solo', value: false },
    ],
  };
  const palette: VideoPalette = {
    source: Array(16).fill('blue'),
    deck: 'black',
    control: 'gray',
    outline: 'gray',
    text: 'white',
    muted: 'gray',
    accent: 'mint',
  };
  const scene = createVideoScene(composition, performance, palette);
  expect(scene.stateAt(0).cursor).toBe(0);
  expect(scene.stateAt(0).tiles).toHaveLength(16);
  expect(scene.stateAt(0).tiles[0]).toMatchObject({ active: true, accent: false });
  expect(scene.stateAt(96).tiles[0]).toMatchObject({ active: true, accent: true });
  expect(scene.stateAt(384).tiles[0]).toMatchObject({ active: false, accent: false });
  expect(scene.stateAt(768).tiles[0].active).toBe(false);
  expect(scene.stateAt(768).tiles[12].active).toBe(true);
  expect(scene.stateAt(1152).tiles[0]).toMatchObject({ active: true, accent: true });
  expect(scene.stateAt(1536).cursor).toBe(1);
  expect(scene.stateAt(0).tiles[0].ticks).toEqual([0, 96, 384, 480, 768, 864, 1152, 1248]);
  expect(scene.stateAt(0).tiles[12].ticks).toEqual([24, 36, 408, 420, 792, 804, 1176, 1188]);
});
