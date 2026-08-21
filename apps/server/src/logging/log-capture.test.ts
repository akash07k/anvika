import { afterEach, describe, expect, it } from 'vitest';

import { serverLogger } from './logger';
import { captureServerLogs } from './log-capture';

let teardown: (() => Promise<void>) | undefined;

afterEach(async () => {
  if (teardown) await teardown();
  teardown = undefined;
});

describe('captureServerLogs', () => {
  it('captures records written under anvika at info and above', async () => {
    const capture = await captureServerLogs();
    teardown = capture.teardown;
    serverLogger('persistence').info('loaded conversation', { owner: 'local', messageCount: 3 });
    expect(capture.records).toHaveLength(1);
    const record = capture.records[0];
    expect(record?.category).toEqual(['anvika', 'server', 'persistence']);
    expect(record?.level).toBe('info');
    expect(record?.properties).toMatchObject({ owner: 'local', messageCount: 3 });
  });

  it('captures records at the requested floor (debug)', async () => {
    const capture = await captureServerLogs({ level: 'debug' });
    teardown = capture.teardown;
    serverLogger('keyboard').debug('keypress', { slot: 1 });
    expect(capture.records).toHaveLength(1);
    expect(capture.records[0]?.level).toBe('debug');
  });

  it('excludes records below the requested capture floor', async () => {
    const capture = await captureServerLogs({ level: 'warning' });
    teardown = capture.teardown;
    serverLogger('persistence').info('ignored');
    serverLogger('persistence').warning('captured');
    expect(capture.records).toHaveLength(1);
    expect(capture.records[0]?.level).toBe('warning');
  });

  it('rejects overlapping captures', async () => {
    const capture = await captureServerLogs();
    teardown = capture.teardown;
    await expect(captureServerLogs()).rejects.toThrow(
      'A server log capture is already active; release it before creating another.',
    );
  });

  it('keeps sequential captures isolated', async () => {
    const first = await captureServerLogs();
    await first.teardown();
    serverLogger('persistence').info('ignored outside a capture');
    const second = await captureServerLogs();
    teardown = second.teardown;
    serverLogger('persistence').info('captured by the next test');
    expect(first.records).toHaveLength(0);
    expect(second.records).toHaveLength(1);
  });
});
