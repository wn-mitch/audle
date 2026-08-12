import type { ChallengeSnapshot, CompositionV1, HitClip, LoopClip } from '../domain/model';
import { cloneSelectedVoice, createDailyDraft, setTrackControls } from '../domain/operations';

const loop = (
  id: string,
  startTick: number,
  lengthTicks: number,
  sourceOffsetTick = 0,
): LoopClip => ({
  id,
  kind: 'loop',
  startTick,
  lengthTicks,
  sourceOffsetTick,
});

const hit = (id: string, startTick: number, ratchet: 1 | 2 | 3 | 4 = 1): HitClip => ({
  id,
  kind: 'hit',
  startTick,
  ratchet,
});

export const starterForChallenge = (challenge: ChallengeSnapshot): CompositionV1 => {
  const composition = createDailyDraft(challenge);
  composition.tracks[0]!.clips = [loop('starter-beat', 0, 768)];
  composition.tracks[2]!.clips = [loop('starter-chord', 0, 768)];
  composition.tracks[6]!.clips = [
    hit('starter-hat-0', 48),
    hit('starter-hat-1', 240),
    hit('starter-hat-2', 432),
    hit('starter-hat-3', 624),
  ];
  return composition;
};

export const examplesForChallenge = (challenge: ChallengeSnapshot): CompositionV1[] => {
  const fourOnFloor = starterForChallenge(challenge);
  fourOnFloor.tracks[4]!.clips = Array.from({ length: 8 }, (_, index) =>
    hit(`four-kick-${index}`, index * 96),
  );
  fourOnFloor.tracks[5]!.clips = [hit('four-clap-0', 192), hit('four-clap-1', 576)];

  const syncopated = createDailyDraft(challenge);
  syncopated.tracks[1]!.clips = [loop('sync-bass', 0, 768)];
  syncopated.tracks[3]!.clips = [loop('sync-texture', 0, 768)];
  syncopated.tracks[4]!.clips = [
    hit('sync-kick-0', 0),
    hit('sync-kick-1', 168),
    hit('sync-kick-2', 384),
    hit('sync-kick-3', 600),
  ];
  syncopated.tracks[6]!.clips = [
    hit('sync-hat-0', 72, 2),
    hit('sync-hat-1', 312, 3),
    hit('sync-hat-2', 552, 2),
  ];

  let build = createDailyDraft(challenge);
  build.bars = 4;
  build.tracks[0]!.clips = [loop('build-beat-a', 0, 768), loop('build-beat-b', 768, 768)];
  build.tracks[2]!.clips = [loop('build-chord-a', 0, 768), loop('build-chord-b', 768, 768, 0)];
  build.tracks[4]!.clips = Array.from({ length: 16 }, (_, index) =>
    hit(`build-kick-${index}`, index * 96),
  );
  build.tracks[6]!.clips = Array.from({ length: 16 }, (_, index) =>
    hit(`build-hat-${index}`, index * 96 + 48, index % 4 === 3 ? 3 : 1),
  );
  const firstLayer = cloneSelectedVoice(build, 'track-2');
  if (!firstLayer.ok) throw new Error(firstLayer.reason);
  build = firstLayer.value;
  const firstLayerId = build.tracks.at(-1)!.id;
  const secondLayer = cloneSelectedVoice(build, firstLayerId);
  if (!secondLayer.ok) throw new Error(secondLayer.reason);
  build = secondLayer.value;
  const tunedFirst = setTrackControls(build, firstLayerId, {
    ...build.tracks.find((track) => track.id === firstLayerId)!.controls,
    tuneSemitones: 5,
    pan: -0.35,
    cutoffHz: 2200,
  });
  if (!tunedFirst.ok) throw new Error(tunedFirst.reason);
  const secondLayerId = tunedFirst.value.tracks.at(-1)!.id;
  const tunedSecond = setTrackControls(tunedFirst.value, secondLayerId, {
    ...tunedFirst.value.tracks.find((track) => track.id === secondLayerId)!.controls,
    tuneSemitones: -4,
    pan: 0.35,
    cutoffHz: 7000,
  });
  if (!tunedSecond.ok) throw new Error(tunedSecond.reason);

  return [fourOnFloor, syncopated, tunedSecond.value];
};
