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
});
