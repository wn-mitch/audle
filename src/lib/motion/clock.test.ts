import { describe, expect, it } from 'vitest';
import { createFrameClock } from './clock';

const fakeFrames = () => {
  const queue = new Map<number, (now: number) => void>();
  let next = 1;
  let cancelled = 0;
  return {
    queue,
    cancelledCount: () => cancelled,
    clock: createFrameClock(
      (callback) => {
        const handle = next++;
        queue.set(handle, callback);
        return handle;
      },
      (handle) => {
        if (queue.delete(handle)) cancelled += 1;
      },
    ),
    flush(now: number) {
      const pending = [...queue.values()];
      queue.clear();
      for (const callback of pending) callback(now);
    },
  };
};

describe('createFrameClock', () => {
  it('shares one frame request across subscribers', () => {
    const frames = fakeFrames();
    const seen: string[] = [];
    frames.clock.subscribeFrame(() => seen.push('a'));
    frames.clock.subscribeFrame(() => seen.push('b'));
    expect(frames.queue.size).toBe(1);
    frames.flush(16);
    expect(seen).toEqual(['a', 'b']);
    expect(frames.queue.size).toBe(1);
  });

  it('stops requesting frames when the last subscriber leaves', () => {
    const frames = fakeFrames();
    const stopA = frames.clock.subscribeFrame(() => undefined);
    const stopB = frames.clock.subscribeFrame(() => undefined);
    stopA();
    expect(frames.queue.size).toBe(1);
    stopB();
    expect(frames.queue.size).toBe(0);
    expect(frames.cancelledCount()).toBe(1);
  });

  it('lets a callback unsubscribe from inside a frame without a stale request', () => {
    const frames = fakeFrames();
    let calls = 0;
    const stop = frames.clock.subscribeFrame(() => {
      calls += 1;
      stop();
    });
    frames.flush(16);
    frames.flush(32);
    expect(calls).toBe(1);
    expect(frames.queue.size).toBe(0);
  });
});
