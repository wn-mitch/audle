import type { MotionMode } from './config';

/** Reactive motion preference: `allowed` mirrors `prefers-reduced-motion`, `mode` picks the release
 * curve. Components read `motion.allowed`; imperative helpers call `isMotionAllowed()`. */
export const motion = $state<{ allowed: boolean; mode: MotionMode }>({
  allowed: true,
  mode: 'spring',
});

/** Non-reactive read for code that runs outside Svelte's tracking, such as actions and callbacks. */
export const isMotionAllowed = (): boolean => motion.allowed;

export const setMotionMode = (mode: MotionMode): void => {
  motion.mode = mode;
};

/** The slice of MediaQueryList the watcher needs, so tests can pass a plain object. */
export type MediaQuery = {
  matches: boolean;
  addEventListener(type: 'change', listener: () => void): unknown;
  removeEventListener(type: 'change', listener: () => void): unknown;
};

let dispose: (() => void) | undefined;

/** Attaches a single `prefers-reduced-motion` listener for the app's lifetime. Repeated calls reuse
 * the existing listener; the returned function removes it. */
export const watchMotionPreference = (
  query: (media: string) => MediaQuery = (media) => window.matchMedia(media),
): (() => void) => {
  if (dispose) return dispose;
  const media = query('(prefers-reduced-motion: reduce)');
  const sync = () => {
    motion.allowed = !media.matches;
  };
  sync();
  media.addEventListener('change', sync);
  dispose = () => {
    media.removeEventListener('change', sync);
    dispose = undefined;
  };
  return dispose;
};
