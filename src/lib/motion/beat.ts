import { animate } from 'animejs';
import { DURATION, EASE, motionParams, type MotionMode } from './config';
import { isMotionAllowed, motion } from './preference.svelte';

/** The dependencies the beat helpers need, injectable so tests can watch a stub `animate`. */
export interface MotionRunner {
  animate: typeof animate;
  allowed: () => boolean;
  mode: () => MotionMode;
}

/** The subset of HTMLElement the helpers touch, so tests can pass a plain object. */
export type MotionTarget = Pick<
  HTMLElement,
  'isConnected' | 'setAttribute' | 'removeAttribute' | 'querySelector'
>;

export interface BeatMotion {
  /** Lights the element for one sound: the glyph pops, the inner ring and bloom flash through
   * `--flash`, and `data-hit` is set for the flash's duration as a hook for tests. */
  flashHit(element: MotionTarget, options?: { strength?: number }): void;
  /** A beat-locked pulse on the transport icon; the downbeat gets a slightly larger accent. */
  pulseBeat(elements: Iterable<MotionTarget>, options?: { accent?: boolean }): void;
  /** Kicks `--level` to `peak` and lets it decay to `floor`, for a meter bar scaled by that
   * property. */
  meterKick(element: MotionTarget, options: { peak?: number; floor: number }): void;
  /** Accents only the timing mark that corresponds to an audible event. */
  accentHitMark(element: MotionTarget): void;
}

export const createBeatMotion = (runner: MotionRunner): BeatMotion => {
  const ready = (element: MotionTarget) => runner.allowed() && element.isConnected;
  return {
    flashHit(element, options = {}) {
      if (!ready(element)) return;
      const strength = options.strength ?? 1;
      const glyph = element.querySelector<HTMLElement>('.glyph') ?? element;
      element.setAttribute('data-hit', 'true');
      runner.animate(glyph as HTMLElement, {
        scale: [1, Number((1 + 0.14 * strength).toFixed(3)), 1],
        translateY: [0, -3 * strength, 0],
        rotate: ['0deg', `${4 * strength}deg`, '0deg'],
        duration: DURATION.flash,
        ease: EASE.flash,
        composition: 'replace',
      });
      runner.animate(element as HTMLElement, {
        '--flash': [strength, 0],
        duration: DURATION.flash,
        ease: EASE.flash,
        composition: 'replace',
        onComplete: () => element.removeAttribute('data-hit'),
      });
    },
    pulseBeat(elements, options = {}) {
      const scale = options.accent ? 1.1 : 1.05;
      for (const element of elements) {
        if (!ready(element)) continue;
        runner.animate(element as HTMLElement, {
          scale: [1, scale, 1],
          rotate: ['0deg', options.accent ? '3deg' : '1.5deg', '0deg'],
          duration: DURATION.pulse,
          ease: EASE.release,
          composition: 'replace',
        });
      }
    },
    meterKick(element, options) {
      if (!ready(element)) return;
      runner.animate(element as HTMLElement, {
        '--level': [options.peak ?? 1, options.floor],
        duration: DURATION.meterDecay,
        ease: EASE.release,
        composition: 'replace',
      });
    },
    accentHitMark(element) {
      if (!ready(element)) return;
      runner.animate(element as HTMLElement, {
        scale: [1, 1.7, 1],
        duration: DURATION.flash,
        ease: EASE.flash,
        composition: 'replace',
      });
    },
  };
};

export const { flashHit, pulseBeat, meterKick, accentHitMark } = createBeatMotion({
  animate,
  allowed: isMotionAllowed,
  mode: () => motion.mode,
});

/** Settles a pressed element back to rest with the current release curve. */
export const settle = (element: HTMLElement): void => {
  animate(element, {
    scale: 1,
    translateY: 0,
    ...motionParams(motion.mode, 'settle'),
    composition: 'replace',
  });
};
