import { afterEach, describe, expect, it } from 'vitest';
import { DURATION } from './config';
import { motion, setMotionMode } from './preference.svelte';
import { fadeOut, pop, rise } from './transitions';

const node = {} as Element;

afterEach(() => {
  motion.allowed = true;
  setMotionMode('spring');
});

describe('transitions', () => {
  it('collapse to zero duration under reduced motion', () => {
    motion.allowed = false;
    expect(rise(node).duration).toBe(0);
    expect(pop(node).duration).toBe(0);
    expect(fadeOut(node).duration).toBe(0);
    expect(rise(node).css).toBeUndefined();
  });

  it('rise lifts from the requested offset', () => {
    const config = rise(node, { y: -8 });
    expect(config.css?.(0, 1)).toBe('opacity: 0; transform: translateY(-8px)');
    expect(config.css?.(1, 0)).toBe('opacity: 1; transform: translateY(0px)');
  });

  it('rise finishes on the view duration in every mode, never a spring tail', () => {
    for (const mode of ['spring', 'quint'] as const) {
      setMotionMode(mode);
      const config = rise(node);
      expect(config.duration).toBe(DURATION.view);
      expect(config.easing?.(0.5)).toBeCloseTo(1 - 0.5 ** 5, 6);
    }
  });

  it('pop never scales, so a clip edge stays where layout put it', () => {
    const css = pop(node).css?.(0.5, 0.5) ?? '';
    expect(css).not.toContain('scale');
    expect(css).toContain('translateY(2px)');
  });
});
