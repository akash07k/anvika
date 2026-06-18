import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useConversationDetail } from './conversationQueries';

/**
 * Regression guard for the draft-404 infinite refetch loop.
 *
 * Two sibling components observe the SAME `useConversationDetail(id)` query under one
 * `QueryClientProvider`, mirroring the real surface where the route AND `useConversationReasoning`
 * each open an observer on the same detail query. Before the fix, a draft 404 left the query in an
 * errored, always-stale state, so a second observer's mount triggered a refetch storm (hundreds of
 * requests). The fix resolves a draft 404 to `null` (a fresh success with `staleTime: Infinity`), so
 * a second observer's mount does NOT refetch and the detail fetch count stays bounded.
 */

const ID = 'xyz-789';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** A bare observer component: subscribes to the detail query and reports its status. */
function Observer({ label }: { label: string }) {
  const detail = useConversationDetail(ID);
  return (
    <div data-testid={label}>
      {label}:{detail.isPending ? 'pending' : detail.isError ? 'error' : 'success'}
    </div>
  );
}

/** Wraps children with a caller-supplied QueryClient so the cache is shared across renders. */
function Harness({ client, children }: { client: QueryClient; children: ReactNode }) {
  // Real defaults (no retry override): the loop only reproduces with the production retry/staleTime.
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useConversationDetail draft-404 loop guard', () => {
  it('settles a draft 404 across two observers without an unbounded refetch storm', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        jsonResponse({ code: 'not-found', message: 'No such conversation', details: null }, 404),
      );
    // Create the client once in the test body - not inside the component - so every render of
    // Harness shares the same cache and does not silently discard deduplication state.
    const client = new QueryClient();
    render(
      <Harness client={client}>
        <Observer label="route" />
        <Observer label="reasoning" />
      </Harness>,
    );
    // Both observers settle to success (a draft is success with data null, not an error).
    await waitFor(() => {
      expect(document.querySelector('[data-testid="route"]')).toHaveTextContent('route:success');
      expect(document.querySelector('[data-testid="reasoning"]')).toHaveTextContent(
        'reasoning:success',
      );
    });
    // The detail endpoint is requested as a string path by `apiGet`; count only those calls.
    const detailCalls = fetchSpy.mock.calls.filter(
      ([input]) => typeof input === 'string' && input.includes(`/api/v1/conversations/${ID}`),
    ).length;
    // The pre-fix loop called this unboundedly (hundreds). The fix dedups two observers to one
    // fetch; allow a small margin for any benign re-render without admitting a storm.
    expect(detailCalls).toBeLessThanOrEqual(3);
  });
});
