import { describe, expect, it, vi } from 'vitest';
import { createBeatMotion, type MotionTarget } from './beat';

type Call = { target: unknown; params: Record<string, unknown> };

const harness = (allowed: boolean, connected = true) => {
  const calls: Call[] = [];
  const attributes = new Map<string, string>();
  const glyph = { isConnected: connected };
  const element: MotionTarget = {
    isConnected: connected,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
    querySelector: (() => glyph) as MotionTarget['querySelector'],
  };
  const animate = vi.fn((target: unknown, params: Record<string, unknown>) => {
    calls.push({ target, params });
    return {} as never;
  });
  const beat = createBeatMotion({
    animate: animate as unknown as Parameters<typeof createBeatMotion>[0]['animate'],
    allowed: () => allowed,
    mode: () => 'spring',
  });
  return { beat, calls, attributes, element, glyph };
};

describe('createBeatMotion', () => {
  it('does nothing under reduced motion', () => {
    const { beat, calls, attributes, element } = harness(false);
    beat.flashHit(element);
    beat.pulseBeat([element]);
    beat.accentHitMark(element);
    beat.meterKick(element, { floor: 0.3 });
    expect(calls).toHaveLength(0);
    expect(attributes.has('data-hit')).toBe(false);
  });

  it('skips elements that have left the document', () => {
    const { beat, calls, element } = harness(true, false);
    beat.flashHit(element);
    expect(calls).toHaveLength(0);
  });

  it('flashes the glyph and the ring, marking the hit while it lasts', () => {
    const { beat, calls, attributes, element, glyph } = harness(true);
    beat.flashHit(element);
    expect(attributes.get('data-hit')).toBe('true');
    expect(calls[0]?.target).toBe(glyph);
    expect(calls[0]?.params.scale).toEqual([1, 1.14, 1]);
    expect(calls[1]?.target).toBe(element);
    expect(calls[1]?.params['--flash']).toEqual([1, 0]);
    for (const call of calls) expect(call.params.composition).toBe('replace');
    (calls[1]?.params.onComplete as () => void)();
    expect(attributes.has('data-hit')).toBe(false);
  });

  it('accents the downbeat pulse', () => {
    const { beat, calls, element } = harness(true);
    beat.pulseBeat([element], { accent: true });
    beat.pulseBeat([element]);
    expect(calls[0]?.params.scale).toEqual([1, 1.1, 1]);
    expect(calls[1]?.params.scale).toEqual([1, 1.05, 1]);
  });

  it('decays the meter from the peak to the floor', () => {
    const { beat, calls, element } = harness(true);
    beat.meterKick(element, { floor: 0.3 });
    expect(calls[0]?.params['--level']).toEqual([1, 0.3]);
  });

  it('accents an audible timeline hit without shifting its position', () => {
    const { beat, calls, element } = harness(true);
    beat.accentHitMark(element);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.params.scale).toEqual([1, 1.7, 1]);
    expect(calls[0]?.params.composition).toBe('replace');
  });
});
