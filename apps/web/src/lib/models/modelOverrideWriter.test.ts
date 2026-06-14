import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as apiClient from '../api-client';
import { createModelOverrideWriter } from './modelOverrideWriter';

const ID = 'bbb-222';

describe('createModelOverrideWriter', () => {
  // Use vi.spyOn (not vi.mock) to avoid a vitest jsdom teardown hang with never-settling
  // Promise factories. Both approaches intercept the same call; spyOn is safe here because
  // the test file imports the real module and patches the live binding.
  let patchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    patchSpy = vi.spyOn(apiClient, 'apiPatchNoContent');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes the chosen model id via the id-scoped 204 PATCH and resolves the tracked promise', async () => {
    patchSpy.mockResolvedValue(undefined as never);
    const writer = createModelOverrideWriter(ID);
    const p = writer.write('openai:gpt-4o');
    expect(patchSpy).toHaveBeenCalledWith(`/api/v1/conversations/${ID}/model`, {
      modelId: 'openai:gpt-4o',
    });
    await expect(p).resolves.toBeUndefined();
    await expect(writer.pending()).resolves.toBeUndefined();
  });

  it('write(null) clears the override at the id-scoped endpoint', async () => {
    patchSpy.mockResolvedValue(undefined as never);
    const writer = createModelOverrideWriter(ID);
    await writer.write(null);
    expect(patchSpy).toHaveBeenCalledWith(`/api/v1/conversations/${ID}/model`, {
      modelId: null,
    });
  });

  it('pending() awaits the latest in-flight write before resolving', async () => {
    let release!: () => void;
    patchSpy.mockImplementation(
      () =>
        new Promise<void>((r) => {
          release = () => r();
        }) as never,
    );
    const writer = createModelOverrideWriter(ID);
    void writer.write('anthropic:claude-opus-4-5');
    let settled = false;
    const waiter = writer.pending().then(() => {
      settled = true;
    });
    expect(settled).toBe(false);
    release();
    await waiter;
    expect(settled).toBe(true);
  });

  it('a rejected write does NOT reject pending() -- pending always resolves', async () => {
    patchSpy.mockRejectedValue(new Error('network error') as never);
    const writer = createModelOverrideWriter(ID);
    // The write promise itself rejects.
    await expect(writer.write('openai:gpt-4o')).rejects.toThrow('network error');
    // pending() must still resolve (never reject), so the send gate is always await-safe.
    await expect(writer.pending()).resolves.toBeUndefined();
  });
});
