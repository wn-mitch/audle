import * as Tone from 'tone';
import { sampleById } from '../data/samples';
import { shortestSemitoneInterval } from '../domain/challenge';
import { HANDOFF_SECONDS, handoffLoop, handoffTrack } from './handoff';
import {
  TICKS_PER_QUARTER,
  type ChallengeSnapshot,
  type Clip,
  type CompositionV1,
  type Track,
  type TrackControls,
} from '../domain/model';
import type { PerformanceV1 } from '../domain/performance';

export type Unsubscribe = () => void;
export interface TransportSnapshot {
  playing: boolean;
  tick: number;
}

/** A sound the engine has just started, delivered on the animation frame nearest its audio time. */
export interface HitEvent {
  /** Absent for auditions, which play a sample outside any track. */
  trackId?: string;
  sampleId: string;
  kind: 'hit' | 'loop' | 'audition';
  tick: number;
  time: number;
}

export interface AudioEngine {
  unlock(): Promise<void>;
  loadChallenge(challenge: ChallengeSnapshot): Promise<void>;
  setComposition(composition: CompositionV1): void;
  play(): void;
  stop(): void;
  armRecord(enabled: boolean): void;
  audition(sampleId: string): void;
  sourceDurationSeconds(sampleId: string): number | undefined;
  /** Post-gain samples for one isolated track. Undefined means the track has no signal path. */
  trackWaveform(trackId: string): Float32Array | undefined;
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
  /** Listeners run on the animation frame closest to the sound, not when it was scheduled. */
  subscribeHits(listener: (hit: HitEvent) => void): Unsubscribe;
  /** The transport position right now, for frame-rate readouts between transport snapshots. */
  currentTick(): number;
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
  fuzz?: Tone.Distortion;
  space?: Tone.Reverb;
  echo?: Tone.FeedbackDelay;
  gain: Tone.Gain;
  analyser: Tone.Analyser;
};

const disposeTrackNodes = (nodes: TrackNodes): void => {
  nodes.filter.dispose();
  nodes.panner.dispose();
  nodes.fuzz?.dispose();
  nodes.space?.dispose();
  nodes.echo?.dispose();
  nodes.gain.dispose();
  nodes.analyser.dispose();
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
  private readonly hitListeners = new Set<(hit: HitEvent) => void>();
  /** Mute and solo state while a take replays, which the composition does not reflect. */
  private performanceControls: Map<string, TrackControls> | undefined;
  private readonly buffers = new Map<string, Tone.ToneAudioBuffer>();
  private readonly nodes = new Map<string, TrackNodes>();
  private readonly soundingSources = new Map<
    SoundingSource,
    { trackId: string; envelope?: Tone.Gain }
  >();
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
    // The callback runs a lookahead early; the snapshot waits for the frame the audio reaches.
    this.transportListenerId = this.transport.scheduleRepeat((time) => {
      const tick = this.transport.getTicksAtTime(time);
      Tone.getDraw().schedule(() => this.emitTransport(tick), time);
    }, transportTime(24));
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
    this.performanceControls = undefined;
    Tone.getDraw().cancel();
    this.transport.stop();
    this.transport.ticks = 0;
    this.loopRounds = 0;
    this.lastLoopTick = 0;
    for (const [source, { envelope }] of this.soundingSources) {
      source.dispose();
      envelope?.dispose();
    }
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
      const now = Tone.now();
      this.announceHit(now, { sampleId, kind: 'audition', tick: this.transport.ticks, time: now });
      if (sample.kind === 'loop') {
        source.playbackRate = 1;
        source.start(undefined, 0, buffer.duration);
        source.stop(`+${buffer.duration}`);
      } else {
        source.start();
      }
    });
  }

  sourceDurationSeconds(sampleId: string): number | undefined {
    return this.buffers.get(sampleId)?.duration;
  }
  trackWaveform(trackId: string): Float32Array | undefined {
    const analyser = this.nodes.get(trackId)?.analyser;
    if (!analyser) return undefined;
    const value = analyser.getValue();
    return value instanceof Float32Array ? value : value[0]!;
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
    for (const [source, { trackId: sourceTrackId }] of this.soundingSources) {
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
    this.performanceControls = controls;
    for (const event of performance.events) {
      const id = this.transport.scheduleOnce((time) => {
        const next = controls.get(event.trackId);
        if (!next) return;
        next[event.kind === 'mute' ? 'muted' : 'solo'] = event.value;
        const soloed = [...controls.values()].some((value) => value.solo);
        for (const [trackId, values] of controls) {
          const gain = this.nodes.get(trackId)?.gain;
          if (gain)
            handoffTrack(
              gain,
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

  subscribeHits(listener: (hit: HitEvent) => void): Unsubscribe {
    this.hitListeners.add(listener);
    return () => this.hitListeners.delete(listener);
  }

  currentTick(): number {
    return this.transport.ticks;
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
      activeVoiceCount: new Set([...this.soundingSources.values()].map(({ trackId }) => trackId))
        .size,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    this.transport.clear(this.transportListenerId);
    this.part?.dispose();
    this.part = undefined;
    for (const nodes of this.nodes.values()) disposeTrackNodes(nodes);
    this.nodes.clear();
    for (const buffer of this.buffers.values()) buffer.dispose();
    this.buffers.clear();
    this.limiter.dispose();
    this.analyser.dispose();
    this.listeners.clear();
    this.hitListeners.clear();
  }

  private emitTransport(tick: number = this.transport.ticks): void {
    const playing = this.transport.state === 'started';
    const snapshot = { playing, tick: playing ? tick : this.transport.ticks };
    for (const listener of this.listeners) listener(snapshot);
  }

  /** Tells hit listeners about a sound on the frame it becomes audible. Silent tracks stay silent. */
  private announceHit(time: number, hit: HitEvent, track?: Track): void {
    if (this.hitListeners.size === 0 || this.disposed) return;
    if (track && !this.isAudible(track)) return;
    Tone.getDraw().schedule(() => {
      if (this.disposed) return;
      for (const listener of this.hitListeners) listener(hit);
    }, time);
  }

  private isAudible(track: Track): boolean {
    const controlsFor = (candidate: Track) =>
      this.performanceControls?.get(candidate.id) ?? candidate.controls;
    const soloed = (this.composition?.tracks ?? []).some(
      (candidate) => controlsFor(candidate).solo,
    );
    const controls = controlsFor(track);
    return !(controls.muted || (soloed && !controls.solo));
  }

  private synchronizeTrackNodes(composition: CompositionV1): void {
    const currentIds = new Set(composition.tracks.map((track) => track.id));
    for (const [trackId, nodes] of this.nodes) {
      if (!currentIds.has(trackId)) {
        disposeTrackNodes(nodes);
        this.nodes.delete(trackId);
      }
    }
    for (const track of composition.tracks) {
      if (this.nodes.has(track.id)) continue;
      const filter = new Tone.Filter({ type: 'lowpass', frequency: track.controls.cutoffHz });
      const panner = new Tone.Panner(track.controls.pan);
      const gain = new Tone.Gain();
      const analyser = new Tone.Analyser('waveform', 256);
      filter.chain(panner, gain, analyser, this.limiter);
      this.nodes.set(track.id, { filter, panner, gain, analyser });
    }
    this.applyTrackControlValues();
  }

  private applyTrackControlValues(time?: number): void {
    if (!this.composition) return;
    const soloed = this.composition.tracks.some((track) => track.controls.solo);
    for (const track of this.composition.tracks) {
      const nodes = this.nodes.get(track.id);
      if (!nodes) continue;
      this.configureTrackEffects(nodes, track.controls);
      nodes.filter.frequency.value = track.controls.cutoffHz;
      nodes.panner.pan.value = track.controls.pan;
      if (nodes.fuzz) {
        nodes.fuzz.distortion = track.controls.fuzz;
        if (time === undefined) nodes.fuzz.wet.value = track.controls.fuzz === 0 ? 0 : 1;
        else nodes.fuzz.wet.setValueAtTime(track.controls.fuzz === 0 ? 0 : 1, time);
      }
      if (time === undefined) {
        if (nodes.space) nodes.space.wet.value = track.controls.space;
        if (nodes.echo) nodes.echo.wet.value = track.controls.echo;
      } else {
        nodes.space?.wet.setValueAtTime(track.controls.space, time);
        nodes.echo?.wet.setValueAtTime(track.controls.echo, time);
      }
      const gain =
        track.controls.muted || (soloed && !track.controls.solo)
          ? 0
          : 10 ** (track.controls.gainDb / 20);
      if (time === undefined) nodes.gain.gain.value = gain;
      else handoffTrack(nodes.gain, gain, time);
    }
  }

  /** Effects stay absent until used; a dry default track avoids unnecessary processors and IRs. */
  private configureTrackEffects(nodes: TrackNodes, controls: TrackControls): void {
    let rewired = false;
    if (controls.fuzz > 0 && !nodes.fuzz) {
      nodes.fuzz = new Tone.Distortion({
        distortion: controls.fuzz,
        oversample: '2x',
        wet: 1,
      });
      rewired = true;
    }
    if (controls.space > 0 && !nodes.space) {
      nodes.space = new Tone.Reverb({ decay: 2.8, preDelay: 0.015 });
      rewired = true;
    }
    if (controls.echo > 0 && !nodes.echo) {
      nodes.echo = new Tone.FeedbackDelay({ delayTime: '8n', feedback: 0.35 });
      rewired = true;
    }
    if (!rewired) return;

    nodes.panner.disconnect();
    nodes.fuzz?.disconnect();
    nodes.space?.disconnect();
    nodes.echo?.disconnect();
    nodes.gain.disconnect();
    nodes.analyser.disconnect();
    const effects = [nodes.fuzz, nodes.space, nodes.echo].filter(
      (node): node is Tone.Distortion | Tone.Reverb | Tone.FeedbackDelay => node !== undefined,
    );
    nodes.panner.chain(...effects, nodes.gain, nodes.analyser, this.limiter);
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
      const envelope = new Tone.Gain(0);
      source.chain(envelope, nodes.filter);
      const offsetSeconds =
        (event.clip.sourceOffsetTick * 60) / (TICKS_PER_QUARTER * sample.sourceBpm);
      const durationSeconds =
        (event.clip.lengthTicks * 60) / (TICKS_PER_QUARTER * composition.challenge.bpm);
      this.trackSource(source, track.id, envelope, time + durationSeconds + HANDOFF_SECONDS);
      this.announceHit(
        time,
        { trackId: track.id, sampleId: sample.id, kind: 'loop', tick: event.clip.startTick, time },
        track,
      );
      handoffLoop(envelope, time, durationSeconds);
      source.start(time, offsetSeconds, durationSeconds + HANDOFF_SECONDS);
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
        const strikeTime = time + index * strikeSeconds;
        this.announceHit(
          strikeTime,
          {
            trackId: track.id,
            sampleId: sample.id,
            kind: 'hit',
            tick: event.clip.startTick + (index * TICKS_PER_QUARTER) / 4 / event.clip.ratchet,
            time: strikeTime,
          },
          track,
        );
        source.start(strikeTime);
      }
    }
  }

  private trackSource(
    source: SoundingSource,
    trackId: string,
    envelope?: Tone.Gain,
    retireAt?: number,
  ): void {
    this.soundingSources.set(source, { trackId, envelope });
    source.onstop = () => {
      const retire = () => {
        if (!this.soundingSources.delete(source)) return;
        source.dispose();
        envelope?.dispose();
      };
      // GrainPlayer reports its stop from Tone's lookahead clock, before the audio reaches the
      // 10ms fade. Retiring on the draw clock keeps the outgoing grain audible until it ends.
      if (retireAt === undefined) retire();
      else Tone.getDraw().schedule(retire, retireAt);
    };
  }
}
