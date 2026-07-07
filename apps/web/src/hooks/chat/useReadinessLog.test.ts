import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChatReadiness } from './useChatReadiness';
import { logDiag } from '../../diagnostics/logDiag';
import { useReadinessLog } from './useReadinessLog';

vi.mock('../../diagnostics/logDiag', () => ({ logDiag: vi.fn() }));

describe('useReadinessLog', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not log while readiness is loading', () => {
    renderHook(() => useReadinessLog('loading'));
    expect(logDiag).not.toHaveBeenCalled();
  });

  it('logs the resolved state once, even across re-renders', () => {
    const { rerender } = renderHook((r: ChatReadiness) => useReadinessLog(r), {
      initialProps: 'ready' as ChatReadiness,
    });
    rerender('ready');
    rerender('ready');
    expect(logDiag).toHaveBeenCalledTimes(1);
    expect(logDiag).toHaveBeenCalledWith({ type: 'chatReadinessResolved', state: 'ready' });
  });

  it('logs the resolved state on the loading-to-resolved transition, then never again', () => {
    const { rerender } = renderHook((r: ChatReadiness) => useReadinessLog(r), {
      initialProps: 'loading' as ChatReadiness,
    });
    expect(logDiag).not.toHaveBeenCalled();
    rerender('unconfigured');
    expect(logDiag).toHaveBeenCalledTimes(1);
    expect(logDiag).toHaveBeenCalledWith({ type: 'chatReadinessResolved', state: 'unconfigured' });
    rerender('ready');
    expect(logDiag).toHaveBeenCalledTimes(1);
  });
});
