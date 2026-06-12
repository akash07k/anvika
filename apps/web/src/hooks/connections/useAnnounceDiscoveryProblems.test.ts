import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../notifications/notifier', () => ({ notify: vi.fn() }));

import { notify } from '../../notifications/notifier';
import { useAnnounceDiscoveryProblems } from './useAnnounceDiscoveryProblems';

const conns = [{ id: 'local', label: 'Local' }] as never;

describe('useAnnounceDiscoveryProblems', () => {
  it('announces once on first load naming the connection, and stays silent on an unchanged refetch', () => {
    const statuses = [{ connectionId: 'local', outcome: 'unreachable' }] as never;
    const { rerender } = renderHook(({ s }) => useAnnounceDiscoveryProblems(s, conns), {
      initialProps: { s: statuses },
    });
    expect(notify).toHaveBeenCalledWith({ type: 'modelDiscoveryProblem', labels: ['Local'] });
    vi.mocked(notify).mockClear();
    rerender({ s: [{ connectionId: 'local', outcome: 'unreachable' }] as never }); // same problem, new array
    expect(notify).not.toHaveBeenCalled();
  });

  it('stays silent when there are no problems', () => {
    renderHook(() =>
      useAnnounceDiscoveryProblems([{ connectionId: 'local', outcome: 'ok' }] as never, conns),
    );
    expect(notify).not.toHaveBeenCalled();
  });

  it('re-announces when the same problem clears then reappears', () => {
    const problem = [{ connectionId: 'local', outcome: 'unreachable' }] as never;
    const clear = [{ connectionId: 'local', outcome: 'ok' }] as never;
    const { rerender } = renderHook(({ s }) => useAnnounceDiscoveryProblems(s, conns), {
      initialProps: { s: problem },
    });
    // First appearance - announced.
    expect(notify).toHaveBeenCalledWith({ type: 'modelDiscoveryProblem', labels: ['Local'] });
    vi.mocked(notify).mockClear();

    // Problem clears.
    rerender({ s: clear });
    expect(notify).not.toHaveBeenCalled();

    // Same problem reappears - must be announced again.
    rerender({ s: problem });
    expect(notify).toHaveBeenCalledWith({ type: 'modelDiscoveryProblem', labels: ['Local'] });
  });
});
