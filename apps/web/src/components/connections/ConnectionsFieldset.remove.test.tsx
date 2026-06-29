import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Connection } from '@anvika/shared/settings/connection';

vi.mock('../../hooks/connections/useTestConnection', () => ({
  useTestConnection: () => ({ mutate: vi.fn(), isPending: false, data: undefined }),
}));

// The fieldset calls useSetConnectionSecret() transitively; stub it inert (remove fires no secret PUT).
const secretMutateAsync = vi.fn<(args: { id: string; patch: unknown }) => Promise<void>>();
vi.mock('../../hooks/connections/useSetConnectionSecret', () => ({
  useSetConnectionSecret: () => ({ mutateAsync: secretMutateAsync }),
}));

import { ConnectionsFieldset } from './ConnectionsFieldset';
import {
  captured,
  firstCall,
  okPatch,
  type PatchFnSig,
  registerCaptureHooks,
  render,
  settings,
} from './ConnectionsFieldset.testkit';

registerCaptureHooks();

beforeEach(() => {
  secretMutateAsync.mockReset();
  secretMutateAsync.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ConnectionsFieldset remove flow', () => {
  it('opens a destructive dialog naming the consequence on Remove', async () => {
    const user = userEvent.setup();
    render(<ConnectionsFieldset settings={settings()} onPatch={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Remove Venice' }));
    // The shadcn AlertDialog (ADR 0031) portals its content with the `alertdialog` role into the
    // accessible tree, so it is queryable directly (no `{ hidden: true }`).
    const dialog = screen.getByRole('alertdialog');
    expect(
      within(dialog).getByText(/Remove Venice\? This deletes its saved key\./),
    ).toBeInTheDocument();
    // No model belongs to Venice (selectedModelId is empty), so the clear sentence is absent.
    expect(within(dialog).queryByText(/clears your selected model/)).not.toBeInTheDocument();
  });

  it('names the model-clear consequence only when the selected model belongs to the connection', async () => {
    const user = userEvent.setup();
    render(
      <ConnectionsFieldset
        settings={settings({ selectedModelId: 'venice:llama-3' })}
        onPatch={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Remove Venice' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/clears your selected model/)).toBeInTheDocument();
  });

  it('confirming remove dispatches the connection gone, clears the model, announces, and refocuses', async () => {
    const onPatch = okPatch();
    const user = userEvent.setup();
    render(
      <ConnectionsFieldset
        settings={settings({ selectedModelId: 'venice:llama-3' })}
        onPatch={onPatch}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Remove Venice' }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    const call = firstCall(onPatch);
    const patch = call[0] as {
      connections: Connection[];
      selectedModelId?: string;
    };
    expect(patch.connections.map((c) => c.id)).toEqual(['openai']);
    expect(patch.selectedModelId).toBe('');
    // The remove also passes { announce: false } so only connectionRemoved speaks (no double-speak).
    expect(call[2]).toEqual({ announce: false });
    expect(captured).toContainEqual({
      type: 'connectionRemoved',
      label: 'Venice',
      modelCleared: true,
    });
    // Focus moves to the next row's Edit button (OpenAI is the only remaining sibling). Radix settles
    // the dialog's close-focus asynchronously, so wait for the app's focus move to land.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit OpenAI' })).toHaveFocus();
    });
  });

  it('omits selectedModelId from the remove patch when no model belongs to the connection', async () => {
    const onPatch = okPatch();
    const user = userEvent.setup();
    render(<ConnectionsFieldset settings={settings()} onPatch={onPatch} />);
    await user.click(screen.getByRole('button', { name: 'Remove OpenAI' }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    const patch = firstCall(onPatch)[0] as { selectedModelId?: string };
    expect(patch).not.toHaveProperty('selectedModelId');
    expect(captured).toContainEqual({
      type: 'connectionRemoved',
      label: 'OpenAI',
      modelCleared: false,
    });
  });

  it('does not announce connectionRemoved when the remove PATCH fails', async () => {
    // A failed public PATCH (resolves false) means the store reverted the optimistic change and
    // already announced settingsSaveFailed; the fieldset must not also announce a phantom success.
    const onPatch = vi.fn<PatchFnSig>().mockResolvedValue(false);
    const user = userEvent.setup();
    render(<ConnectionsFieldset settings={settings()} onPatch={onPatch} />);
    await user.click(screen.getByRole('button', { name: 'Remove OpenAI' }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect(onPatch).toHaveBeenCalledTimes(1);
    expect(captured).not.toContainEqual(expect.objectContaining({ type: 'connectionRemoved' }));
  });
});
