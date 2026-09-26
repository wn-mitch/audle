import type { TransitionConfig } from 'svelte/transition';
import { DURATION } from './config';
import { isMotionAllowed } from './preference.svelte';

const outQuint = (t: number): number => 1 - (1 - t) ** 5;

/** Fades in while lifting into place. Used for notices and view changes. Springs are reserved for
 * scale on presses and pops: an opacity ramp needs to finish quickly, and a spring's settling
 * tail would hold a view half-transparent for most of a second. */
export const rise = (
  _node: Element,
  { y = 6, delay = 0 }: { y?: number; delay?: number } = {},
): TransitionConfig =>
  isMotionAllowed()
    ? {
        delay,
        easing: outQuint,
        duration: DURATION.view,
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
