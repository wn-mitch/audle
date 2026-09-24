import { beforeEach, describe, expect, it } from 'vitest';
import type { AudioEngine, TransportSnapshot, Unsubscribe } from '../audio/engine';
import { starterForChallenge } from '../data/examples';
import { challengeForDate } from '../domain/challenge';
import { encodeShare } from '../domain/share-codec';
import type { CompositionV1, TrackControls } from '../domain/model';
import type { JevAnswers } from '../jev/jam';
import { EditorState, type JevClient } from './editor.svelte';

class FakeAudioEngine implements AudioEngine {
  composition: CompositionV1 | undefined;
  auditioned: string[] = [];
  controls: Array<{ trackId: string; controls: TrackControls }> = [];
  armed = false;
  playing = false;
  private readonly listeners = new Set<(snapshot: TransportSnapshot) => void>();

  async unlock(): Promise<void> {}
  async loadChallenge(): Promise<void> {}
  setComposition(composition: CompositionV1): void {
    this.composition = composition;
  }
  play(): void {
    this.playing = true;
    this.emit();
  }
  stop(): void {
    this.playing = false;
    this.emit();
  }
  armRecord(enabled: boolean): void {
    this.armed = enabled;
  }
  audition(sampleId: string): void {
    this.auditioned.push(sampleId);
  }
  setTrackControls(trackId: string, controls: TrackControls): void {
    this.controls.push({ trackId, controls });
  }
  subscribeTransport(listener: (snapshot: TransportSnapshot) => void): Unsubscribe {
    this.listeners.add(listener);
    listener({ playing: this.playing, tick: 0 });
    return () => this.listeners.delete(listener);
  }
  dispose(): void {}

  private emit(): void {
    for (const listener of this.listeners) listener({ playing: this.playing, tick: 0 });
  }
}

const storage = new Map<string, string>();
const fakeStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
};

Object.defineProperty(globalThis, 'window', {
  value: {
    localStorage: fakeStorage,
    clearTimeout: () => undefined,
    setTimeout: (callback: () => void) => {
      callback();
      return 1;
    },
  },
  configurable: true,
});

describe('EditorState', () => {
  beforeEach(() => storage.clear());

  it('records pad gestures as undoable, autosaved composition changes', async () => {
    const engine = new FakeAudioEngine();
    const challenge = challengeForDate('2026-08-12');
    const state = new EditorState(engine, challenge);
    await state.loadAudio();
    await state.toggleRecording();
    state.playheadTick = 17;
    state.pressPad(challenge.sampleIds[6]);

    expect(engine.auditioned).toEqual([challenge.sampleIds[6]]);
    expect(state.composition.tracks[6]!.clips).toMatchObject([{ startTick: 24, ratchet: 1 }]);
    expect(storage.get(`audle:draft:v1:${challenge.date}`)).toBeDefined();
    const afterRecord = encodeShare(state.composition);

    state.undo();
    expect(state.composition.tracks[6]!.clips).toHaveLength(0);
    state.redo();
    expect(encodeShare(state.composition)).toBe(afterRecord);
    state.destroy();
  });

  it('groups a knob gesture into one undo transaction and preserves the source voice', () => {
    const engine = new FakeAudioEngine();
    const state = new EditorState(engine, challengeForDate('2026-08-12'));
    state.selectedTrackId = 'track-2';
    state.addLayer();
    const layer = state.selectedTrack!;
    state.beginControlGesture();
    state.updateSelectedTrackControls({ ...layer.controls, tuneSemitones: 5 });
    state.updateSelectedTrackControls({ ...layer.controls, tuneSemitones: 5, cutoffHz: 600 });
    state.endControlGesture();

    expect(state.selectedTrack?.controls).toMatchObject({ tuneSemitones: 5, cutoffHz: 600 });
    expect(state.composition.tracks[2]!.controls).toMatchObject({
      tuneSemitones: 0,
      cutoffHz: 18000,
    });
    state.undo();
    expect(state.selectedTrack?.controls).toMatchObject({ tuneSemitones: 0, cutoffHz: 18000 });
    state.destroy();
  });

  it('records into a populated starter and creates an independent populated layer', async () => {
    const engine = new FakeAudioEngine();
    const challenge = challengeForDate('2026-08-12');
    const state = new EditorState(engine, challenge, starterForChallenge(challenge));
    await state.loadAudio();
    await state.toggleRecording();
    state.pressPad(challenge.sampleIds[6]);
    expect(state.composition.tracks[6]!.clips).toHaveLength(5);
    state.selectedTrackId = 'track-2';
    state.addLayer();
    expect(state.composition.tracks).toHaveLength(9);
    state.destroy();
  });

  it('places hits on the clicked sixteenth and loops at the clicked bar', async () => {
    const engine = new FakeAudioEngine();
    const challenge = challengeForDate('2026-08-12');
    const state = new EditorState(engine, challenge);
    await state.loadAudio();
    state.placeAt('track-4', 401);
    state.placeAt('track-0', 500);
    expect(state.composition.tracks[4]!.clips).toMatchObject([{ kind: 'hit', startTick: 408 }]);
    expect(state.composition.tracks[0]!.clips).toMatchObject([{ kind: 'loop', startTick: 384 }]);
    expect(state.playheadTick).toBe(504);
    expect(engine.auditioned).toEqual([challenge.sampleIds[4]]);
    state.placeAt('track-0', 700);
    expect(state.composition.tracks[0]!.clips).toHaveLength(0);
    state.destroy();
  });

  it('applies a Jev jam to empty tracks only, as one undo step', async () => {
    const engine = new FakeAudioEngine();
    const challenge = challengeForDate('2026-08-12');
    const requests: Parameters<JevClient>[0][] = [];
    const answers: JevAnswers = {
      'track-0': { full: 1 },
      'track-2': { full: 1 },
      'track-4': { four: 0.97, drive: 0.03 },
      'track-6': { rest: 1 },
    };
    const jev: JevClient = async (request) => {
      requests.push(request);
      return answers;
    };
    const state = new EditorState(
      engine,
      challenge,
      starterForChallenge(challenge),
      jev,
      () => 0.5,
    );
    await state.loadAudio();
    const starterBeat = state.composition.tracks[0]!.clips;
    await state.jamWithJev('eerie');

    expect(requests[0]!.vibe).toBe('eerie');
    expect(requests[0]!.tracks.filter((track) => track.fill).map((track) => track.index)).toEqual([
      1, 3, 4, 5, 7,
    ]);
    expect(state.composition.tracks[0]!.clips).toEqual(starterBeat);
    expect(state.composition.tracks[4]!.clips).toHaveLength(8);
    expect(state.jamPicks).toEqual({ 'track-4': 'four' });
    expect(state.notice).toContain('Jev filled 1 track');

    state.undo();
    expect(state.composition.tracks[4]!.clips).toHaveLength(0);
    expect(state.jamPicks).toEqual({});
    state.destroy();
  });

  it('leaves the loop unchanged when Jev is unreachable', async () => {
    const engine = new FakeAudioEngine();
    const challenge = challengeForDate('2026-08-12');
    const state = new EditorState(engine, challenge, undefined, async () => {
      throw new Error('offline');
    });
    await state.loadAudio();
    const before = state.composition;
    await state.jamWithJev('');
    expect(state.composition).toBe(before);
    expect(state.canUndo).toBe(false);
    expect(state.jamming).toBe(false);
    expect(state.notice).toBe('Jev is offline. Your loop is unchanged.');
    state.destroy();
  });
});
