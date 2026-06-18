import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Stub ConversationView so the route test exercises only the detail-query gating (pending, error,
// not-found-as-draft, loaded) and the props the route threads - not the full chat surface.
vi.mock('../components/ConversationView', () => ({
  ConversationView: (props: { conversationId?: string; initialMessages?: unknown[] }) => (
    <div data-testid="surface">
      surface:{props.conversationId}:{props.initialMessages?.length ?? 0}
    </div>
  ),
}));

import { ConversationRoute } from './c.$conversationId';

const ID = 'xyz-789';

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (children: ReactNode) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(ui(<ConversationRoute conversationId={ID} />));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('/c/$conversationId route', () => {
  it('renders the surface hydrated from useConversationDetail(id)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        messages: [{ id: 'u1', role: 'user', parts: [] }],
        reasoningOverride: null,
        modelId: null,
        title: 'First',
        revision: 1,
      }),
    );
    renderRoute();
    // The page heading is present so route focus lands on it (even while loading).
    expect(screen.getByRole('heading', { level: 1, name: 'Conversation' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('surface')).toHaveTextContent(`surface:${ID}:1`));
    // The document title reflects the loaded conversation title (a screen reader announces it on
    // navigation), formatted as "<title> - Anvika".
    expect(document.title).toBe('First - Anvika');
  });

  it('treats a not-found (404) detail as an empty draft surface, not an error', async () => {
    // A 404 resolves to a success with data null (the draft has no row yet), so the route renders
    // the empty surface via the success-null path - never the error branch.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ code: 'not-found', message: 'No such conversation', details: null }, 404),
    );
    renderRoute();
    await waitFor(() => expect(screen.getByTestId('surface')).toHaveTextContent(`surface:${ID}:0`));
    // A draft 404 must NOT surface as an error.
    expect(screen.queryByText(/could not load/i)).toBeNull();
    // A draft has no persisted title, so the tab falls back to the untitled label rather than reading
    // empty or "undefined".
    expect(document.title).toBe('Untitled conversation - Anvika');
  });

  it('shows a non-alert error region (with the heading) on a real load failure', async () => {
    // A malformed (schema-invalid) body is a deterministic load failure: it settles to the generic
    // error branch (NOT not-found), so the surface stays hidden and the error region shows.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ messages: 'not-an-array' }, 200),
    );
    renderRoute();
    await waitFor(() => expect(screen.getByText(/could not load/i)).toBeInTheDocument());
    expect(screen.getByRole('heading', { level: 1, name: 'Conversation' })).toBeInTheDocument();
    // Single-source error policy: no role="alert" double-speak in the conversation route.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByTestId('surface')).toBeNull();
  });
});
