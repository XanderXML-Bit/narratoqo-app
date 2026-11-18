import { describe, expect, it } from 'vitest';
import { SynthesisQueue, SynthesisCancelledError } from './SynthesisQueue';

const deferred = () => {
  let resolve!: (v: string) => void;
  const promise = new Promise<string>((r) => { resolve = r; });
  return { promise, resolve };
};

describe('SynthesisQueue', () => {
  it('runs one job at a time, foreground before queued background', async () => {
    const queue = new SynthesisQueue();
    const order: number[] = [];
    const first = deferred();
    const a = queue.enqueue(1, () => { order.push(1); return first.promise; }, 'background');
    const b = queue.enqueue(2, async () => { order.push(2); return 'b'; }, 'background');
    const c = queue.enqueue(3, async () => { order.push(3); return 'c'; }, 'foreground');
    await Promise.resolve();
    expect(order).toEqual([1]);
    first.resolve('a');
    expect(await Promise.all([a, b, c])).toEqual(['a', 'b', 'c']);
    expect(order).toEqual([1, 3, 2]);
  });

  it('dropBackground rejects queued preloads, keeps foreground jobs and the running one', async () => {
    const queue = new SynthesisQueue();
    const ran: number[] = [];
    const first = deferred();
    const running = queue.enqueue(1, () => { ran.push(1); return first.promise; }, 'background');
    const bg = queue.enqueue(2, async () => { ran.push(2); return 'x'; }, 'background');
    const promoted = queue.enqueue(3, async () => { ran.push(3); return 'p'; }, 'background');
    queue.promote(3);
    await Promise.resolve();

    expect(queue.dropBackground()).toBe(1);
    await expect(bg).rejects.toBeInstanceOf(SynthesisCancelledError);
    first.resolve('r');
    expect(await running).toBe('r');
    expect(await promoted).toBe('p');
    expect(ran).toEqual([1, 3]);
    expect(queue.size).toBe(0);
  });
});
