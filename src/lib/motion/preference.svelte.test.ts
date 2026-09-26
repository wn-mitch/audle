import { afterEach, describe, expect, it } from 'vitest';
import { motion, setMotionMode, watchMotionPreference } from './preference.svelte';

type Listener = () => void;
const fakeMedia = (matches: boolean) => {
  const listeners = new Set<Listener>();
  const media = {
    matches,
    addEventListener: (_: 'change', listener: Listener) => listeners.add(listener),
    removeEventListener: (_: 'change', listener: Listener) => listeners.delete(listener),
  };
  return {
    media,
    listeners,
    flip: () => {
      media.matches = !media.matches;
      listeners.forEach((listener) => listener());
    },
  };
};

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  motion.allowed = true;
  setMotionMode('spring');
});

describe('watchMotionPreference', () => {
  it('mirrors the reduced-motion query and follows changes', () => {
    const fake = fakeMedia(true);
    dispose = watchMotionPreference(() => fake.media);
    expect(motion.allowed).toBe(false);
    fake.flip();
    expect(motion.allowed).toBe(true);
  });

  it('attaches one listener across repeated calls and removes it on dispose', () => {
    const fake = fakeMedia(false);
    let calls = 0;
    dispose = watchMotionPreference(() => {
      calls += 1;
      return fake.media;
    });
    const again = watchMotionPreference(() => {
      calls += 1;
      return fake.media;
    });
    expect(again).toBe(dispose);
    expect(calls).toBe(1);
    expect(fake.listeners.size).toBe(1);
    dispose();
    dispose = undefined;
    expect(fake.listeners.size).toBe(0);
  });

  it('can be re-armed after dispose', () => {
    const first = fakeMedia(false);
    watchMotionPreference(() => first.media)();
    const second = fakeMedia(true);
    dispose = watchMotionPreference(() => second.media);
    expect(motion.allowed).toBe(false);
  });
});

describe('setMotionMode', () => {
  it('switches the release curve', () => {
    setMotionMode('quint');
    expect(motion.mode).toBe('quint');
  });
});
