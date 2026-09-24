import {
  AssetLoadError,
  type AudioEngine,
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
import { loadDraft, saveDraft } from './persistence';

const MAX_UNDO_ENTRIES = 100;

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

  private undoStack: CompositionV1[] = [];
  private redoStack: CompositionV1[] = [];
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
  }

  get selectedTrack() {
    return this.composition.tracks.find((track) => track.id === this.selectedTrackId);
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
      this.engine.stop();
      return;
    }
    await this.engine.unlock();
    this.engine.play();
  }

  async toggleRecording(): Promise<void> {
    if (this.loading || this.loadingError) return;
    const next = !this.recording;
    if (next) await this.engine.unlock();
    this.recording = next;
    this.engine.armRecord(next);
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
    this.unsubscribeTransport();
  }

  destroy(): void {
    this.detach();
    this.engine.dispose();
  }

  private updateTransport(snapshot: TransportSnapshot): void {
    this.playing = snapshot.playing;
    this.playheadTick = snapshot.tick;
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
