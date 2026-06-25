import { describe, expect, it, vi } from 'vitest';

import type { DiagnosticEntry } from '@anvika/shared/diagnostics/events';
import { DiagnosticEntrySchema } from '@anvika/shared/diagnostics/events';

import { createBatcher, type Batcher } from './batcher';
import type { TransportResult } from './transport';

function entry(seq: number): DiagnosticEntry {
  return { seq, at: seq, event: { type: 'milestone', code: 'app-mounted' } };
}

describe('createBatcher', () => {
  it('flushes enqueued entries through the transport', async () => {
    const sent: DiagnosticEntry[][] = [];
    const post = vi.fn(async (b: readonly DiagnosticEntry[]): Promise<TransportResult> => {
      sent.push([...b]);
      return 'ok';
    });
    const batcher = createBatcher({ post, maxQueue: 100, maxBatch: 50 });
    batcher.enqueue(entry(1));
    batcher.enqueue(entry(2));
    await batcher.flush();
    expect(sent).toEqual([[entry(1), entry(2)]]);
  });

  it('re-enqueues on a retry result so the next flush resends', async () => {
    const results: TransportResult[] = ['retry', 'ok'];
    const sent: DiagnosticEntry[][] = [];
    const post = vi.fn(async (b: readonly DiagnosticEntry[]): Promise<TransportResult> => {
      sent.push([...b]);
      return results.shift() ?? 'ok';
    });
    const batcher = createBatcher({ post, maxQueue: 100, maxBatch: 50 });
    batcher.enqueue(entry(1));
    await batcher.flush();
    await batcher.flush();
    expect(sent).toEqual([[entry(1)], [entry(1)]]);
  });

  it('drops a poison batch and emits a single logTransportError next flush', async () => {
    const sent: DiagnosticEntry[][] = [];
    const post = vi.fn(async (b: readonly DiagnosticEntry[]): Promise<TransportResult> => {
      sent.push([...b]);
      return b[0]?.event.type === 'milestone' ? 'poison' : 'ok';
    });
    const batcher = createBatcher({ post, maxQueue: 100, maxBatch: 50 });
    batcher.enqueue(entry(1));
    await batcher.flush();
    await batcher.flush();
    expect(sent[1]?.[0]?.event.type).toBe('logTransportError');
    const report = sent[1]?.[0];
    expect(report).toBeDefined();
    expect(report?.seq).toBeGreaterThanOrEqual(0);
    expect(report?.at).toBeGreaterThanOrEqual(0);
    expect(() => DiagnosticEntrySchema.parse(report)).not.toThrow();
  });

  it('drops oldest on overflow and self-reports the dropped count', async () => {
    const sent: DiagnosticEntry[][] = [];
    const post = vi.fn(async (b: readonly DiagnosticEntry[]): Promise<TransportResult> => {
      sent.push([...b]);
      return 'ok';
    });
    const batcher = createBatcher({ post, maxQueue: 2, maxBatch: 50 });
    batcher.enqueue(entry(1));
    batcher.enqueue(entry(2));
    batcher.enqueue(entry(3)); // evicts entry(1)
    await batcher.flush();
    const flat = sent.flat();
    expect(flat.some((e) => e.event.type === 'logsDropped')).toBe(true);
    expect(flat.some((e) => e.seq === 1)).toBe(false);
    const drop = flat.find((e) => e.event.type === 'logsDropped');
    expect(drop?.event).toMatchObject({ type: 'logsDropped', count: 1 });
    expect(drop).toBeDefined();
    expect(() => DiagnosticEntrySchema.parse(drop)).not.toThrow(); // valid envelope (seq>=0, at>=0)
  });

  it('draws self-report seq from an injected shared counter (no collision with main events)', async () => {
    let shared = 100; // stands in for the session counter shared with createDiagnostics
    const sent: DiagnosticEntry[][] = [];
    const post = vi.fn(async (b: readonly DiagnosticEntry[]): Promise<TransportResult> => {
      sent.push([...b]);
      return 'ok';
    });
    const batcher = createBatcher({ post, maxQueue: 1, maxBatch: 50, nextSeq: () => shared++ });
    batcher.enqueue(entry(1));
    batcher.enqueue(entry(2)); // evicts entry(1) -> dropped=1
    await batcher.flush();
    const drop = sent.flat().find((e) => e.event.type === 'logsDropped');
    expect(drop?.seq).toBe(100); // from the shared counter, NOT a local 0 that could collide
  });

  it('does nothing on an empty flush', async () => {
    const post = vi.fn(async (): Promise<TransportResult> => 'ok');
    const batcher = createBatcher({ post, maxQueue: 100, maxBatch: 50 });
    await batcher.flush();
    expect(post).not.toHaveBeenCalled();
  });

  it('re-applies the drop-oldest bound after a retry re-enqueues (never exceeds maxQueue)', async () => {
    let batcher: Batcher;
    let injected = false;
    const sent: DiagnosticEntry[][] = [];
    const post = vi.fn(async (b: readonly DiagnosticEntry[]): Promise<TransportResult> => {
      sent.push([...b]);
      if (!injected) {
        injected = true;
        // Entries arriving while the first batch is in flight fill the queue to the bound; the
        // retry then unshifts the sent batch back on top, which must NOT leave the queue over bound.
        batcher.enqueue(entry(3));
        batcher.enqueue(entry(4));
        return 'retry';
      }
      return 'ok';
    });
    batcher = createBatcher({ post, maxQueue: 2, maxBatch: 2 });
    batcher.enqueue(entry(1));
    batcher.enqueue(entry(2));
    await batcher.flush();
    expect(batcher.size()).toBeLessThanOrEqual(2);
    await batcher.flush();
    const drop = sent.flat().find((e) => e.event.type === 'logsDropped');
    expect(drop?.event).toMatchObject({ type: 'logsDropped', count: 2 });
  });

  it('reports isDisabled() true only after a disabled result', async () => {
    const post = vi.fn(async (): Promise<TransportResult> => 'disabled');
    const batcher = createBatcher({ post, maxQueue: 100, maxBatch: 100 });
    expect(batcher.isDisabled()).toBe(false);
    batcher.enqueue(entry(1));
    await batcher.flush();
    expect(batcher.isDisabled()).toBe(true);
  });
});

describe('createBatcher disabled', () => {
  it('clears the queue and goes no-op after a disabled result', async () => {
    const post = vi.fn<(e: readonly DiagnosticEntry[]) => Promise<TransportResult>>();
    post.mockResolvedValueOnce('disabled');
    const batcher = createBatcher({ post, maxQueue: 100, maxBatch: 100 });
    batcher.enqueue({ seq: 0, at: 0, event: { type: 'milestone', code: 'app-mounted' } });
    await batcher.flush();
    expect(batcher.size()).toBe(0);

    batcher.enqueue({ seq: 1, at: 0, event: { type: 'milestone', code: 'app-mounted' } });
    expect(batcher.size()).toBe(0);
    await batcher.flush();
    expect(post).toHaveBeenCalledTimes(1);
  });
});
