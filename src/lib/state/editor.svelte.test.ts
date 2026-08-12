import { beforeEach, describe, expect, it } from 'vitest';
import type { AudioEngine, TransportSnapshot, Unsubscribe } from '../audio/engine';
import { starterForChallenge } from '../data/examples';
import { challengeForDate } from '../domain/challenge';
import { encodeShare } from '../domain/share-codec';
import type { CompositionV1, TrackControls } from '../domain/model';
import { EditorState } from './editor.svelte';

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
});
