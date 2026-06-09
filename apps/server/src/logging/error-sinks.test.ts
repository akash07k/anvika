import { afterEach, describe, expect, it, vi } from 'vitest';

import { captureServerLogs } from './log-capture';
import { createProcessErrorHandlers, installProcessErrorHandlers } from './error-sinks';

let teardownLogs: (() => Promise<void>) | undefined;

afterEach(async () => {
  if (teardownLogs) await teardownLogs();
  teardownLogs = undefined;
});

describe('createProcessErrorHandlers', () => {
  it('logs error and writes stderr for an unhandled rejection, without exiting', async () => {
    const capture = await captureServerLogs();
    teardownLogs = capture.teardown;
    const exit = vi.fn();
    const writeStderr = vi.fn();
    const { onRejection } = createProcessErrorHandlers({ exit, writeStderr });
    onRejection(new Error('boom'));
    const record = capture.records.find((r) => r.level === 'error');
    expect(record?.category).toEqual(['anvika', 'server', 'process']);
    expect(record?.properties).toMatchObject({ message: 'Error: boom' });
    expect(writeStderr).toHaveBeenCalledOnce();
    expect(exit).not.toHaveBeenCalled();
  });

  it('logs fatal, writes stderr, and exits non-zero for an uncaught exception', async () => {
    const capture = await captureServerLogs();
    teardownLogs = capture.teardown;
    const exit = vi.fn();
    const writeStderr = vi.fn();
    const { onException } = createProcessErrorHandlers({ exit, writeStderr });
    onException(new Error('kaboom'));
    const record = capture.records.find((r) => r.level === 'fatal');
    expect(record?.category).toEqual(['anvika', 'server', 'process']);
    expect(record?.properties).toMatchObject({ message: 'Error: kaboom' });
    expect(writeStderr).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe('installProcessErrorHandlers', () => {
  it('adds then removes the process listeners it registered', () => {
    const beforeRejection = process.listenerCount('unhandledRejection');
    const beforeException = process.listenerCount('uncaughtException');
    const remove = installProcessErrorHandlers();
    expect(process.listenerCount('unhandledRejection')).toBe(beforeRejection + 1);
    expect(process.listenerCount('uncaughtException')).toBe(beforeException + 1);
    remove();
    expect(process.listenerCount('unhandledRejection')).toBe(beforeRejection);
    expect(process.listenerCount('uncaughtException')).toBe(beforeException);
  });
});
