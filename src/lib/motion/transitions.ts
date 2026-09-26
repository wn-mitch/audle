import { spring } from 'animejs';
import type { TransitionConfig } from 'svelte/transition';
import { DURATION, SPRING } from './config';
import { isMotionAllowed, motion } from './preference.svelte';

const outQuint = (t: number): number => 1 - (1 - t) ** 5;

/** The easing and duration a settle takes in the current mode. */
const settleTiming = (fallbackDuration: number): Pick<TransitionConfig, 'easing' | 'duration'> => {
  if (motion.mode !== 'spring') return { easing: outQuint, duration: fallbackDuration };
  const curve = spring(SPRING.settle);
  return { easing: curve.ease, duration: curve.settlingDuration };
};

/** Fades in while lifting into place. Used for notices and view changes. */
export const rise = (
  _node: Element,
  { y = 6, delay = 0 }: { y?: number; delay?: number } = {},
): TransitionConfig =>
  isMotionAllowed()
    ? {
        delay,
        ...settleTiming(DURATION.notice),
        css: (t, u) => `opacity: ${t}; transform: translateY(${u * y}px)`,
      }
    : { duration: 0 };

/** A small fade and lift for clips appearing on the timeline. Opacity and translateY only, so a
 * clip's left edge never moves and layout measurements stay exact. */
export const pop = (_node: Element, { delay = 0 }: { delay?: number } = {}): TransitionConfig =>
  isMotionAllowed()
    ? {
        delay,
        easing: outQuint,
        duration: DURATION.clipIn,
        css: (t, u) => `opacity: ${t}; transform: translateY(${u * 4}px)`,
      }
    : { duration: 0 };

/** A quick fade for elements leaving. */
export const fadeOut = (node: Element): TransitionConfig =>
  isMotionAllowed() && node
    ? { easing: outQuint, duration: DURATION.clipOut, css: (t) => `opacity: ${t}` }
    : { duration: 0 };
