import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Connection } from '@anvika/shared/settings/connection';
import type { RedactedSettings } from '@anvika/shared/settings/redact';

vi.mock('../../hooks/connections/useTestConnection', () => ({
  useTestConnection: () => ({ mutate: vi.fn(), isPending: false, data: undefined }),
}));

// The secret PUT is the second of the two save calls. Mock the hook so each test can resolve or
// reject `mutateAsync` to drive the success and partial-failure paths without a real network call.
const secretMutateAsync = vi.fn<(args: { id: string; patch: unknown }) => Promise<void>>();
vi.mock('../../hooks/connections/useSetConnectionSecret', () => ({
  useSetConnectionSecret: () => ({ mutateAsync: secretMutateAsync }),
}));

import { queryClient } from '../../lib/queryClient';
import { modelsQueryKey } from '../../hooks/conversation/useModels';

import { ConnectionsFieldset } from './ConnectionsFieldset';
import {
  addNative,
  addNativeWithKey,
  captured,
  firstCall,
  okPatch,
  registerCaptureHooks,
  render,
  settings,
} from './ConnectionsFieldset.testkit';

registerCaptureHooks();

beforeEach(() => {
  // Default: the secret PUT succeeds. Partial-failure tests override with a rejection.
  secretMutateAsync.mockReset();
  secretMutateAsync.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ConnectionsFieldset save flow', () => {
  it('lists each connection under a Connections section heading', () => {
    render(<ConnectionsFieldset settings={settings()} onPatch={vi.fn()} />);
    expect(screen.getByRole('group', { name: /connections/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Connections (2)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Venice' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'OpenAI' })).toBeInTheDocument();
  });

  it('reveals the add form and Cancel restores focus to the Add button', async () => {
    const user = userEvent.setup();
    render(<ConnectionsFieldset settings={settings()} onPatch={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Add connection' }));
    expect(screen.getByRole('heading', { name: 'Add connection', level: 3 })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.getByRole('button', { name: 'Add connection' })).toHaveFocus();
  });

  it('dispatches an add patch that includes the new connection and keeps siblings secret-safe', async () => {
    const onPatch = okPatch();
    const user = userEvent.setup();
    render(<ConnectionsFieldset settings={settings()} onPatch={onPatch} />);
    await addNative(user, 'New One');

    expect(onPatch).toHaveBeenCalledTimes(1);
    const call = firstCall(onPatch);
    // The fieldset raises its own precise connectionSaved, so the store-level "Settings saved" must
    // be suppressed: every connection PATCH passes { announce: false } (no double-speak).
    expect(call[2]).toEqual({ announce: false });
    const wire = (call[0] as { connections: Connection[] }).connections;
    const ids = wire.map((c) => c.id);
    expect(ids).toContain('new-one');
    // The PUBLIC connections wire carries no secrets: each sibling is projected to its public shape,
    // dropping apiKey AND every header value entirely (Option C - secrets travel only via the secret
    // PUT). So the Venice sibling has neither an apiKey nor a headers field on the wire.
    const venice = wire.find((c) => c.id === 'venice');
    expect(venice).not.toHaveProperty('apiKey');
    expect(venice).not.toHaveProperty('headers');
    const openai = wire.find((c) => c.id === 'openai');
    expect(openai).not.toHaveProperty('apiKey');
  });

  it('announces connectionSaved and moves focus to the saved row heading', async () => {
    const onPatch = okPatch();
    const user = userEvent.setup();
    const { rerender } = render(<ConnectionsFieldset settings={settings()} onPatch={onPatch} />);
    await addNative(user, 'New One');

    expect(captured).toContainEqual({ type: 'connectionSaved', label: 'New One' });
    // Simulate the store write-through re-rendering the parent with the optimistic result.
    const next = firstCall(onPatch)[0] as { connections: Connection[] };
    rerender(
      <ConnectionsFieldset
        settings={{ ...settings(), connections: next.connections } as unknown as RedactedSettings}
        onPatch={onPatch}
      />,
    );
    expect(screen.getByRole('heading', { level: 3, name: 'New One' })).toHaveFocus();
  });

  it('on a save with a secret, calls the public PATCH then the secret PUT and announces saved', async () => {
    const onPatch = okPatch();
    const user = userEvent.setup();
    render(<ConnectionsFieldset settings={settings()} onPatch={onPatch} />);
    await addNativeWithKey(user, 'New One', 'sk-secret');

    expect(onPatch).toHaveBeenCalledTimes(1);
    expect(secretMutateAsync).toHaveBeenCalledTimes(1);
    const args = secretMutateAsync.mock.calls[0]?.[0] as { id: string; patch: { apiKey?: string } };
    expect(args.id).toBe('new-one');
    expect(args.patch.apiKey).toBe('sk-secret');
    // With a secret to write, the public PATCH defers the models invalidation to the secret PUT, so it
    // passes skipModelsInvalidation alongside the silent announce flag (single, post-key invalidation),
    // plus the content-safe label so an invalid-file overwrite can warn the key was not written.
    expect(firstCall(onPatch)[2]).toEqual({
      announce: false,
      skipModelsInvalidation: true,
      pendingSecretLabel: 'New One',
    });
    expect(captured).toContainEqual({ type: 'connectionSaved', label: 'New One' });
    expect(captured).not.toContainEqual(expect.objectContaining({ type: 'connectionSaveFailed' }));
  });

  it('on a save with no secret, skips the secret PUT and announces saved', async () => {
    const onPatch = okPatch();
    const user = userEvent.setup();
    render(<ConnectionsFieldset settings={settings()} onPatch={onPatch} />);
    await addNative(user, 'New One');

    expect(onPatch).toHaveBeenCalledTimes(1);
    expect(secretMutateAsync).not.toHaveBeenCalled();
    // With no secret the public PATCH's own single invalidation is correct, so it must NOT skip it.
    expect(firstCall(onPatch)[2]).toEqual({ announce: false });
    expect(captured).toContainEqual({ type: 'connectionSaved', label: 'New One' });
  });

  it('announces connectionSaveFailed when the secret PUT rejects (public PATCH already committed)', async () => {
    const onPatch = okPatch();
    secretMutateAsync.mockRejectedValueOnce(new Error('secret write failed'));
    const user = userEvent.setup();
    render(<ConnectionsFieldset settings={settings()} onPatch={onPatch} />);
    await addNativeWithKey(user, 'New One', 'sk-secret');

    expect(onPatch).toHaveBeenCalledTimes(1);
    expect(secretMutateAsync).toHaveBeenCalledTimes(1);
    expect(captured).toContainEqual({ type: 'connectionSaveFailed', label: 'New One' });
    expect(captured).not.toContainEqual({ type: 'connectionSaved', label: 'New One' });
  });

  it('invalidates the models query when the secret PUT rejects (public config committed)', async () => {
    // The public PATCH deferred its models invalidation to the secret PUT (skipModelsInvalidation).
    // When that PUT fails the public config has still persisted, so handleSubmit must invalidate the
    // models query itself - otherwise the picker stays stale (useModels has a 5-min staleTime).
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    const onPatch = okPatch();
    secretMutateAsync.mockRejectedValueOnce(new Error('secret write failed'));
    const user = userEvent.setup();
    render(<ConnectionsFieldset settings={settings()} onPatch={onPatch} />);
    await addNativeWithKey(user, 'New One', 'sk-secret');

    expect(invalidate).toHaveBeenCalledWith({ queryKey: modelsQueryKey });
  });

  it('skips the secret PUT and does not announce saved when the public PATCH fails', async () => {
    const onPatch = vi.fn().mockResolvedValue(false);
    const user = userEvent.setup();
    render(<ConnectionsFieldset settings={settings()} onPatch={onPatch} />);
    await addNativeWithKey(user, 'New One', 'sk-secret');

    expect(onPatch).toHaveBeenCalledTimes(1);
    expect(secretMutateAsync).not.toHaveBeenCalled();
    expect(captured).not.toContainEqual({ type: 'connectionSaved', label: 'New One' });
    expect(captured).not.toContainEqual({ type: 'connectionSaveFailed', label: 'New One' });
  });

  it('dispatches a replace-by-id patch on edit', async () => {
    const onPatch = vi.fn();
    const user = userEvent.setup();
    render(<ConnectionsFieldset settings={settings()} onPatch={onPatch} />);
    await user.click(screen.getByRole('button', { name: 'Edit OpenAI' }));
    await user.click(screen.getByRole('button', { name: /^save connection/i }));

    const wire = (firstCall(onPatch)[0] as { connections: Connection[] }).connections;
    expect(wire).toHaveLength(2);
    expect(wire.map((c) => c.id)).toEqual(['venice', 'openai']);
  });
});

describe('ConnectionsFieldset Active toggle', () => {
  it('toggling Active commits enabled and announces, without clearing the selected model (GA)', async () => {
    const onPatch = vi.fn().mockResolvedValue(true);
    const s = settings({
      selectedModelId: 'local:m',
      connections: [
        {
          id: 'local',
          type: 'openai-compatible',
          label: 'Local',
          baseUrl: 'http://localhost:1',
          enabled: true,
          apiKey: { isSet: true },
        },
      ],
    } as never);
    render(<ConnectionsFieldset settings={s} onPatch={onPatch} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Active Local' }));

    expect(onPatch).toHaveBeenCalledTimes(1);
    const wire = firstCall(onPatch)[0] as { connections: Connection[] };
    expect(wire.connections[0]?.enabled).toBe(false);
    // GA: toggling enabled must NOT include/clear selectedModelId in the patch
    expect('selectedModelId' in wire).toBe(false);
    expect(captured).toContainEqual({
      type: 'connectionEnabledChanged',
      label: 'Local',
      enabled: false,
    });
  });

  it('shows the deactivated line on a disabled connection (GF)', () => {
    const s = settings({
      selectedModelId: '',
      connections: [
        {
          id: 'local',
          type: 'openai-compatible',
          label: 'Local',
          baseUrl: 'http://localhost:1',
          enabled: false,
          apiKey: { isSet: false },
        },
      ],
    } as never);
    render(<ConnectionsFieldset settings={s} onPatch={vi.fn()} />);
    expect(screen.getByText('Deactivated. Excluded from the model list.')).toBeInTheDocument();
  });
});

describe('ConnectionsFieldset discovery status line', () => {
  it('renders the discovery status line for a problem outcome', () => {
    queryClient.setQueryData(modelsQueryKey, {
      models: [],
      connectionStatuses: [{ connectionId: 'local', outcome: 'unreachable' }],
      priceCurrency: 'USD',
      priceUnit: 'perMillionTokens',
    });
    const s = settings({
      selectedModelId: '',
      connections: [
        {
          id: 'local',
          type: 'openai-compatible',
          label: 'Local',
          baseUrl: 'http://localhost:1234',
          enabled: true,
          apiKey: { isSet: false },
        },
      ],
    } as never);
    render(<ConnectionsFieldset settings={s} onPatch={vi.fn()} />);
    expect(
      screen.getByText(
        'Could not reach your local server at http://localhost:1234. Is it running?',
      ),
    ).toBeInTheDocument();
  });
});
