import { sampleById } from '../data/samples';
import {
  BASE_TRACKS,
  DEFAULT_TRACK_CONTROLS,
  MAX_CLIPS,
  MAX_TRACKS,
  sourceTicks,
  TICKS_PER_BAR,
  TICKS_PER_QUARTER,
  TICKS_PER_SIXTEENTH,
  type Clip,
  type CompositionV1,
  type HitClip,
  type LoopClip,
  type Track,
  type TrackControls,
} from './model';
import { validateComposition } from './schema';

export type OperationResult =
  { ok: true; value: CompositionV1; changed?: number } | { ok: false; reason: string };

const clipEnd = (clip: Clip): number =>
  clip.kind === 'loop' ? clip.startTick + clip.lengthTicks : clip.startTick + TICKS_PER_SIXTEENTH;

const createIdAllocator = (composition: CompositionV1): ((prefix: string) => string) => {
  const existing = new Set<string>(
    composition.tracks.flatMap((track) => [track.id, ...track.clips.map((clip) => clip.id)]),
  );
  return (prefix: string): string => {
    let suffix = 1;
    while (existing.has(`${prefix}-${suffix}`)) suffix += 1;
    const id = `${prefix}-${suffix}`;
    existing.add(id);
    return id;
  };
};

const finalComposition = (candidate: CompositionV1, changed?: number): OperationResult => {
  const validated = validateComposition(candidate);
  return validated
    ? { ok: true, value: validated, changed }
    : { ok: false, reason: 'That edit would make this Audle invalid.' };
};

const selectedClips = (
  composition: CompositionV1,
  clipIds: readonly string[],
): Array<{ track: Track; clip: Clip }> => {
  const selected = new Set(clipIds);
  return composition.tracks.flatMap((track) =>
    track.clips.filter((clip) => selected.has(clip.id)).map((clip) => ({ track, clip })),
  );
};

const selectionBounds = (
  selection: Array<{ track: Track; clip: Clip }>,
): { start: number; end: number } | undefined => {
  if (selection.length === 0) return undefined;
  return selection.reduce(
    (bounds, { clip }) => ({
      start: Math.min(bounds.start, clip.startTick),
      end: Math.max(bounds.end, clipEnd(clip)),
    }),
    { start: Number.POSITIVE_INFINITY, end: Number.NEGATIVE_INFINITY },
  );
};

const conflictsWithUnselected = (
  track: Track,
  candidate: Clip,
  selectedIds: ReadonlySet<string>,
): boolean =>
  track.clips.some((existing) => {
    if (selectedIds.has(existing.id)) return false;
    if (candidate.kind === 'loop' && existing.kind === 'loop') {
      return candidate.startTick < clipEnd(existing) && existing.startTick < clipEnd(candidate);
    }
    return (
      candidate.kind === 'hit' &&
      existing.kind === 'hit' &&
      candidate.startTick === existing.startTick
    );
  });

const copiedClip = (nextId: (prefix: string) => string, clip: Clip, startTick: number): Clip =>
  clip.kind === 'loop'
    ? {
        id: nextId('clip'),
        kind: 'loop',
        startTick,
        lengthTicks: clip.lengthTicks,
        sourceOffsetTick: clip.sourceOffsetTick,
      }
    : { id: nextId('clip'), kind: 'hit', startTick, ratchet: clip.ratchet };

export const createDailyDraft = (
  challenge: CompositionV1['challenge'],
  bars: CompositionV1['bars'] = 2,
): CompositionV1 => ({
  version: 1,
  challenge,
  bars,
  tracks: challenge.sampleIds.map((sampleId, index) => ({
    id: `track-${index}`,
    sampleId,
    label: sampleById(sampleId)!.label,
    controls: { ...DEFAULT_TRACK_CONTROLS },
    clips: [],
  })),
});

export const splitSelectedAt = (
  composition: CompositionV1,
  selectedClipIds: readonly string[],
  playheadTick: number,
): OperationResult => {
  const selected = selectedClips(composition, selectedClipIds);
  if (
    selected.length === 0 ||
    selected.some(
      ({ clip }) =>
        clip.kind !== 'loop' || playheadTick <= clip.startTick || playheadTick >= clipEnd(clip),
    )
  ) {
    return { ok: false, reason: 'Place the playhead inside selected loop clips.' };
  }

  const candidate = structuredClone(composition);
  const nextId = createIdAllocator(candidate);
  const replacements = new Map<string, Clip>();
  for (const { track, clip } of selected) {
    const loop = clip as LoopClip;
    const leftLength = playheadTick - loop.startTick;
    replacements.set(loop.id, {
      id: loop.id,
      kind: 'loop',
      startTick: loop.startTick,
      lengthTicks: leftLength,
      sourceOffsetTick: loop.sourceOffsetTick,
    });
    const rightId = nextId('clip');
    replacements.set(`${loop.id}:right`, {
      id: rightId,
      kind: 'loop',
      startTick: playheadTick,
      lengthTicks: loop.lengthTicks - leftLength,
      // Wrap the source window inside this sample's own length rather than a fixed two bars.
      sourceOffsetTick:
        (loop.sourceOffsetTick + leftLength) % sourceTicks(sampleById(track.sampleId)),
    });
  }

  const transformed = {
    ...candidate,
    tracks: candidate.tracks.map((track) => ({
      ...track,
      clips: track.clips.flatMap((clip) => {
        const left = replacements.get(clip.id);
        const right = replacements.get(`${clip.id}:right`);
        return left && right ? [left, right] : [clip];
      }),
    })),
  };
  return finalComposition(transformed);
};

const appendSelectionCopy = (
  composition: CompositionV1,
  selectedClipIds: readonly string[],
  repeatToEnd: boolean,
): OperationResult => {
  const selected = selectedClips(composition, selectedClipIds);
  const bounds = selectionBounds(selected);
  if (!bounds) return { ok: false, reason: 'Select clips first.' };

  const span = bounds.end - bounds.start;
  const totalTicks = composition.bars * TICKS_PER_BAR;
  const selectedIds = new Set(selectedClipIds);
  const candidate = structuredClone(composition);
  const nextId = createIdAllocator(candidate);
  const additions: Array<{ trackId: string; clip: Clip }> = [];

  for (let offset = span; bounds.end + offset <= totalTicks; offset += span) {
    const copyBatch = selected.map(({ track, clip }) => ({
      track,
      clip: copiedClip(nextId, clip, clip.startTick + offset),
    }));
    if (
      copyBatch.some(
        ({ track, clip }) =>
          conflictsWithUnselected(track, clip, selectedIds) ||
          additions.some(
            (addition) =>
              addition.trackId === track.id &&
              (clip.kind === 'loop' && addition.clip.kind === 'loop'
                ? clip.startTick < clipEnd(addition.clip) && addition.clip.startTick < clipEnd(clip)
                : clip.kind === 'hit' &&
                  addition.clip.kind === 'hit' &&
                  clip.startTick === addition.clip.startTick),
          ),
      )
    ) {
      return { ok: false, reason: 'That copy would collide with an unselected clip.' };
    }
    additions.push(...copyBatch.map(({ track, clip }) => ({ trackId: track.id, clip })));
    if (!repeatToEnd) break;
  }

  if (additions.length === 0) return { ok: false, reason: 'No full repeat fits before the end.' };
  if (
    composition.tracks.reduce((count, track) => count + track.clips.length, 0) + additions.length >
    MAX_CLIPS
  ) {
    return { ok: false, reason: `That repeat would exceed the ${MAX_CLIPS}-clip limit.` };
  }

  return finalComposition({
    ...candidate,
    tracks: candidate.tracks.map((track) => ({
      ...track,
      clips: [
        ...track.clips,
        ...additions
          .filter((addition) => addition.trackId === track.id)
          .map((addition) => addition.clip),
      ],
    })),
  });
};

export const duplicateSelection = (
  composition: CompositionV1,
  selectedClipIds: readonly string[],
): OperationResult => appendSelectionCopy(composition, selectedClipIds, false);

export const repeatSelectionToEnd = (
  composition: CompositionV1,
  selectedClipIds: readonly string[],
): OperationResult => appendSelectionCopy(composition, selectedClipIds, true);

export const moveSelection = (
  composition: CompositionV1,
  selectedClipIds: readonly string[],
  requestedDelta: number,
): OperationResult => {
  const selected = selectedClips(composition, selectedClipIds);
  const bounds = selectionBounds(selected);
  if (!bounds) return { ok: false, reason: 'Select clips first.' };
  const totalTicks = composition.bars * TICKS_PER_BAR;
  const delta = Math.max(-bounds.start, Math.min(requestedDelta, totalTicks - bounds.end));
  if (!isFinite(delta) || delta === 0)
    return { ok: false, reason: 'Those clips are already at the boundary.' };

  const selectedIds = new Set(selectedClipIds);
  const transformed = selected.map(({ track, clip }) => ({
    track,
    clip: { ...clip, startTick: clip.startTick + delta },
  }));
  if (transformed.some(({ track, clip }) => conflictsWithUnselected(track, clip, selectedIds))) {
    return { ok: false, reason: 'That move would collide with an unselected clip.' };
  }

  const replacementIds = new Set(selectedClipIds);
  const replacementCursor = new Map<string, Clip>();
  selected.forEach(({ clip }, index) => replacementCursor.set(clip.id, transformed[index]!.clip));
  return finalComposition({
    ...structuredClone(composition),
    tracks: composition.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) =>
        replacementIds.has(clip.id) ? replacementCursor.get(clip.id)! : clip,
      ),
    })),
  });
};

export const nudgeSelection = (
  composition: CompositionV1,
  selectedClipIds: readonly string[],
  direction: -1 | 1,
): OperationResult => moveSelection(composition, selectedClipIds, direction * TICKS_PER_SIXTEENTH);

export const deleteSelection = (
  composition: CompositionV1,
  selectedClipIds: readonly string[],
): OperationResult => {
  const selected = new Set(selectedClipIds);
  if (selected.size === 0) return { ok: false, reason: 'Select clips first.' };
  return finalComposition({
    ...structuredClone(composition),
    tracks: composition.tracks.map((track) => ({
      ...track,
      clips: track.clips.filter((clip) => !selected.has(clip.id)),
    })),
  });
};

export const setSelectedRatchet = (
  composition: CompositionV1,
  selectedClipIds: readonly string[],
  ratchet: 1 | 2 | 3 | 4,
): OperationResult => {
  const selected = selectedClips(composition, selectedClipIds);
  if (selected.length === 0 || selected.some(({ clip }) => clip.kind !== 'hit')) {
    return { ok: false, reason: 'Select hi-hat or one-shot hits to add a roll.' };
  }
  const ids = new Set(selectedClipIds);
  return finalComposition({
    ...structuredClone(composition),
    tracks: composition.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) =>
        ids.has(clip.id) ? ({ ...clip, ratchet } as HitClip) : clip,
      ),
    })),
  });
};

export const cloneSelectedVoice = (
  composition: CompositionV1,
  trackId: string,
): OperationResult => {
  const source = composition.tracks.find((track) => track.id === trackId);
  if (!source) return { ok: false, reason: 'Select one track to add a layer.' };
  if (composition.tracks.length >= MAX_TRACKS)
    return { ok: false, reason: `This Audle already has ${MAX_TRACKS} voices.` };
  const clipCount = composition.tracks.reduce((count, track) => count + track.clips.length, 0);
  if (clipCount + source.clips.length > MAX_CLIPS)
    return { ok: false, reason: `That layer would exceed the ${MAX_CLIPS}-clip limit.` };

  const usedLabels = new Set(composition.tracks.map((track) => track.label));
  let layerNumber = 2;
  while (usedLabels.has(`Layer ${layerNumber}`)) layerNumber += 1;
  const candidate = structuredClone(composition);
  const nextId = createIdAllocator(candidate);
  const clone: Track = {
    id: nextId('track'),
    sampleId: source.sampleId,
    label: `Layer ${layerNumber}`,
    controls: { ...source.controls },
    clips: source.clips.map((clip) => copiedClip(nextId, clip, clip.startTick)),
  };
  return finalComposition({ ...candidate, tracks: [...candidate.tracks, clone] });
};

export const deleteLayer = (composition: CompositionV1, trackId: string): OperationResult => {
  const index = composition.tracks.findIndex((track) => track.id === trackId);
  if (index < BASE_TRACKS)
    return { ok: false, reason: 'The daily source tracks cannot be removed.' };
  return finalComposition({
    ...structuredClone(composition),
    tracks: composition.tracks.filter((track) => track.id !== trackId),
  });
};

export const changeBars = (composition: CompositionV1, bars: 1 | 2 | 3 | 4): OperationResult => {
  const totalTicks = bars * TICKS_PER_BAR;
  let changed = 0;
  const candidate = structuredClone(composition);
  const tracks = candidate.tracks.map((track) => {
    const clips = track.clips.flatMap((clip) => {
      if (clip.startTick >= totalTicks) {
        changed += 1;
        return [];
      }
      if (clip.kind === 'loop' && clipEnd(clip) > totalTicks) {
        changed += 1;
        return [{ ...clip, lengthTicks: totalTicks - clip.startTick }];
      }
      return [clip];
    });
    return { ...track, clips };
  });
  return finalComposition({ ...candidate, bars, tracks }, changed);
};

export const renameTrack = (
  composition: CompositionV1,
  trackId: string,
  label: string,
): OperationResult => {
  const track = composition.tracks.find((candidate) => candidate.id === trackId);
  if (!track) return { ok: false, reason: 'Track not found.' };
  const normalized = label.trim() || sampleById(track.sampleId)!.label;
  if (Array.from(normalized).length > 24)
    return { ok: false, reason: 'Track labels are limited to 24 characters.' };
  return finalComposition({
    ...structuredClone(composition),
    tracks: composition.tracks.map((candidate) =>
      candidate.id === trackId ? { ...candidate, label: normalized } : candidate,
    ),
  });
};

export const setTrackControls = (
  composition: CompositionV1,
  trackId: string,
  controls: TrackControls,
): OperationResult => {
  if (!composition.tracks.some((track) => track.id === trackId)) {
    return { ok: false, reason: 'Track not found.' };
  }
  return finalComposition({
    ...structuredClone(composition),
    tracks: composition.tracks.map((track) =>
      track.id === trackId ? { ...track, controls } : track,
    ),
  });
};

export const toggleLoopClip = (
  composition: CompositionV1,
  trackId: string,
  rawTick: number,
): OperationResult => {
  const track = composition.tracks.find((candidate) => candidate.id === trackId);
  if (!track || sampleById(track.sampleId)?.kind !== 'loop') {
    return { ok: false, reason: 'Choose a loop voice to record a loop.' };
  }
  const totalTicks = composition.bars * TICKS_PER_BAR;
  const startTick = Math.max(
    0,
    Math.min(
      totalTicks - TICKS_PER_SIXTEENTH,
      Math.ceil(rawTick / TICKS_PER_QUARTER) * TICKS_PER_QUARTER,
    ),
  );
  const existing = track.clips.find(
    (clip): clip is LoopClip => clip.kind === 'loop' && clip.startTick === startTick,
  );
  if (existing) return deleteSelection(composition, [existing.id]);

  const loop: LoopClip = {
    id: createIdAllocator(composition)('clip'),
    kind: 'loop',
    startTick,
    lengthTicks: Math.min(sourceTicks(sampleById(track.sampleId)), totalTicks - startTick),
    sourceOffsetTick: 0,
  };
  if (conflictsWithUnselected(track, loop, new Set())) {
    return { ok: false, reason: 'That loop would collide with an existing loop.' };
  }
  return finalComposition({
    ...structuredClone(composition),
    tracks: composition.tracks.map((candidate) =>
      candidate.id === trackId ? { ...candidate, clips: [...candidate.clips, loop] } : candidate,
    ),
  });
};

/** Places a loop clip at the start of the bar containing `rawTick`; an existing loop there is removed. */
export const placeLoop = (
  composition: CompositionV1,
  trackId: string,
  rawTick: number,
): OperationResult => {
  const totalTicks = composition.bars * TICKS_PER_BAR;
  const barStart = Math.max(
    0,
    Math.min(totalTicks - TICKS_PER_BAR, Math.floor(rawTick / TICKS_PER_BAR) * TICKS_PER_BAR),
  );
  return toggleLoopClip(composition, trackId, barStart);
};

export const resizeLoop = (
  composition: CompositionV1,
  trackId: string,
  clipId: string,
  requestedLengthTicks: number,
): OperationResult => {
  const track = composition.tracks.find((candidate) => candidate.id === trackId);
  const loop = track?.clips.find(
    (clip): clip is LoopClip => clip.kind === 'loop' && clip.id === clipId,
  );
  if (!track || !loop) return { ok: false, reason: 'Loop not found.' };
  const totalTicks = composition.bars * TICKS_PER_BAR;
  const lengthTicks = Math.max(
    TICKS_PER_SIXTEENTH,
    Math.min(
      totalTicks - loop.startTick,
      Math.round(requestedLengthTicks / TICKS_PER_SIXTEENTH) * TICKS_PER_SIXTEENTH,
    ),
  );
  const resized = { ...loop, lengthTicks };
  if (conflictsWithUnselected(track, resized, new Set([clipId]))) {
    return { ok: false, reason: 'That loop would collide with an existing loop.' };
  }
  return finalComposition({
    ...structuredClone(composition),
    tracks: composition.tracks.map((candidate) => ({
      ...candidate,
      clips: candidate.clips.map((clip) => (clip.id === clipId ? resized : clip)),
    })),
  });
};

export const recordHit = (
  composition: CompositionV1,
  trackId: string,
  rawTick: number,
): OperationResult => {
  const track = composition.tracks.find((candidate) => candidate.id === trackId);
  if (!track || sampleById(track.sampleId)?.kind !== 'one-shot')
    return { ok: false, reason: 'Choose a one-shot voice to record a hit.' };
  const totalTicks = composition.bars * TICKS_PER_BAR;
  const startTick = Math.max(
    0,
    Math.min(
      totalTicks - TICKS_PER_SIXTEENTH,
      Math.round(rawTick / TICKS_PER_SIXTEENTH) * TICKS_PER_SIXTEENTH,
    ),
  );
  const existing = track.clips.find(
    (clip): clip is HitClip => clip.kind === 'hit' && clip.startTick === startTick,
  );
  if (existing?.ratchet === 4) return { ok: true, value: composition };

  const candidate = structuredClone(composition);
  const nextId = createIdAllocator(candidate);
  const updatedTracks = candidate.tracks.map((candidateTrack) => {
    if (candidateTrack.id !== trackId) return candidateTrack;
    if (existing) {
      return {
        ...candidateTrack,
        clips: candidateTrack.clips.map((clip) =>
          clip.id === existing.id
            ? { ...clip, ratchet: (existing.ratchet + 1) as 1 | 2 | 3 | 4 }
            : clip,
        ),
      };
    }
    return {
      ...candidateTrack,
      clips: [
        ...candidateTrack.clips,
        { id: nextId('clip'), kind: 'hit' as const, startTick, ratchet: 1 as const },
      ],
    };
  });
  return finalComposition({ ...candidate, tracks: updatedTracks });
};

export type ClipPlacement = Omit<LoopClip, 'id'> | Omit<HitClip, 'id'>;

/** Appends placements to tracks as one edit, allocating fresh clip IDs. Unknown track IDs are ignored. */
export const fillTracks = (
  composition: CompositionV1,
  placements: Readonly<Record<string, readonly ClipPlacement[]>>,
): OperationResult => {
  const candidate = structuredClone(composition);
  const nextId = createIdAllocator(candidate);
  let changed = 0;
  const tracks = candidate.tracks.map((track) => {
    const additions = placements[track.id];
    if (!additions?.length) return track;
    changed += additions.length;
    return {
      ...track,
      clips: [
        ...track.clips,
        ...additions.map((clip) => ({ ...clip, id: nextId('clip') }) as Clip),
      ],
    };
  });
  if (changed === 0) return { ok: true, value: composition, changed: 0 };
  return finalComposition({ ...candidate, tracks }, changed);
};
