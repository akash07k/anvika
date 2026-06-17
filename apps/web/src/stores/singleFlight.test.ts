import { describe, expect, it } from 'vitest';

import { createSingleFlight } from './singleFlight';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('createSingleFlight', () => {
  it('runs operations in enqueue order even when a later one would finish first', async () => {
    const run = createSingleFlight();
    const order: number[] = [];
    const a = run(async () => {
      await delay(20);
      order.push(1);
    });
    const b = run(async () => {
      await delay(1);
      order.push(2);
    });
    await Promise.all([a, b]);
    expect(order).toEqual([1, 2]);
  });

  it('does not start the next operation until the previous one settles', async () => {
    const run = createSingleFlight();
    let started = false;
    let release!: () => void;
    const first = run(() => new Promise<void>((resolve) => (release = resolve)));
    const second = run(async () => {
      started = true;
    });
    await Promise.resolve();
    expect(started).toBe(false); // queued behind the pending first
    release();
    await Promise.all([first, second]);
    expect(started).toBe(true);
  });

  it('does not stall the queue when an operation rejects, and surfaces its own outcome', async () => {
    const run = createSingleFlight();
    const order: number[] = [];
    const a = run(async () => {
      throw new Error('boom');
    });
    const b = run(async () => {
      order.push(2);
    });
    await expect(a).rejects.toThrow('boom');
    await b;
    expect(order).toEqual([2]);
  });
});
