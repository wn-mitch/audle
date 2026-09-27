import { SvelteMap } from 'svelte/reactivity';
import {
  AssetLoadError,
  type AudioEngine,
  type HitEvent,
  type TransportSnapshot,
  type Unsubscribe,
} from '../audio/engine';
import { sampleById } from '../data/samples';
import {
  TICKS_PER_BAR,
  TICKS_PER_SIXTEENTH,
  type ChallengeSnapshot,
  type Clip,
  type CompositionV1,
  type TrackControls,
} from '../domain/model';
import { offsetLivePattern, patternOf, setLivePattern, type LivePattern } from '../domain/live';
import {
  MAX_PERFORMANCE_BARS,
  MAX_PERFORMANCE_EVENTS,
  validatePerformance,
  type PerformanceEvent,
  type PerformanceV1,
} from '../domain/performance';
import {
  changeBars,
  cloneSelectedVoice,
  createDailyDraft,
  deleteLayer,
  deleteSelection,
  duplicateSelection,
  fillTracks,
  moveSelection,
  nudgeSelection,
  placeLoop,
  recordHit,
  renameTrack,
  repeatSelectionToEnd,
  resizeLoop,
  setSelectedRatchet,
  setTrackControls,
  splitSelectedAt,
  toggleLoopClip,
  type OperationResult,
} from '../domain/operations';
import { jamRequestFor, placementsFromAnswers, type JevAnswers } from '../jev/jam';
import {
  loadDraft,
  loadPerformance,
  saveDraft,
  savePerformance,
  clearPerformance,
} from './persistence';

const MAX_UNDO_ENTRIES = 100;
const withoutQueuedTrack = (
  queued: Record<string, boolean>,
  trackId: string,
): Record<string, boolean> => {
  const remaining = { ...queued };
  delete remaining[trackId];
  return remaining;
};

/** Desktop layouts (the same breakpoint as the stacked phone layout) start with a four-bar loop. */
const defaultBars = (): CompositionV1['bars'] =>
  typeof matchMedia === 'function' && matchMedia('(min-width: 960px)').matches ? 4 : 2;

/** Asks the `/api/jev` endpoint to choose patterns. Rejects when Jev is unreachable. */
export type JevClient = (
  request: NonNullable<ReturnType<typeof jamRequestFor>>,
) => Promise<JevAnswers>;

export const fetchJev: JevClient = async (request) => {
  const response = await fetch('/api/jev', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(`Jev request failed with ${response.status}`);
  const body = (await response.json()) as { answers?: JevAnswers };
  if (!body.answers) throw new Error('Jev response had no answers');
  return body.answers;
};

export class EditorState {
  composition = $state.raw<CompositionV1>({} as CompositionV1);
  selectedClipIds = $state<string[]>([]);
  selectedTrackId = $state<string | undefined>(undefined);
  playheadTick = $state(0);
  playing = $state(false);
  recording = $state(false);
  loading = $state(true);
  loadingError = $state<string | undefined>(undefined);
  failedSampleId = $state<string | undefined>(undefined);
  notice = $state<string | undefined>(undefined);
  tweakOpen = $state(false);
  jamming = $state(false);
  /** The pattern Jev chose per track in the latest jam, cleared by the next edit. */
  jamPicks = $state<Record<string, string>>({});
  queuedLive = $state<Record<string, boolean>>({});
  queuedSolo = $state<Record<string, boolean>>({});
  captureStatus = $state<'idle' | 'count-in' | 'recording'>('idle');
  performance = $state.raw<PerformanceV1 | undefined>(undefined);
  playingPerformance = $state(false);
  private pendingLive = new SvelteMap<string, Unsubscribe>();
  private pendingCapture: Unsubscribe | undefined;
  private captureStartTick = 0;
  private captureBaseline: CompositionV1 | undefined;
  private captureEvents: PerformanceEvent[] = [];
  private captureHistory: { undo: CompositionV1[]; redo: CompositionV1[] } | undefined;

  // Reactive so the transport's Undo and Redo buttons follow every edit on their own.
  private undoStack = $state.raw<CompositionV1[]>([]);
  private redoStack = $state.raw<CompositionV1[]>([]);
  private saveTimer: number | undefined;
  private controlBaseline: CompositionV1 | undefined;
  private readonly unsubscribeTransport: Unsubscribe;

  constructor(
    private readonly engine: AudioEngine,
    readonly challenge: ChallengeSnapshot,
    initialComposition?: CompositionV1,
    private readonly jev: JevClient = fetchJev,
    private readonly random: () => number = Math.random,
  ) {
    this.composition =
      initialComposition ?? loadDraft(challenge.date) ?? createDailyDraft(challenge, defaultBars());
    this.selectedTrackId = this.composition.tracks[0]?.id;
    this.unsubscribeTransport = engine.subscribeTransport((snapshot) =>
      this.updateTransport(snapshot),
    );
    engine.setComposition(this.composition);
    this.performance = loadPerformance(challenge.date);
  }

  /** Hit events are delivered outside Svelte state: they fire per sound, and a state write per
   * sound would re-render every consumer. Subscribers animate the element directly. */
  subscribeHits(listener: (hit: HitEvent) => void): Unsubscribe {
    return this.engine.subscribeHits(listener);
  }

  /** The live transport tick, for frame-rate readouts between snapshots. */
  currentTick(): number {
    return this.engine.currentTick();
  }

  get selectedTrack() {
    return this.composition.tracks.find((track) => track.id === this.selectedTrackId);
  }

  sourceDurationSeconds(sampleId: string): number | undefined {
    return this.engine.sourceDurationSeconds(sampleId);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get selectedClips(): Clip[] {
    return this.composition.tracks.flatMap((track) =>
      track.clips.filter((clip) => this.selectedClipIds.includes(clip.id)),
    );
  }

  get selectedTrackIds(): string[] {
    return this.composition.tracks
      .filter((track) => track.clips.some((clip) => this.selectedClipIds.includes(clip.id)))
      .map((track) => track.id);
  }
  livePattern(trackId: string): LivePattern | 'custom' | 'empty' {
    const track = this.composition.tracks.find((candidate) => candidate.id === trackId);
    return track ? patternOf(this.composition, track) : 'empty';
  }

  liveStatus(trackId: string): 'empty' | 'off' | 'on' | 'queued-on' | 'queued-off' {
    const queued = this.queuedLive[trackId];
    if (queued !== undefined) return queued ? 'queued-off' : 'queued-on';
    const track = this.composition.tracks.find((candidate) => candidate.id === trackId);
    return !track?.clips.length ? 'empty' : track.controls.muted ? 'off' : 'on';
  }

  async toggleLive(trackId: string): Promise<void> {
    const track = this.composition.tracks.find((candidate) => candidate.id === trackId);
    if (!track || this.loading || this.loadingError || this.playingPerformance) return;
    this.selectedTrackId = trackId;
    if (!track.clips.length) {
      if (this.captureStatus === 'recording') {
        this.notice = 'Add a pattern before capturing. Your take is unchanged.';
        return;
      }
      this.apply(setLivePattern(this.composition, trackId, 'steady'));
      if (this.playing) {
        this.queuedLive = { ...this.queuedLive, [trackId]: false };
        this.pendingLive.set(
          `${trackId}:add`,
          this.engine.scheduleNextBar(() => {
            this.pendingLive.delete(`${trackId}:add`);
            this.queuedLive = withoutQueuedTrack(this.queuedLive, trackId);
          }),
        );
      }
      try {
        await this.engine.unlock();
        if (!this.playing) this.engine.play();
      } catch {
        this.notice = 'Audio could not start. Tap the sound again to retry.';
      }
      return;
    }
    const queued = this.queuedLive[trackId];
    const muted = queued ?? track.controls.muted;
    const next = !muted;
    this.pendingLive.get(`${trackId}:mute`)?.();
    this.pendingLive.get(`${trackId}:add`)?.();
    this.pendingLive.delete(`${trackId}:add`);
    this.pendingLive.delete(`${trackId}:mute`);
    if (queued !== undefined && next === track.controls.muted) {
      this.queuedLive = withoutQueuedTrack(this.queuedLive, trackId);
      return;
    }
    if (!this.playing) {
      this.commitLiveControl(trackId, 'muted', next, 0);
      try {
        await this.engine.unlock();
        this.engine.play();
      } catch {
        this.notice = 'Audio could not start. Tap the sound again to retry.';
      }
      return;
    }
    this.queuedLive = { ...this.queuedLive, [trackId]: next };
    this.pendingLive.set(
      `${trackId}:mute`,
      this.engine.scheduleTrackControls(trackId, { muted: next }, (tick) => {
        this.pendingLive.delete(`${trackId}:mute`);
        this.queuedLive = withoutQueuedTrack(this.queuedLive, trackId);
        this.commitLiveControl(trackId, 'muted', next, tick);
      }),
    );
  }

  chooseLivePattern(trackId: string, pattern: LivePattern): void {
    if (this.captureStatus !== 'idle' || this.playingPerformance) {
      this.notice = 'Finish the take before changing a pattern.';
      return;
    }
    this.pendingLive.get(`${trackId}:mute`)?.();
    this.pendingLive.delete(`${trackId}:mute`);
    this.pendingLive.get(`${trackId}:add`)?.();
    this.pendingLive.delete(`${trackId}:add`);
    this.queuedLive = withoutQueuedTrack(this.queuedLive, trackId);
    this.selectedTrackId = trackId;
    this.apply(setLivePattern(this.composition, trackId, pattern));
  }

  /** Shifts the sound's pattern one step later or earlier. Refused during a take, like a feel change. */
  offsetLivePattern(trackId: string, direction: -1 | 1): void {
    if (this.captureStatus !== 'idle' || this.playingPerformance) {
      this.notice = 'Finish the take before changing a pattern.';
      return;
    }
    this.selectedTrackId = trackId;
    this.apply(offsetLivePattern(this.composition, trackId, direction));
  }

  toggleLiveSolo(trackId: string): void {
    const track = this.composition.tracks.find((candidate) => candidate.id === trackId);
    if (!track || this.captureStatus === 'count-in' || this.playingPerformance) return;
    const queued = this.queuedSolo[trackId];
    const next = !(queued ?? track.controls.solo);
    this.pendingLive.get(`${trackId}:solo`)?.();
    this.pendingLive.delete(`${trackId}:solo`);
    if (queued !== undefined && next === track.controls.solo) {
      this.queuedSolo = withoutQueuedTrack(this.queuedSolo, trackId);
      return;
    }
    if (!this.playing) {
      this.commitLiveControl(trackId, 'solo', next, 0);
      return;
    }
    this.queuedSolo = { ...this.queuedSolo, [trackId]: next };
    this.pendingLive.set(
      `${trackId}:solo`,
      this.engine.scheduleTrackControls(trackId, { solo: next }, (tick) => {
        this.pendingLive.delete(`${trackId}:solo`);
        this.queuedSolo = withoutQueuedTrack(this.queuedSolo, trackId);
        this.commitLiveControl(trackId, 'solo', next, tick);
      }),
    );
  }

  async startCapture(): Promise<void> {
    if (
      this.captureStatus !== 'idle' ||
      this.loading ||
      this.loadingError ||
      this.playingPerformance ||
      !this.composition.tracks.some((track) => track.clips.length)
    )
      return;
    try {
      await this.engine.unlock();
      if (!this.playing) this.engine.play();
      this.captureStatus = 'count-in';
      this.pendingCapture = this.engine.scheduleNextBar((tick) => {
        this.pendingCapture = undefined;
        this.captureStartTick = tick;
        this.captureBaseline = structuredClone(this.composition);
        this.captureHistory = { undo: this.undoStack, redo: this.redoStack };
        this.captureEvents = [];
        this.captureStatus = 'recording';
      });
    } catch {
      this.notice = 'Audio could not start. Capture was not created.';
    }
  }

  stopCapture(): void {
    if (this.captureStatus === 'count-in') {
      this.pendingCapture?.();
      this.pendingCapture = undefined;
      this.captureStatus = 'idle';
      return;
    }
    if (this.captureStatus !== 'recording' || !this.captureBaseline) return;
    const durationTicks = Math.min(
      MAX_PERFORMANCE_BARS * TICKS_PER_BAR,
      Math.max(
        TICKS_PER_BAR,
        Math.ceil((this.engine.absoluteTick() - this.captureStartTick) / TICKS_PER_SIXTEENTH) *
          TICKS_PER_SIXTEENTH,
      ),
    );
    const performance = validatePerformance({
      version: 1,
      composition: this.captureBaseline,
      durationTicks,
      events: this.captureEvents.filter((event) => event.tick < durationTicks),
    });
    this.captureStatus = 'idle';
    const baseline = this.captureBaseline;
    this.captureBaseline = undefined;
    for (const cancel of this.pendingLive.values()) cancel();
    this.pendingLive.clear();
    this.queuedLive = {};
    this.queuedSolo = {};
    if (this.captureHistory) {
      this.undoStack = this.captureHistory.undo;
      this.redoStack = this.captureHistory.redo;
      this.captureHistory = undefined;
    }
    this.replaceComposition(baseline);
    if (!performance) {
      this.notice = 'That take could not be saved. The loop is unchanged.';
      return;
    }
    this.performance = performance;
    if (!savePerformance(performance))
      this.notice = 'This take could not be saved in this browser.';
  }

  discardCapture(): void {
    if (this.captureStatus !== 'idle') this.stopCapture();
    this.performance = undefined;
    clearPerformance(this.challenge.date);
  }

  async playCapture(): Promise<void> {
    if (!this.performance || this.loading || this.loadingError) return;
    if (this.playingPerformance) {
      this.stopCapturePlayback();
      return;
    }
    try {
      await this.engine.unlock();
      this.engine.playPerformance(this.performance);
      this.playingPerformance = true;
    } catch {
      this.playingPerformance = false;
      this.notice = 'This take could not play.';
    }
  }

  stopCapturePlayback(): void {
    this.engine.stop();
    this.playingPerformance = false;
    this.engine.setComposition(this.composition);
  }

  private commitLiveControl(
    trackId: string,
    kind: 'muted' | 'solo',
    value: boolean,
    tick: number,
  ): void {
    const track = this.composition.tracks.find((candidate) => candidate.id === trackId);
    if (!track) return;
    this.apply(setTrackControls(this.composition, trackId, { ...track.controls, [kind]: value }));
    if (this.captureStatus === 'recording' && tick >= this.captureStartTick) {
      if (this.captureEvents.length >= MAX_PERFORMANCE_EVENTS) {
        this.stopCapture();
        this.notice = 'Take saved at the performance limit.';
      } else {
        this.captureEvents.push({
          tick: tick - this.captureStartTick,
          trackId,
          kind: kind === 'muted' ? 'mute' : 'solo',
          value,
        });
      }
    }
  }

  async loadAudio(): Promise<void> {
    this.loading = true;
    this.loadingError = undefined;
    this.failedSampleId = undefined;
    try {
      await this.engine.loadChallenge(this.challenge);
      this.engine.setComposition(this.composition);
    } catch (error) {
      this.loadingError = error instanceof Error ? error.message : 'A daily sound could not load.';
      this.failedSampleId = error instanceof AssetLoadError ? error.sampleId : undefined;
    } finally {
      this.loading = false;
    }
  }

  retryAudio(): void {
    void this.loadAudio();
  }

  async togglePlayback(): Promise<void> {
    if (this.loading || this.loadingError) return;
    if (this.playing) {
      this.stopPlayback();
      return;
    }
    await this.engine.unlock();
    this.engine.setComposition(this.composition);
    this.engine.play();
  }
  stopPlayback(): void {
    if (this.captureStatus !== 'idle') this.stopCapture();
    for (const cancel of this.pendingLive.values()) cancel();
    this.pendingLive.clear();
    this.queuedLive = {};
    this.queuedSolo = {};
    this.engine.stop();
    this.playingPerformance = false;
    this.engine.setComposition(this.composition);
  }

  async toggleRecording(): Promise<void> {
    if (this.loading || this.loadingError) return;
    const next = !this.recording;
    if (next) await this.engine.unlock();
    this.recording = next;
    this.engine.armRecord(next);
  }

  /** Auditions the selected source without adding or changing a clip. */
  auditionSelected(): void {
    const track = this.selectedTrack;
    if (
      !track ||
      this.loading ||
      this.loadingError ||
      this.playing ||
      this.playingPerformance ||
      this.recording ||
      this.captureStatus !== 'idle'
    )
      return;
    this.engine.audition(track.sampleId);
  }

  pressPad(sampleId: string): void {
    const sample = sampleById(sampleId);
    if (!sample || this.loading || this.loadingError) return;
    this.engine.audition(sampleId);
    const matchingTrack =
      this.composition.tracks.find(
        (track) => track.id === this.selectedTrackId && track.sampleId === sampleId,
      ) ?? this.composition.tracks.find((track) => track.sampleId === sampleId);
    if (!matchingTrack) return;
    this.selectedTrackId = matchingTrack.id;
    if (!this.recording) return;
    this.apply(
      sample.kind === 'one-shot'
        ? recordHit(this.composition, matchingTrack.id, this.playheadTick)
        : toggleLoopClip(this.composition, matchingTrack.id, this.playheadTick),
    );
  }

  /** Click-to-place: toggles a hit on the clicked sixteenth, or a loop at the clicked bar. */
  placeAt(trackId: string, tick: number): void {
    const track = this.composition.tracks.find((candidate) => candidate.id === trackId);
    const sample = track && sampleById(track.sampleId);
    if (!track || !sample || this.loading || this.loadingError) return;
    this.selectedTrackId = trackId;
    this.setPlayhead(tick);
    if (sample.kind === 'one-shot') {
      this.engine.audition(sample.id);
      this.apply(recordHit(this.composition, trackId, tick));
    } else {
      this.apply(placeLoop(this.composition, trackId, tick));
    }
  }

  /** Asks Jev to fill every empty base track. The whole jam is one undoable edit. */
  async jamWithJev(vibe: string): Promise<void> {
    if (this.jamming || this.loading) return;
    const request = jamRequestFor(this.composition, vibe);
    if (!request) {
      this.notice = 'Every track already has something. Clear one to let Jev jam.';
      return;
    }
    this.jamming = true;
    try {
      const answers = await this.jev(request);
      const { placements, picks } = placementsFromAnswers(this.composition, answers, this.random);
      const result = fillTracks(this.composition, placements);
      if (!result.ok) {
        this.notice = result.reason;
        return;
      }
      this.apply(result);
      this.jamPicks = picks;
      const filled = Object.keys(placements).length;
      this.notice =
        filled === 0
          ? 'Jev chose to leave the empty tracks resting. Try a vibe.'
          : `Jev filled ${filled} track${filled === 1 ? '' : 's'}. Undo to take it back.`;
    } catch {
      this.notice = 'Jev is offline. Your loop is unchanged.';
    } finally {
      this.jamming = false;
    }
  }

  setPlayhead(tick: number): void {
    const totalTicks = this.composition.bars * TICKS_PER_BAR;
    this.playheadTick = Math.max(
      0,
      Math.min(
        totalTicks - TICKS_PER_SIXTEENTH,
        Math.round(tick / TICKS_PER_SIXTEENTH) * TICKS_PER_SIXTEENTH,
      ),
    );
  }

  selectClip(clipId: string, additive = false): void {
    if (additive) {
      this.selectedClipIds = this.selectedClipIds.includes(clipId)
        ? this.selectedClipIds.filter((id) => id !== clipId)
        : [...this.selectedClipIds, clipId];
    } else {
      this.selectedClipIds = [clipId];
    }
    const track = this.composition.tracks.find((candidate) =>
      candidate.clips.some((clip) => clip.id === clipId),
    );
    if (track) this.selectedTrackId = track.id;
  }

  clearSelection(): void {
    this.selectedClipIds = [];
  }

  splitSelection(): void {
    this.apply(splitSelectedAt(this.composition, this.selectedClipIds, this.playheadTick));
  }

  fillSelection(): void {
    this.apply(repeatSelectionToEnd(this.composition, this.selectedClipIds));
  }

  duplicateSelection(): void {
    this.apply(duplicateSelection(this.composition, this.selectedClipIds));
  }

  deleteSelection(): void {
    this.apply(deleteSelection(this.composition, this.selectedClipIds), []);
  }

  nudgeSelection(direction: -1 | 1): void {
    this.apply(nudgeSelection(this.composition, this.selectedClipIds, direction));
  }

  moveSelection(deltaTicks: number): void {
    this.apply(moveSelection(this.composition, this.selectedClipIds, deltaTicks));
  }

  setRoll(ratchet: 1 | 2 | 3 | 4): void {
    this.apply(setSelectedRatchet(this.composition, this.selectedClipIds, ratchet));
  }

  addLayer(): void {
    const trackId = this.selectedTrackId;
    if (!trackId) {
      this.notice = 'Select one track to add a layer.';
      return;
    }
    const beforeTracks = this.composition.tracks.length;
    this.apply(cloneSelectedVoice(this.composition, trackId));
    if (this.composition.tracks.length === beforeTracks + 1) {
      const layer = this.composition.tracks.at(-1)!;
      this.selectedTrackId = layer.id;
      this.selectedClipIds = layer.clips.map((clip) => clip.id);
      this.tweakOpen = true;
    }
  }

  deleteSelectedLayer(): void {
    if (!this.selectedTrackId) return;
    const removed = this.selectedTrackId;
    this.apply(deleteLayer(this.composition, removed), []);
    if (!this.composition.tracks.some((track) => track.id === removed))
      this.selectedTrackId = this.composition.tracks[0]?.id;
  }

  setBars(bars: 1 | 2 | 3 | 4): void {
    this.apply(changeBars(this.composition, bars));
  }

  importComposition(composition: CompositionV1): void {
    if (composition.challenge.date !== this.challenge.date) {
      this.notice = 'That remix belongs to a different daily challenge.';
      return;
    }
    this.pushUndo(this.composition);
    this.redoStack = [];
    this.selectedClipIds = [];
    this.selectedTrackId = composition.tracks[0]?.id;
    this.replaceComposition(composition);
  }

  renameSelectedTrack(label: string): void {
    if (this.selectedTrackId)
      this.apply(renameTrack(this.composition, this.selectedTrackId, label));
  }

  resizeSelectedLoop(clipId: string, lengthTicks: number): void {
    if (this.selectedTrackId)
      this.apply(resizeLoop(this.composition, this.selectedTrackId, clipId, lengthTicks));
  }

  beginControlGesture(): void {
    this.controlBaseline ??= this.composition;
  }

  updateSelectedTrackControls(controls: TrackControls): void {
    if (!this.selectedTrackId) return;
    const before = this.composition;
    const result = setTrackControls(before, this.selectedTrackId, controls);
    if (!result.ok) {
      this.notice = result.reason;
      return;
    }
    this.composition = result.value;
    this.engine.setTrackControls(this.selectedTrackId, controls);
    this.engine.setComposition(this.composition);
    if (!this.controlBaseline) {
      this.pushUndo(before);
      this.redoStack = [];
      this.scheduleSave();
    }
  }

  endControlGesture(): void {
    if (!this.controlBaseline) return;
    if (this.controlBaseline !== this.composition) {
      this.pushUndo(this.controlBaseline);
      this.redoStack = [];
      this.scheduleSave();
    }
    this.controlBaseline = undefined;
  }

  undo(): void {
    const previous = this.undoStack.at(-1);
    if (!previous) return;
    this.undoStack = this.undoStack.slice(0, -1);
    this.redoStack = [...this.redoStack, this.composition];
    this.replaceComposition(previous);
  }

  redo(): void {
    const next = this.redoStack.at(-1);
    if (!next) return;
    this.redoStack = this.redoStack.slice(0, -1);
    this.pushUndo(this.composition);
    this.replaceComposition(next);
  }

  detach(): void {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    this.pendingCapture?.();
    for (const cancel of this.pendingLive.values()) cancel();
    this.pendingLive.clear();
    this.unsubscribeTransport();
  }

  destroy(): void {
    this.detach();
    this.engine.dispose();
  }

  private updateTransport(snapshot: TransportSnapshot): void {
    this.playing = snapshot.playing;
    this.playheadTick = snapshot.tick;
    if (this.playingPerformance && !snapshot.playing) {
      this.playingPerformance = false;
      this.engine.setComposition(this.composition);
    }
    if (
      this.captureStatus === 'recording' &&
      this.engine.absoluteTick() - this.captureStartTick >= MAX_PERFORMANCE_BARS * TICKS_PER_BAR
    ) {
      this.stopCapture();
      this.notice = 'Take saved at the performance limit.';
    }
  }

  private apply(result: OperationResult, nextSelection?: string[]): void {
    if (!result.ok) {
      this.notice = result.reason;
      return;
    }
    if (result.value === this.composition) return;
    this.pushUndo(this.composition);
    this.redoStack = [];
    this.replaceComposition(result.value);
    if (nextSelection) this.selectedClipIds = nextSelection;
  }

  private replaceComposition(composition: CompositionV1): void {
    this.jamPicks = {};
    this.composition = composition;
    this.engine.setComposition(composition);
    this.scheduleSave();
  }

  private pushUndo(composition: CompositionV1): void {
    this.undoStack = [...this.undoStack.slice(-(MAX_UNDO_ENTRIES - 1)), composition];
  }

  private scheduleSave(): void {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      if (!saveDraft(this.composition)) this.notice = 'Draft saving is unavailable in this browser';
    }, 250);
  }
}
