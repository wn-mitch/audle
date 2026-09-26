import { spring, type Spring } from 'animejs';

/** `quint` keeps every release on an ease-out-quint curve; `spring` lets releases and pop-ins settle
 * on a low-bounce spring. */
export type MotionMode = 'quint' | 'spring';

/** Durations in milliseconds. Presses are near-instant; releases and entrances are what people see. */
export const DURATION = {
  press: 60,
  release: 220,
  flash: 260,
  pulse: 320,
  meterDecay: 380,
  enter: 420,
  enterStep: 28,
  enterMax: 360,
  notice: 220,
  view: 220,
  clipIn: 180,
  clipOut: 120,
} as const;

export const EASE = {
  press: 'outQuad',
  release: 'outQuint',
  flash: 'outQuint',
} as const;

/** Spring physics tuned so the overshoot stays under about three percent: firm, never rubbery. */
export const SPRING = {
  settle: { mass: 1, stiffness: 320, damping: 22 },
  pop: { mass: 1, stiffness: 420, damping: 18 },
} as const;

export type SpringRole = keyof typeof SPRING;

export type MotionParams = { ease: Spring | string; duration?: number };

/** Resolves the ease and duration for a release or pop-in. A Spring carries its own duration, so the
 * result omits `duration` in spring mode; passing both would let the number win over the physics. */
export const motionParams = (mode: MotionMode, role: SpringRole): MotionParams =>
  mode === 'spring'
    ? { ease: spring(SPRING[role]) }
    : { ease: EASE.release, duration: role === 'pop' ? DURATION.flash : DURATION.release };

/** Delay for a grid entrance that sweeps diagonally from the top-left, capped so a long list does not
 * keep the last item waiting. */
export const enterDelay = (
  index: number,
  columns: number,
  step: number = DURATION.enterStep,
): number => {
  const safeColumns = Math.max(1, Math.floor(columns));
  const row = Math.floor(index / safeColumns);
  const column = index % safeColumns;
  return Math.min(DURATION.enterMax, (row + column) * step);
};
