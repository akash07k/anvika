import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useSettingsStore } from '../../stores/settingsStore';

// SettingsForm now calls useModels() (a TanStack Query hook). This test renders SettingsView
// without a QueryClientProvider, so stub the hook to a successful empty list - the models query is
// covered by useModels.test.tsx; here we only assert the form hydrates and renders.
vi.mock('../../hooks/conversation/useModels', () => ({
  useModels: () => ({ data: [], isSuccess: true }),
  useConnectionStatuses: () => ({ data: [], isSuccess: true }),
}));
// The connections fieldset (rendered transitively) calls useSetConnectionSecret() (a TanStack
// mutation). With no QueryClientProvider here, stub it to an inert mutation - the two-call save is
// covered by ConnectionsFieldset.test.tsx; this test only asserts the settings surface renders.
vi.mock('../../hooks/connections/useSetConnectionSecret', () => ({
  useSetConnectionSecret: () => ({ mutateAsync: vi.fn() }),
}));
// The Manage conversations dialog's launch button calls useConversationList() for its count, and the
// dialog body (mounted only when opened) uses the batch-delete hook. With no QueryClientProvider here,
// stub useConversationList to an empty list and the batch-delete hook to an inert action - the dialog's
// own behavior is covered by ManageConversationsDialog/List's tests; here we only assert the settings
// surface renders. importOriginal preserves the other conversationQueries exports those hooks import.
vi.mock('../../lib/conversation/conversationQueries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/conversation/conversationQueries')>()),
  useConversationList: () => ({ data: { conversations: [], activeId: null } }),
}));
vi.mock('../conversations/useBatchDeleteConversations', () => ({
  useBatchDeleteConversations: () => ({ removeMany: vi.fn() }),
}));

import { SettingsView } from './SettingsView';

const view = {
  version: 4,
  settings: {
    connections: [],
    selectedModelId: '',
    announcementPeriodMs: 2000,
    readWholeOnComplete: false,
    focusOnCompletion: 'keep',
    sendKeyMode: 'modEnter',
    quickNavSinglePressReads: 'descriptor',
    quickNavDoublePressMs: 500,
    hotkeyBindings: {},
    currency: 'USD',
    inrPerUsd: 95.11,
    autoRefreshFxRate: false,
    inrPerUsdUpdatedAt: null,
  },
};

const paths = { settings: '/data/settings.json', secrets: '/data/secrets.json' };

afterEach(() => {
  vi.restoreAllMocks();
  useSettingsStore.setState({
    status: 'idle',
    version: null,
    settings: null,
    error: null,
    fieldErrors: {},
    recovered: false,
    paths: null,
    invalidFilePrompt: null,
  });
});

/** Put the store into a ready state with the given overrides, bypassing the network. */
function setReady(overrides: Partial<ReturnType<typeof useSettingsStore.getState>> = {}) {
  useSettingsStore.setState({
    status: 'ready',
    version: view.version,
    settings: view.settings as never,
    error: null,
    fieldErrors: {},
    recovered: false,
    paths,
    invalidFilePrompt: null,
    ...overrides,
  });
}

describe('SettingsView', () => {
  it('shows a loading status, then the settings form once hydrated', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ...view, recovered: false, paths }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    render(<SettingsView />);
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
    await waitFor(() => expect(screen.getByRole('form', { name: 'Settings' })).toBeInTheDocument());
  });

  it('has a Reload settings button that calls the store reload action', () => {
    const reload = vi.fn(async () => undefined);
    setReady({ reload });
    render(<SettingsView />);
    fireEvent.click(screen.getByRole('button', { name: /reload settings/i }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('renders the resolved settings and secrets file paths as read-only text', () => {
    setReady();
    render(<SettingsView />);
    expect(screen.getByText('Settings file: /data/settings.json')).toBeInTheDocument();
    expect(screen.getByText('Secrets file: /data/secrets.json')).toBeInTheDocument();
  });

  it('omits the file paths section when paths are unknown', () => {
    setReady({ paths: null });
    render(<SettingsView />);
    expect(screen.queryByText('/data/settings.json')).not.toBeInTheDocument();
  });

  it('shows the confirm dialog when an invalid-file save is pending, wiring confirm/cancel', () => {
    const confirmInvalidOverwrite = vi.fn(async () => undefined);
    const cancelInvalidOverwrite = vi.fn();
    setReady({
      invalidFilePrompt: { wirePatch: { connections: [] }, optimistic: (s) => s },
      confirmInvalidOverwrite,
      cancelInvalidOverwrite,
    });
    render(<SettingsView />);
    expect(screen.getByRole('heading', { name: /overwrite/i })).toBeInTheDocument();
    expect(screen.getByText(/\/data\/settings\.json/, { selector: 'p' })).toBeInTheDocument();
    // Only the overwrite ConfirmDialog is open (the connections fieldset's ConfirmDialog is closed and
    // unmounted under Radix), so scope the action queries to the alertdialog.
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /overwrite/i }));
    expect(confirmInvalidOverwrite).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dialog).getByRole('button', { name: /^cancel$/i }));
    expect(cancelInvalidOverwrite).toHaveBeenCalledTimes(1);
  });

  it('keeps the confirm dialog closed when no overwrite is pending', () => {
    setReady();
    render(<SettingsView />);
    // The shadcn AlertDialog unmounts its content when closed, so no alertdialog is in the tree.
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('opens the keyboard shortcuts dialog from the View keyboard shortcuts button', async () => {
    setReady();
    render(<SettingsView />);
    const button = await screen.findByRole('button', { name: 'View keyboard shortcuts' });
    fireEvent.click(button);
    // The shadcn shortcuts dialog renders as a [role=dialog] (not a native <dialog>) when opened;
    // the name filter picks it out from any other dialog in the view.
    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(dialog).getByText('Open keyboard shortcuts: Alt+/')).toBeInTheDocument();
  });
});
