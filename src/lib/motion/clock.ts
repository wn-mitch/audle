type FrameCallback = (now: number) => void;

export interface FrameClock {
  /** Runs the callback every frame until the returned function is called. The loop starts with
   * the first subscriber and stops when the last one leaves. */
  subscribeFrame(callback: FrameCallback): () => void;
}

/** One shared animation-frame loop, so several readouts cost a single frame request. */
export const createFrameClock = (
  request: (callback: FrameCallback) => number,
  cancel: (handle: number) => void,
): FrameClock => {
  const callbacks = new Set<FrameCallback>();
  let handle: number | undefined;
  const tick = (now: number) => {
    handle = undefined;
    for (const callback of callbacks) callback(now);
    if (callbacks.size > 0) handle = request(tick);
  };
  return {
    subscribeFrame(callback) {
      callbacks.add(callback);
      handle ??= request(tick);
      return () => {
        callbacks.delete(callback);
        if (callbacks.size === 0 && handle !== undefined) {
          cancel(handle);
          handle = undefined;
        }
      };
    },
  };
};

const clock = createFrameClock(
  (callback) => requestAnimationFrame(callback),
  (handle) => cancelAnimationFrame(handle),
);

export const subscribeFrame = (callback: FrameCallback): (() => void) =>
  clock.subscribeFrame(callback);
