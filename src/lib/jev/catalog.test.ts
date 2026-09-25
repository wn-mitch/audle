import { describe, expect, it } from 'vitest';
import { ROLES, challengeForDate, firstPadFor } from '../domain/challenge';
import { DEFAULT_SOURCE_TICKS, TICKS_PER_BAR, type CompositionV1 } from '../domain/model';
import { createDailyDraft, fillTracks } from '../domain/operations';
import { ROLE_PATTERNS, expandPattern, optionsFor } from './catalog';

const BAR_COUNTS: CompositionV1['bars'][] = [1, 2, 3, 4];

describe('Jev pattern catalog', () => {
  it('expands every pattern at every loop length into a valid composition', () => {
    for (const bars of BAR_COUNTS) {
      ROLES.forEach((role) => {
        for (const name of Object.keys(ROLE_PATTERNS[role].patterns)) {
          const composition = createDailyDraft(challengeForDate('2026-08-12'), bars);
          const result = fillTracks(composition, {
            [`track-${firstPadFor(role)}`]: expandPattern(role, name, bars),
          });
          expect(result.ok, `${role}/${name} at ${bars} bars`).toBe(true);
        }
      });
    }
  });

  it('keeps loop clips in phase with the two-bar source loop', () => {
    const clips = expandPattern('chord', 'full', 4);
    expect(clips).toEqual([
      { kind: 'loop', startTick: 0, lengthTicks: DEFAULT_SOURCE_TICKS, sourceOffsetTick: 0 },
      {
        kind: 'loop',
        startTick: DEFAULT_SOURCE_TICKS,
        lengthTicks: DEFAULT_SOURCE_TICKS,
        sourceOffsetTick: 0,
      },
    ]);
    expect(expandPattern('bass', 'late', 3)).toEqual([
      {
        kind: 'loop',
        startTick: TICKS_PER_BAR * 2,
        lengthTicks: TICKS_PER_BAR,
        sourceOffsetTick: 0,
      },
    ]);
    expect(expandPattern('beat', 'alternate', 4).map((clip) => clip.startTick)).toEqual([
      0,
      TICKS_PER_BAR * 2,
    ]);
    const odd = expandPattern('texture', 'turnaround', 2);
    expect(odd).toEqual([
      {
        kind: 'loop',
        startTick: TICKS_PER_BAR,
        lengthTicks: TICKS_PER_BAR,
        sourceOffsetTick: TICKS_PER_BAR,
      },
    ]);
  });

  it('gives multi-bar hit patterns their last-bar variation and bar limits', () => {
    const riser = expandPattern('clap', 'riser', 2).map((clip) => clip.startTick / 24);
    expect(riser).toEqual([4, 12, 20, 24, 26, 28, 29, 30, 31]);
    expect(expandPattern('fx', 'signal', 4)).toEqual([
      { kind: 'hit', startTick: TICKS_PER_BAR * 3 + 12 * 24, ratchet: 1 },
    ]);
    expect(
      expandPattern('hat', 'skitter', 1).filter((clip) => clip.kind === 'hit' && clip.ratchet > 1),
    ).toHaveLength(2);
    expect(expandPattern('kick', 'constructor', 2)).toEqual([]);
  });

  it('never offers two names that expand to the same clips', () => {
    for (const bars of BAR_COUNTS) {
      for (const role of ROLES) {
        const names = Object.keys(optionsFor(role, bars));
        expect(names[0]).toBe('rest');
        const signatures = names.map((name) => JSON.stringify(expandPattern(role, name, bars)));
        expect(new Set(signatures).size, `${role} at ${bars} bars`).toBe(names.length);
      }
    }
    expect(Object.keys(optionsFor('beat', 1))).toEqual(['rest', 'full']);
  });
});
