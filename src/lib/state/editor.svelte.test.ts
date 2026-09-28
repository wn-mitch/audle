import { beforeEach, describe, expect, it } from 'vitest';
import type { AudioEngine, HitEvent, TransportSnapshot, Unsubscribe } from '../audio/engine';
import { starterForChallenge } from '../data/examples';
import { challengeForDate } from '../domain/challenge';
import { LIVE_PATTERNS } from '../domain/live';
import { encodeShare } from '../domain/share-codec';
import { BASE_TRACKS, type CompositionV1, type TrackControls } from '../domain/model';
import type { PerformanceV1 } from '../domain/performance';
import type { JevAnswers } from '../jev/jam';
import { EditorState, type JevClient } from './editor.svelte';

class FakeAudioEngine implements AudioEngine {
  composition: CompositionV1 | undefined;
  auditioned: string[] = [];
  controls: Array<{ trackId: string; controls: TrackControls }> = [];
  armed = false;
  playing = false;
  durations = new Map<string, number>();
  tick = 0;
  private scheduled: Array<{ tick: number; callback: (tick: number) => void }> = [];
  private readonly listeners = new Set<(snapshot: TransportSnapshot) => void>();
  private readonly hitListeners = new Set<(hit: HitEvent) => void>();

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
  absoluteTick(): number {
    return this.tick;
  }
  scheduleNextBar(callback: (tick: number) => void): Unsubscribe {
    const event = { tick: Math.floor(this.tick / 384 + 1) * 384, callback };
    this.scheduled.push(event);
    return () => {
      this.scheduled = this.scheduled.filter((scheduled) => scheduled !== event);
    };
  }
  scheduleTrackControls(
    _trackId: string,
    _controls: TrackControls,
    callback: (tick: number) => void,
  ): Unsubscribe {
    return this.scheduleNextBar(callback);
  }
  playPerformance(performance: PerformanceV1): void {
    this.composition = performance.composition;
    this.play();
  }
  advance(tick: number): void {
    this.tick = tick;
    const ready = this.scheduled.filter((event) => event.tick <= tick);
    this.scheduled = this.scheduled.filter((event) => event.tick > tick);
    for (const event of ready) event.callback(event.tick);
    this.emit();
  }
  armRecord(enabled: boolean): void {
    this.armed = enabled;
  }
  audition(sampleId: string): void {
    this.auditioned.push(sampleId);
  }
  sourceDurationSeconds(sampleId: string): number | undefined {
    return this.durations.get(sampleId);
  }
  setTrackControls(trackId: string, controls: TrackControls): void {
    this.controls.push({ trackId, controls });
  }
  subscribeTransport(listener: (snapshot: TransportSnapshot) => void): Unsubscribe {
    this.listeners.add(listener);
    listener({ playing: this.playing, tick: 0 });
    return () => this.listeners.delete(listener);
  }
  subscribeHits(listener: (hit: HitEvent) => void): Unsubscribe {
    this.hitListeners.add(listener);
    return () => this.hitListeners.delete(listener);
  }
  currentTick(): number {
    return this.tick;
  }
  emitHit(hit: HitEvent): void {
    for (const listener of this.hitListeners) listener(hit);
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
  removeItem: (key: string) => storage.delete(key),
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
    state.pressPad(challenge.sampleIds[12]);

    expect(engine.auditioned).toEqual([challenge.sampleIds[12]]);
    expect(state.composition.tracks[12]!.clips).toMatchObject([{ startTick: 24, ratchet: 1 }]);
    expect(storage.get(`audle:draft:v1:${challenge.date}`)).toBeDefined();
    const afterRecord = encodeShare(state.composition);

    state.undo();
    expect(state.composition.tracks[12]!.clips).toHaveLength(0);
    state.redo();
    expect(encodeShare(state.composition)).toBe(afterRecord);
    state.destroy();
  });

  it('auditions the selected source without changing the loop and refuses armed recording', async () => {
    const engine = new FakeAudioEngine();
    const challenge = challengeForDate('2026-08-12');
    const state = new EditorState(engine, challenge);
    engine.durations.set(challenge.sampleIds[0]!, 0.48);
    await state.loadAudio();
    const before = encodeShare(state.composition);

    expect(state.sourceDurationSeconds(challenge.sampleIds[0]!)).toBe(0.48);
    state.auditionSelected();
    expect(engine.auditioned).toEqual([challenge.sampleIds[0]]);
    expect(encodeShare(state.composition)).toBe(before);
    expect(state.canUndo).toBe(false);

    await state.toggleRecording();
    state.auditionSelected();
    expect(engine.auditioned).toEqual([challenge.sampleIds[0]]);
    expect(encodeShare(state.composition)).toBe(before);
    state.destroy();
  });

  it('groups a knob gesture into one undo transaction and preserves the source voice', () => {
    const engine = new FakeAudioEngine();
    const state = new EditorState(engine, challengeForDate('2026-08-12'));
    state.selectedTrackId = 'track-4';
    state.addLayer();
    const layer = state.selectedTrack!;
    state.beginControlGesture();
    state.updateSelectedTrackControls({ ...layer.controls, tuneSemitones: 5 });
    state.updateSelectedTrackControls({ ...layer.controls, tuneSemitones: 5, cutoffHz: 600 });
    state.endControlGesture();

    expect(state.selectedTrack?.controls).toMatchObject({ tuneSemitones: 5, cutoffHz: 600 });
    expect(state.composition.tracks[4]!.controls).toMatchObject({
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
    state.pressPad(challenge.sampleIds[12]);
    expect(state.composition.tracks[12]!.clips).toHaveLength(5);
    state.selectedTrackId = 'track-4';
    state.addLayer();
    expect(state.composition.tracks).toHaveLength(BASE_TRACKS + 1);
    state.destroy();
  });

  it('places hits on the clicked sixteenth and loops at the clicked bar', async () => {
    const engine = new FakeAudioEngine();
    const challenge = challengeForDate('2026-08-12');
    const state = new EditorState(engine, challenge);
    await state.loadAudio();
    state.placeAt('track-8', 401);
    state.placeAt('track-0', 500);
    expect(state.composition.tracks[8]!.clips).toMatchObject([{ kind: 'hit', startTick: 408 }]);
    expect(state.composition.tracks[0]!.clips).toMatchObject([{ kind: 'loop', startTick: 384 }]);
    expect(state.playheadTick).toBe(504);
    expect(engine.auditioned).toEqual([challenge.sampleIds[8]]);
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
      'track-4': { full: 1 },
      'track-8': { four: 0.97, drive: 0.03 },
      'track-12': { rest: 1 },
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
      1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15,
    ]);
    expect(state.composition.tracks[0]!.clips).toEqual(starterBeat);
    expect(state.composition.tracks[8]!.clips).toHaveLength(8);
    expect(state.jamPicks).toEqual({ 'track-8': 'four' });
    expect(state.notice).toContain('Jev filled 1 track');

    state.undo();
    expect(state.composition.tracks[8]!.clips).toHaveLength(0);
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
  it('keeps a live pattern while switching its sound off at the next bar', async () => {
    const engine = new FakeAudioEngine();
    const challenge = challengeForDate('2026-08-12');
    const state = new EditorState(engine, challenge);
    await state.loadAudio();
    await state.toggleLive('track-0');
    const clips = state.composition.tracks[0]!.clips;
    expect(clips.length).toBe(state.composition.bars);
    await state.toggleLive('track-0');
    expect(state.liveStatus('track-0')).toBe('queued-off');
    expect(state.composition.tracks[0]!.controls.muted).toBe(false);
    await state.toggleLive('track-0');
    expect(state.liveStatus('track-0')).toBe('on');
    engine.advance(384);
    expect(state.composition.tracks[0]!.controls.muted).toBe(false);
    await state.toggleLive('track-0');
    expect(state.liveStatus('track-0')).toBe('queued-off');
    engine.advance(768);
    expect(state.liveStatus('track-0')).toBe('off');
    expect(state.composition.tracks[0]!.clips).toEqual(clips);
    state.destroy();
  });

  it('gives loop sounds a distinct moving pattern that stays inside the source', async () => {
    const engine = new FakeAudioEngine();
    const state = new EditorState(engine, challengeForDate('2026-08-12'));
    await state.loadAudio();
    state.setBars(4);
    await state.toggleLive('track-0');
    expect(state.livePattern('track-0')).toBe('steady');

    state.chooseLivePattern('track-0', 'moving');

    expect(state.livePattern('track-0')).toBe('moving');
    const clips = state.composition.tracks[0]!.clips;
    expect(clips.every((clip) => clip.kind === 'loop')).toBe(true);
    expect(clips).toHaveLength(8);
    expect(
      new Set(clips.map((clip) => (clip.kind === 'loop' ? clip.sourceOffsetTick : -1))),
    ).toEqual(new Set([0, 192, 384, 576]));
    state.destroy();

    const reloaded = new EditorState(engine, challengeForDate('2026-08-12'));
    await reloaded.loadAudio();
    expect(reloaded.livePattern('track-0')).toBe('moving');
    reloaded.destroy();
  });

  it('applies every feel to a filled sound and reports it back', async () => {
    const engine = new FakeAudioEngine();
    const state = new EditorState(engine, challengeForDate('2026-08-12'));
    await state.loadAudio();

    for (const trackId of ['track-0', 'track-8']) {
      for (const feel of LIVE_PATTERNS) {
        state.chooseLivePattern(trackId, feel);
        expect(state.livePattern(trackId), `${trackId} on ${feel}`).toBe(feel);
      }
    }
    state.destroy();
  });

  it('queues a newly added voice until the next musical bar', async () => {
    const engine = new FakeAudioEngine();
    const state = new EditorState(engine, challengeForDate('2026-08-12'));
    await state.loadAudio();
    await state.toggleLive('track-0');
    engine.advance(96);
    await state.toggleLive('track-2');
    expect(state.liveStatus('track-2')).toBe('queued-on');
    expect(state.composition.tracks[2]!.clips).toHaveLength(state.composition.bars);
    engine.advance(384);
    expect(state.liveStatus('track-2')).toBe('on');
    state.destroy();
  });

  it('saves a bar-aligned performance without replacing the editable loop', async () => {
    const engine = new FakeAudioEngine();
    const challenge = challengeForDate('2026-08-12');
    const state = new EditorState(engine, challenge);
    await state.loadAudio();
    await state.toggleLive('track-0');
    await state.toggleLive('track-2');
    await state.startCapture();
    expect(state.captureStatus).toBe('count-in');
    engine.advance(384);
    expect(state.captureStatus).toBe('recording');
    await state.toggleLive('track-0');
    state.toggleLiveSolo('track-2');
    engine.advance(768);
    engine.advance(840);
    state.stopCapture();
    expect(state.performance?.events).toEqual([
      { tick: 384, trackId: 'track-0', kind: 'mute', value: true },
      { tick: 384, trackId: 'track-2', kind: 'solo', value: true },
    ]);
    expect(state.performance?.composition.tracks[0]!.controls.muted).toBe(false);
    expect(state.composition.tracks[0]!.controls.muted).toBe(false);
    expect(state.composition.tracks[2]!.controls.solo).toBe(false);
    expect(storage.get(`audle:performance:v1:${challenge.date}`)).toBeDefined();
    state.undo();
    expect(state.composition.tracks[2]!.clips).toHaveLength(0);
    state.undo();
    expect(state.composition.tracks[0]!.clips).toHaveLength(0);
    state.destroy();
  });
});

describe('hit events', () => {
  it('passes engine hits through and stops after unsubscribe', () => {
    const engine = new FakeAudioEngine();
    const state = new EditorState(engine, challengeForDate('2026-08-12'));
    const seen: string[] = [];
    const stop = state.subscribeHits((hit) => seen.push(hit.sampleId));
    engine.emitHit({ sampleId: 'kick-01', kind: 'audition', tick: 0, time: 0 });
    stop();
    engine.emitHit({ sampleId: 'kick-02', kind: 'audition', tick: 0, time: 0 });
    expect(seen).toEqual(['kick-01']);
    state.destroy();
  });
});
