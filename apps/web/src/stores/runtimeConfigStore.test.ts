import { afterEach, describe, expect, it } from 'vitest';

import { useRuntimeConfigStore } from './runtimeConfigStore';

afterEach(() => useRuntimeConfigStore.setState({ logContent: false }));

describe('runtimeConfigStore', () => {
  it('defaults logContent to false', () => {
    expect(useRuntimeConfigStore.getState().logContent).toBe(false);
  });

  it('setLogContent updates the flag', () => {
    useRuntimeConfigStore.getState().setLogContent(true);
    expect(useRuntimeConfigStore.getState().logContent).toBe(true);
  });
});
