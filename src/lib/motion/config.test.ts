import { describe, expect, it } from 'vitest';
import { Spring } from 'animejs';
import { DURATION, SPRING, enterDelay, motionParams } from './config';

describe('motionParams', () => {
  it('never hands a spring to quint mode', () => {
    expect(motionParams('quint', 'settle')).toEqual({
      ease: 'outQuint',
      duration: DURATION.release,
    });
    expect(motionParams('quint', 'pop').duration).toBe(DURATION.flash);
  });

  it('omits duration in spring mode so the physics own the timing', () => {
    const params = motionParams('spring', 'settle');
    expect(params.ease).toBeInstanceOf(Spring);
    expect('duration' in params).toBe(false);
  });

  it('keeps every spring firm enough to avoid a visible bounce', () => {
    for (const role of Object.keys(SPRING) as (keyof typeof SPRING)[]) {
      expect(SPRING[role].damping).toBeGreaterThanOrEqual(18);
      const settle = motionParams('spring', role).ease as Spring;
      expect(settle.settlingDuration).toBeLessThan(1200);
    }
  });
});

describe('enterDelay', () => {
  it('sweeps diagonally so a cell waits on its row plus column', () => {
    expect(enterDelay(0, 8)).toBe(0);
    expect(enterDelay(1, 8)).toBe(DURATION.enterStep);
    expect(enterDelay(8, 8)).toBe(DURATION.enterStep);
    expect(enterDelay(9, 8)).toBe(2 * DURATION.enterStep);
  });

  it('caps the delay for long lists', () => {
    expect(enterDelay(400, 1)).toBe(DURATION.enterMax);
  });

  it('tolerates a zero column count', () => {
    expect(enterDelay(3, 0)).toBe(3 * DURATION.enterStep);
  });
});
