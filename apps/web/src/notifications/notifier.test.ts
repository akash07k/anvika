import { afterEach, describe, expect, it } from 'vitest';

import type { NotificationEvent } from './events';
import { notify, registerChannel, resetChannels } from './notifier';

afterEach(() => {
  resetChannels();
});

describe('notifier', () => {
  it('fans an event out to every registered channel', () => {
    const a: NotificationEvent[] = [];
    const b: NotificationEvent[] = [];
    registerChannel((e) => a.push(e));
    registerChannel((e) => b.push(e));

    notify({ type: 'settingsSaved' });

    expect(a).toEqual([{ type: 'settingsSaved' }]);
    expect(b).toEqual([{ type: 'settingsSaved' }]);
  });

  it('resetChannels removes all channels', () => {
    const seen: NotificationEvent[] = [];
    registerChannel((e) => seen.push(e));
    resetChannels();
    notify({ type: 'generationStarted' });
    expect(seen).toEqual([]);
  });
});
