import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RedactedSettings } from '@anvika/shared/settings/redact';

vi.mock('../../hooks/connections/useTestConnection', () => ({
  useTestConnection: () => ({ mutate: vi.fn(), isPending: false, data: undefined }),
}));

// The fieldset calls useSetConnectionSecret() transitively; stub it inert. The failure paths under
// test fail on the PUBLIC PATCH before any secret PUT, so this never resolves a meaningful value.
const secretMutateAsync = vi.fn<(args: { id: string; patch: unknown }) => Promise<void>>();
vi.mock('../../hooks/connections/useSetConnectionSecret', () => ({
  useSetConnectionSecret: () => ({ mutateAsync: secretMutateAsync }),
}));

import { ConnectionsFieldset } from './ConnectionsFieldset';
import type { PatchFn } from './connectionMutations.types';
import { addNative, registerCaptureHooks, render, settings } from './ConnectionsFieldset.testkit';

registerCaptureHooks();

beforeEach(() => {
  secretMutateAsync.mockReset();
  secretMutateAsync.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

/**
 * A harness that drives the REAL optimistic-then-revert store flow: `onPatch` applies the optimistic
 * updater (so the affected row/form re-renders and unmounts), flushes a microtask so React commits
 * the unmount, then REVERTS to the seeded settings and resolves `false`. This reproduces the
 * body-focus bug a bare `mockResolvedValue(false)` cannot, because that stub never re-renders.
 */
function Harness({ initial }: { initial: RedactedSettings }) {
  const [current, setCurrent] = useState(initial);
  const onPatch: PatchFn = async (_wire, optimistic) => {
    setCurrent((s) => optimistic(s));
    await new Promise((r) => setTimeout(r, 0));
    setCurrent(initial);
    return false;
  };
  return <ConnectionsFieldset settings={current} onPatch={onPatch} />;
}

describe('ConnectionsFieldset focus after a failed save or remove', () => {
  it('add-mode failure: focus lands on the Add button, never on <body>', async () => {
    const user = userEvent.setup();
    render(<Harness initial={settings()} />);
    await addNative(user, 'New One');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add connection' })).toHaveFocus();
    });
    expect(document.body).not.toHaveFocus();
  });

  it('edit-mode failure: focus lands on the edited row Edit button, never on <body>', async () => {
    const user = userEvent.setup();
    render(<Harness initial={settings()} />);
    await user.click(screen.getByRole('button', { name: 'Edit OpenAI' }));
    await user.click(screen.getByRole('button', { name: /^save connection/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit OpenAI' })).toHaveFocus();
    });
    expect(document.body).not.toHaveFocus();
  });

  it('remove failure with a sibling: focus lands on the sibling Edit button, never on <body>', async () => {
    const user = userEvent.setup();
    render(<Harness initial={settings()} />);
    await user.click(screen.getByRole('button', { name: 'Remove Venice' }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit OpenAI' })).toHaveFocus();
    });
    expect(document.body).not.toHaveFocus();
  });

  it('remove failure of the only connection: focus lands on the Add button, never on <body>', async () => {
    const user = userEvent.setup();
    const onlyOne = settings({
      connections: [{ id: 'openai', type: 'openai', label: 'OpenAI', apiKey: { isSet: true } }],
    } as Partial<RedactedSettings>);
    render(<Harness initial={onlyOne} />);
    await user.click(screen.getByRole('button', { name: 'Remove OpenAI' }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add connection' })).toHaveFocus();
    });
    expect(document.body).not.toHaveFocus();
  });
});
