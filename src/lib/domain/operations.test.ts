import { describe, expect, it } from 'vitest';
import { challengeForDate } from './challenge';
import {
  changeBars,
  cloneSelectedVoice,
  createDailyDraft,
  deleteLayer,
  fillTracks,
  moveSelection,
  placeLoop,
  recordHit,
  renameTrack,
  repeatSelectionToEnd,
  setSelectedRatchet,
  setTrackControls,
  splitSelectedAt,
  type OperationResult,
} from './operations';
import { BASE_TRACKS, MAX_CLIPS, MAX_TRACKS, TICKS_PER_BAR, type CompositionV1 } from './model';

const expectSuccess = (result: OperationResult): CompositionV1 => {
  if (!result.ok) throw new Error(result.reason);
  return result.value;
};

const starter = (): CompositionV1 => createDailyDraft(challengeForDate('2026-08-12'));

const loopClip = (id: string, startTick: number, lengthTicks: number, sourceOffsetTick = 0) => ({
  id,
  kind: 'loop' as const,
  startTick,
  lengthTicks,
  sourceOffsetTick,
});

describe('composition operations', () => {
  it('splits loops without changing their scheduled coverage', () => {
    const composition = starter();
    composition.tracks[4]!.clips.push(loopClip('chord-a', 0, 768, 0));

    const result = expectSuccess(splitSelectedAt(composition, ['chord-a'], 384));
    const clips = result.tracks[4]!.clips;
    expect(clips).toHaveLength(2);
    expect(
      clips.map(
        (clip) => clip.kind === 'loop' && [clip.startTick, clip.startTick + clip.lengthTicks],
      ),
    ).toEqual([
      [0, 384],
      [384, 768],
    ]);
    expect(clips[1]).toMatchObject({ kind: 'loop', sourceOffsetTick: 384 });
    expect(splitSelectedAt(composition, ['chord-a'], 0)).toEqual({
      ok: false,
      reason: 'Place the playhead inside selected loop clips.',
    });
  });

  it('increments same-cell recording through a four-strike roll', () => {
    let composition = starter();
    for (let count = 0; count < 5; count += 1)
      composition = expectSuccess(recordHit(composition, 'track-12', 17));

    expect(composition.tracks[12]!.clips).toEqual([
      { id: 'clip-1', kind: 'hit', startTick: 24, ratchet: 4 },
    ]);
    composition = expectSuccess(recordHit(composition, 'track-12', 48));
    const ids = composition.tracks[12]!.clips.map((clip) => clip.id);
    composition = expectSuccess(setSelectedRatchet(composition, ids, 3));
    expect(
      composition.tracks[12]!.clips.every((clip) => clip.kind === 'hit' && clip.ratchet === 3),
    ).toBe(true);
  });

  it('fills a two-track one-bar pattern without changing its group offsets', () => {
    const composition = starter();
    composition.bars = 4;
    composition.tracks[0]!.clips.push(loopClip('beat-a', 0, 384));
    composition.tracks[2]!.clips.push(loopClip('bass-a', 24, 360));

    const repeated = expectSuccess(repeatSelectionToEnd(composition, ['beat-a', 'bass-a']));
    expect(repeated.tracks[0]!.clips.map((clip) => clip.startTick)).toEqual([0, 384, 768, 1152]);
    expect(repeated.tracks[2]!.clips.map((clip) => clip.startTick)).toEqual([24, 408, 792, 1176]);

    const colliding = starter();
    colliding.bars = 4;
    colliding.tracks[0]!.clips.push(loopClip('selected', 0, 384), loopClip('blocker', 384, 384));
    const failed = repeatSelectionToEnd(colliding, ['selected']);
    expect(failed.ok).toBe(false);
    expect(colliding.tracks[0]!.clips).toHaveLength(2);
  });

  it('keeps cloned voices independent and enforces layer limits', () => {
    const composition = starter();
    composition.tracks[4]!.clips.push(loopClip('chord-a', 0, 384));
    const cloned = expectSuccess(cloneSelectedVoice(composition, 'track-4'));
    const clone = cloned.tracks.at(-1)!;
    const tweaked = expectSuccess(
      setTrackControls(cloned, clone.id, {
        gainDb: -6,
        pan: 0.5,
        tuneSemitones: 4,
        cutoffHz: 800,
        space: 0,
        echo: 0,
        fuzz: 0,
        muted: false,
        solo: false,
      }),
    );
    const moved = expectSuccess(moveSelection(tweaked, [clone.clips[0]!.id], 24));
    const renamed = expectSuccess(renameTrack(moved, clone.id, 'Bright layer'));

    expect(renamed.tracks[4]).toEqual(composition.tracks[4]);
    expect(renamed.tracks.at(-1)).toMatchObject({
      label: 'Bright layer',
      controls: { tuneSemitones: 4, cutoffHz: 800 },
    });
    expect(renamed.tracks.at(-1)!.clips[0]).toMatchObject({ startTick: 24 });
    expect(expectSuccess(deleteLayer(renamed, clone.id)).tracks).toHaveLength(BASE_TRACKS);

    let maximum = starter();
    for (let count = 0; count < 8; count += 1)
      maximum = expectSuccess(cloneSelectedVoice(maximum, 'track-4'));
    expect(cloneSelectedVoice(maximum, 'track-4')).toEqual({
      ok: false,
      reason: `This Audle already has ${MAX_TRACKS} voices.`,
    });

    const capped = starter();
    capped.bars = 4;
    capped.tracks[4]!.clips.push(loopClip('copy-me', 0, 24));
    for (let trackIndex = 8; trackIndex < 16; trackIndex += 1) {
      for (let tick = 0; tick < 1536; tick += 24) {
        if (trackIndex === 8 && tick === 1512) continue;
        capped.tracks[trackIndex]!.clips.push({
          id: `hit-${trackIndex}-${tick}`,
          kind: 'hit',
          startTick: tick,
          ratchet: 1,
        });
      }
    }
    expect(cloneSelectedVoice(capped, 'track-8')).toEqual({
      ok: false,
      reason: `That layer would exceed the ${MAX_CLIPS}-clip limit.`,
    });
  });

  it('trims or removes clips when shortening the loop', () => {
    const composition = starter();
    composition.bars = 4;
    composition.tracks[4]!.clips.push(loopClip('crossing', TICKS_PER_BAR * 2, TICKS_PER_BAR * 2));
    composition.tracks[12]!.clips.push({
      id: 'out',
      kind: 'hit',
      startTick: TICKS_PER_BAR * 3,
      ratchet: 1,
    });

    const shortened = changeBars(composition, 3);
    expect(shortened.ok).toBe(true);
    if (!shortened.ok) return;
    expect(shortened.changed).toBe(2);
    expect(shortened.value.tracks[4]!.clips[0]).toMatchObject({ lengthTicks: TICKS_PER_BAR });
    expect(shortened.value.tracks[12]!.clips).toHaveLength(0);
  });

  it('places loops at the start of the clicked bar and toggles them off', () => {
    const composition = createDailyDraft(challengeForDate('2026-08-12'), 4);
    expect(composition.bars).toBe(4);
    const placed = expectSuccess(placeLoop(composition, 'track-0', TICKS_PER_BAR * 2 + 250));
    expect(placed.tracks[0]!.clips).toMatchObject([
      { kind: 'loop', startTick: TICKS_PER_BAR * 2, lengthTicks: TICKS_PER_BAR * 2 },
    ]);
    const lastBar = expectSuccess(placeLoop(composition, 'track-0', TICKS_PER_BAR * 4 + 50));
    expect(lastBar.tracks[0]!.clips).toMatchObject([
      { startTick: TICKS_PER_BAR * 3, lengthTicks: TICKS_PER_BAR },
    ]);
    expect(
      expectSuccess(placeLoop(placed, 'track-0', TICKS_PER_BAR * 2)).tracks[0]!.clips,
    ).toHaveLength(0);
    expect(placeLoop(composition, 'track-8', 0)).toMatchObject({ ok: false });
  });

  it('fills tracks in one validated edit with fresh clip ids', () => {
    const composition = starter();
    composition.tracks[8]!.clips.push({ id: 'clip-1', kind: 'hit', startTick: 0, ratchet: 1 });
    const filled = expectSuccess(
      fillTracks(composition, {
        'track-8': [{ kind: 'hit', startTick: 96, ratchet: 1 }],
        'track-12': [{ kind: 'hit', startTick: 0, ratchet: 2 }],
        missing: [{ kind: 'hit', startTick: 0, ratchet: 1 }],
      }),
    );
    const ids = filled.tracks.flatMap((track) => track.clips.map((clip) => clip.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(filled.tracks[8]!.clips).toHaveLength(2);
    expect(
      fillTracks(composition, { 'track-0': [{ kind: 'hit', startTick: 0, ratchet: 1 }] }),
    ).toMatchObject({
      ok: false,
    });
    expect(fillTracks(composition, {})).toEqual({ ok: true, value: composition, changed: 0 });
  });
});
