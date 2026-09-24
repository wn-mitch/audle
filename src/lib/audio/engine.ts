import * as Tone from 'tone';
import { sampleById } from '../data/samples';
import { shortestSemitoneInterval } from '../domain/challenge';
import {
  TICKS_PER_QUARTER,
  type ChallengeSnapshot,
  type Clip,
  type CompositionV1,
  type TrackControls,
} from '../domain/model';
import type { PerformanceV1 } from '../domain/performance';

export type Unsubscribe = () => void;
export interface TransportSnapshot {
  playing: boolean;
  tick: number;
}

export interface AudioEngine {
  unlock(): Promise<void>;
  loadChallenge(challenge: ChallengeSnapshot): Promise<void>;
  setComposition(composition: CompositionV1): void;
  play(): void;
  stop(): void;
  armRecord(enabled: boolean): void;
  audition(sampleId: string): void;
  absoluteTick(): number;
  scheduleTrackControls(
    trackId: string,
    controls: Partial<TrackControls>,
    onCommit: (tick: number) => void,
  ): Unsubscribe;
  scheduleNextBar(onCommit: (tick: number) => void): Unsubscribe;
  playPerformance(performance: PerformanceV1): void;
  setTrackControls(trackId: string, controls: TrackControls): void;
  subscribeTransport(listener: (snapshot: TransportSnapshot) => void): Unsubscribe;
  dispose(): void;
}

export class AssetLoadError extends Error {
  constructor(readonly sampleId: string) {
    super(`Could not load ${sampleById(sampleId)?.label ?? sampleId}.`);
  }
}

type TrackNodes = {
  filter: Tone.Filter;
  panner: Tone.Panner;
  gain: Tone.Gain;
};

type ScheduledEvent = {
  trackId: string;
  clip: Clip;
};

type SoundingSource = Tone.GrainPlayer | Tone.Player;

const transportTime = (tick: number): `${number}i` => `${tick}i`;

export class ToneAudioEngine implements AudioEngine {
  private readonly transport = Tone.getTransport();
  private readonly limiter = new Tone.Limiter(-1);
  private readonly analyser = new Tone.Analyser('waveform', 256);
  private readonly listeners = new Set<(snapshot: TransportSnapshot) => void>();
  private readonly buffers = new Map<string, Tone.ToneAudioBuffer>();
  private readonly nodes = new Map<string, TrackNodes>();
  private readonly soundingSources = new Map<SoundingSource, string>();
  private composition: CompositionV1 | undefined;
  private part: Tone.Part<[string, ScheduledEvent]> | undefined;
  private structureSignature = '';
  private armed = false;
  private disposed = false;
  private readonly transportListenerId: number;
  private readonly pending = new Set<number>();
  private readonly performanceEvents = new Set<number>();
  private loopRounds = 0;
  private lastLoopTick = 0;

  constructor() {
    this.limiter.connect(this.analyser);
    this.analyser.toDestination();
    this.transport.PPQ = TICKS_PER_QUARTER;
    this.transportListenerId = this.transport.scheduleRepeat(
      () => this.emitTransport(),
      transportTime(24),
    );
  }

  async unlock(): Promise<void> {
    if (this.disposed) return;
    await Tone.start();
  }

  async loadChallenge(challenge: ChallengeSnapshot): Promise<void> {
    if (this.disposed) return;
    const wantedIds = new Set(challenge.sampleIds);
    this.stop();
    for (const [sampleId, buffer] of this.buffers) {
      if (!wantedIds.has(sampleId)) {
        buffer.dispose();
        this.buffers.delete(sampleId);
      }
    }

    await Promise.all(
      challenge.sampleIds.map(async (sampleId) => {
        if (this.buffers.has(sampleId)) return;
        const sample = sampleById(sampleId);
        if (!sample) throw new AssetLoadError(sampleId);
        try {
          const buffer = await Tone.ToneAudioBuffer.fromUrl(sample.url);
          this.buffers.set(sampleId, buffer);
        } catch {
          throw new AssetLoadError(sampleId);
        }
      }),
    );
  }

  setComposition(composition: CompositionV1): void {
    if (this.disposed) return;
    const nextSignature = JSON.stringify({
      bars: composition.bars,
      tracks: composition.tracks.map((track) => ({
        id: track.id,
        sampleId: track.sampleId,
        clips: track.clips,
      })),
    });
    this.composition = composition;
    this.synchronizeTrackNodes(composition);
    if (nextSignature !== this.structureSignature) {
      this.structureSignature = nextSignature;
      this.rebuildPart(composition);
    }
  }

  play(): void {
    if (
      this.disposed ||
      !this.composition ||
      this.buffers.size !== this.composition.challenge.sampleIds.length
    )
      return;
    this.transport.bpm.value = this.composition.challenge.bpm;
    this.transport.loopStart = transportTime(0);
    this.transport.loopEnd = transportTime(this.composition.bars * 384);
    this.transport.loop = true;
    this.transport.start();
    this.emitTransport();
  }

  stop(): void {
    for (const id of this.pending) this.transport.clear(id);
    this.pending.clear();
    for (const id of this.performanceEvents) this.transport.clear(id);
    this.performanceEvents.clear();
    this.transport.stop();
    this.transport.ticks = 0;
    this.loopRounds = 0;
    this.lastLoopTick = 0;
    for (const source of this.soundingSources.keys()) source.dispose();
    this.soundingSources.clear();
    this.emitTransport();
  }

  armRecord(enabled: boolean): void {
    this.armed = enabled;
  }

  audition(sampleId: string): void {
    if (this.disposed) return;
    const sample = sampleById(sampleId);
    const buffer = this.buffers.get(sampleId);
    if (!sample || !buffer) return;
    void this.unlock().then(() => {
      if (this.disposed) return;
      const source =
        sample.kind === 'loop'
          ? new Tone.GrainPlayer({ url: buffer, loop: true, grainSize: 0.1, overlap: 0.02 })
          : new Tone.Player(buffer);
      source.connect(this.limiter);
      this.trackSource(source, `audition-${sampleId}`);
      if (sample.kind === 'loop') {
        source.playbackRate = 1;
        source.start(undefined, 0, buffer.duration);
        source.stop(`+${buffer.duration}`);
      } else {
        source.start();
      }
    });
  }

  setTrackControls(trackId: string, controls: TrackControls): void {
    if (!this.composition) return;
    this.composition = {
      ...this.composition,
      tracks: this.composition.tracks.map((track) =>
        track.id === trackId ? { ...track, controls } : track,
      ),
    };
    this.applyTrackControlValues();
    const track = this.composition.tracks.find((candidate) => candidate.id === trackId);
    if (!track) return;
    const sample = sampleById(track.sampleId);
    if (!sample?.rootPitchClass) return;
    const normalized = shortestSemitoneInterval(
      sample.rootPitchClass,
      this.composition.challenge.key.root,
    );
    for (const [source, sourceTrackId] of this.soundingSources) {
      if (sourceTrackId === trackId && source instanceof Tone.GrainPlayer)
        source.detune = (normalized + controls.tuneSemitones) * 100;
    }
  }
  absoluteTick(): number {
    const tick = this.transport.ticks;
    if (this.transport.loop && tick < this.lastLoopTick) this.loopRounds += 1;
    this.lastLoopTick = tick;
    return this.loopRounds * (this.composition?.bars ?? 1) * 384 + tick;
  }

  scheduleNextBar(onCommit: (tick: number) => void): Unsubscribe {
    const minimumTick = Math.floor(this.absoluteTick() / 384 + 1) * 384;
    let cancelled = false;
    const id = this.transport.scheduleRepeat(
      (time) => {
        const tick = Math.round(this.absoluteTick() / 384) * 384;
        if (cancelled || tick < minimumTick) return;
        this.transport.clear(id);
        this.pending.delete(id);
        Tone.getDraw().schedule(() => {
          if (!cancelled) onCommit(tick);
        }, time);
      },
      transportTime(384),
      transportTime(0),
    );
    this.pending.add(id);
    return () => {
      cancelled = true;
      this.transport.clear(id);
      this.pending.delete(id);
    };
  }

  scheduleTrackControls(
    trackId: string,
    controls: Partial<TrackControls>,
    onCommit: (tick: number) => void,
  ): Unsubscribe {
    const minimumTick = Math.floor(this.absoluteTick() / 384 + 1) * 384;
    let cancelled = false;
    const id = this.transport.scheduleRepeat(
      (time) => {
        const tick = Math.round(this.absoluteTick() / 384) * 384;
        if (cancelled || tick < minimumTick) return;
        this.transport.clear(id);
        this.pending.delete(id);
        if (!this.composition?.tracks.some((track) => track.id === trackId)) return;
        this.composition = {
          ...this.composition,
          tracks: this.composition.tracks.map((track) =>
            track.id === trackId
              ? { ...track, controls: { ...track.controls, ...controls } }
              : track,
          ),
        };
        this.applyTrackControlValues(time);
        Tone.getDraw().schedule(() => {
          if (!cancelled) onCommit(tick);
        }, time);
      },
      transportTime(384),
      transportTime(0),
    );
    this.pending.add(id);
    return () => {
      cancelled = true;
      this.transport.clear(id);
      this.pending.delete(id);
    };
  }

  playPerformance(performance: PerformanceV1): void {
    this.stop();
    this.setComposition(performance.composition);
    this.transport.bpm.value = performance.composition.challenge.bpm;
    this.transport.loop = false;
    const controls = new Map(
      performance.composition.tracks.map((track) => [track.id, { ...track.controls }]),
    );
    for (const event of performance.events) {
      const id = this.transport.scheduleOnce((time) => {
        const next = controls.get(event.trackId);
        if (!next) return;
        next[event.kind === 'mute' ? 'muted' : 'solo'] = event.value;
        const soloed = [...controls.values()].some((value) => value.solo);
        for (const [trackId, values] of controls) {
          const gain = this.nodes.get(trackId)?.gain.gain;
          gain?.setValueAtTime(
            values.muted || (soloed && !values.solo) ? 0 : 10 ** (values.gainDb / 20),
            time,
          );
        }
      }, transportTime(event.tick));
      this.performanceEvents.add(id);
    }
    const endId = this.transport.scheduleOnce((time) => {
      Tone.getDraw().schedule(() => this.stop(), time);
    }, transportTime(performance.durationTicks));
    this.performanceEvents.add(endId);
    this.transport.start();
    this.emitTransport();
  }

  subscribeTransport(listener: (snapshot: TransportSnapshot) => void): Unsubscribe {
    this.listeners.add(listener);
    listener({ playing: this.transport.state === 'started', tick: this.transport.ticks });
    return () => this.listeners.delete(listener);
  }

  debug(): {
    audioState: AudioContextState;
    transportTick: number;
    outputRms: number;
    activeVoiceCount: number;
  } {
    const waveform = this.analyser.getValue();
    let squared = 0;
    let frameCount = 0;
    const channelCount = waveform instanceof Float32Array ? 1 : waveform.length;
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const channel = waveform instanceof Float32Array ? waveform : waveform[channelIndex]!;
      for (const sample of channel) {
        squared += sample * sample;
        frameCount += 1;
      }
    }
    return {
      audioState: Tone.getContext().state,
      transportTick: this.transport.ticks,
      outputRms: frameCount === 0 ? 0 : Math.sqrt(squared / frameCount),
      activeVoiceCount: new Set(this.soundingSources.values()).size,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    this.transport.clear(this.transportListenerId);
    this.part?.dispose();
    this.part = undefined;
    for (const nodes of this.nodes.values()) {
      nodes.filter.dispose();
      nodes.panner.dispose();
      nodes.gain.dispose();
    }
    this.nodes.clear();
    for (const buffer of this.buffers.values()) buffer.dispose();
    this.buffers.clear();
    this.limiter.dispose();
    this.analyser.dispose();
    this.listeners.clear();
  }

  private emitTransport(): void {
    const snapshot = { playing: this.transport.state === 'started', tick: this.transport.ticks };
    for (const listener of this.listeners) listener(snapshot);
  }

  private synchronizeTrackNodes(composition: CompositionV1): void {
    const currentIds = new Set(composition.tracks.map((track) => track.id));
    for (const [trackId, nodes] of this.nodes) {
      if (!currentIds.has(trackId)) {
        nodes.filter.dispose();
        nodes.panner.dispose();
        nodes.gain.dispose();
        this.nodes.delete(trackId);
      }
    }
    for (const track of composition.tracks) {
      if (this.nodes.has(track.id)) continue;
      const filter = new Tone.Filter({ type: 'lowpass', frequency: track.controls.cutoffHz });
      const panner = new Tone.Panner(track.controls.pan);
      const gain = new Tone.Gain();
      filter.chain(panner, gain, this.limiter);
      this.nodes.set(track.id, { filter, panner, gain });
    }
    this.applyTrackControlValues();
  }

  private applyTrackControlValues(time?: number): void {
    if (!this.composition) return;
    const soloed = this.composition.tracks.some((track) => track.controls.solo);
    for (const track of this.composition.tracks) {
      const nodes = this.nodes.get(track.id);
      if (!nodes) continue;
      nodes.filter.frequency.value = track.controls.cutoffHz;
      nodes.panner.pan.value = track.controls.pan;
      const gain =
        track.controls.muted || (soloed && !track.controls.solo)
          ? 0
          : 10 ** (track.controls.gainDb / 20);
      if (time === undefined) nodes.gain.gain.value = gain;
      else nodes.gain.gain.setValueAtTime(gain, time);
    }
  }

  private rebuildPart(composition: CompositionV1): void {
    this.part?.dispose();
    const events: Array<[string, ScheduledEvent]> = composition.tracks.flatMap((track) =>
      track.clips.map(
        (clip) =>
          [transportTime(clip.startTick), { trackId: track.id, clip }] as [string, ScheduledEvent],
      ),
    );
    this.part = new Tone.Part((time, event) => this.playScheduledEvent(time, event), events);
    this.part.loop = true;
    this.part.loopStart = transportTime(0);
    this.part.loopEnd = transportTime(composition.bars * 384);
    this.part.start(transportTime(0));
  }

  private playScheduledEvent(time: number, event: ScheduledEvent): void {
    const composition = this.composition;
    if (!composition) return;
    const track = composition.tracks.find((candidate) => candidate.id === event.trackId);
    const nodes = this.nodes.get(event.trackId);
    const sample = track && sampleById(track.sampleId);
    const buffer = sample && this.buffers.get(sample.id);
    if (!track || !nodes || !sample || !buffer) return;

    if (event.clip.kind === 'loop' && sample.kind === 'loop' && sample.sourceBpm) {
      const source = new Tone.GrainPlayer({
        url: buffer,
        loop: true,
        grainSize: 0.1,
        overlap: 0.02,
      });
      const normalized = sample.rootPitchClass
        ? shortestSemitoneInterval(sample.rootPitchClass, composition.challenge.key.root)
        : 0;
      source.playbackRate = composition.challenge.bpm / sample.sourceBpm;
      source.detune = (normalized + track.controls.tuneSemitones) * 100;
      source.connect(nodes.filter);
      this.trackSource(source, track.id);
      const offsetSeconds =
        (event.clip.sourceOffsetTick * 60) / (TICKS_PER_QUARTER * sample.sourceBpm);
      const durationSeconds =
        (event.clip.lengthTicks * 60) / (TICKS_PER_QUARTER * composition.challenge.bpm);
      source.start(time, offsetSeconds, durationSeconds);
      source.stop(time + durationSeconds);
      return;
    }

    if (event.clip.kind === 'hit' && sample.kind === 'one-shot') {
      const strikeSeconds =
        ((TICKS_PER_QUARTER / 4 / event.clip.ratchet) * 60) /
        (TICKS_PER_QUARTER * composition.challenge.bpm);
      for (let index = 0; index < event.clip.ratchet; index += 1) {
        const source = new Tone.Player(buffer);
        source.playbackRate = 2 ** (track.controls.tuneSemitones / 12);
        source.connect(nodes.filter);
        this.trackSource(source, track.id);
        source.start(time + index * strikeSeconds);
      }
    }
  }

  private trackSource(source: SoundingSource, trackId: string): void {
    this.soundingSources.set(source, trackId);
    source.onstop = () => {
      this.soundingSources.delete(source);
      source.dispose();
    };
  }
}
