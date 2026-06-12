import { QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, vi } from 'vitest';

import type { RedactedSettings } from '@anvika/shared/settings/redact';

import { queryClient } from '../../lib/queryClient';
import type { NotificationEvent } from '../../notifications/events';
import { registerChannel, resetChannels } from '../../notifications/notifier';

/** Two redacted connections: an openai-compatible "Venice" with a header, and a native "OpenAI". */
export function settings(overrides: Partial<RedactedSettings> = {}): RedactedSettings {
  return {
    selectedModelId: '',
    connections: [
      {
        id: 'venice',
        type: 'openai-compatible',
        label: 'Venice',
        baseUrl: 'https://venice.example/v1',
        enabled: true,
        apiKey: { isSet: true },
        headers: { Authorization: { isSet: true } },
      },
      { id: 'openai', type: 'openai', label: 'OpenAI', enabled: true, apiKey: { isSet: true } },
    ],
    ...overrides,
  } as RedactedSettings;
}

/** The first call's args of a spy, guarded so `noUncheckedIndexedAccess` is satisfied. */
export function firstCall(spy: { mock: { calls: unknown[][] } }): unknown[] {
  const call = spy.mock.calls[0];
  if (!call) throw new Error('expected onPatch to have been called at least once');
  return call;
}

/** The dispatcher signature the fieldset expects (matches the component's local `PatchFn`). */
export type PatchFnSig = (
  wirePatch: Record<string, unknown>,
  optimistic: (settings: RedactedSettings) => RedactedSettings,
  options?: { announce?: boolean },
) => Promise<boolean>;

/** The notification events captured during a test; reset by {@link registerCaptureHooks}. */
export const captured: NotificationEvent[] = [];

/** Register the shared notification-capture and channel-reset lifecycle hooks. */
export function registerCaptureHooks(): void {
  beforeEach(() => {
    queryClient.clear();
    resetChannels();
    captured.length = 0;
    registerChannel((event) => captured.push(event));
  });
  afterEach(() => {
    resetChannels();
  });
}

/**
 * A patch dispatcher mock that commits successfully: it applies the optimistic projection (so the
 * test can observe the would-be next settings) and resolves `true`, which the fieldset awaits before
 * proceeding to the secret PUT. Real `store.patch` resolves the same boolean.
 */
export function okPatch() {
  return vi.fn<PatchFnSig>((_wire, optimistic) => {
    optimistic(settings());
    return Promise.resolve(true);
  });
}

/** Fill the add form for a minimal native connection and Save (no API key, so no secret PUT). */
export async function addNative(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Add connection' }));
  await user.type(screen.getByLabelText('Label'), label);
  await user.tab();
  await user.click(screen.getByRole('button', { name: /^save connection/i }));
}

/** Fill the add form for a native connection WITH an API key typed, then Save (triggers a secret PUT). */
export async function addNativeWithKey(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  key: string,
): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Add connection' }));
  await user.type(screen.getByLabelText('Label'), label);
  await user.tab();
  await user.type(screen.getByLabelText('API key'), key);
  await user.tab(); // commit-on-blur lifts the typed key into the draft (no inner Save button)
  await user.click(screen.getByRole('button', { name: /^save connection/i }));
}

/**
 * Wraps `children` in a `QueryClientProvider` backed by the app-wide singleton
 * {@link queryClient}. Pass this as the `wrapper` option (or use {@link render}) so that
 * any component calling TanStack Query hooks (e.g. `useConnectionStatuses()`) resolves
 * its client without error in tests.
 *
 * @param props - React children.
 * @returns The wrapped element.
 */
export function Wrapper({ children }: { children: ReactNode }): ReactNode {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/**
 * `@testing-library/react` `render` pre-wired with {@link Wrapper}. Every connection
 * component test that calls `render()` from this module automatically gets a
 * `QueryClientProvider` in the tree.
 *
 * @param ui - The element to render.
 * @param options - RTL render options (wrapper is already set; do not pass another).
 * @returns The RTL render result.
 */
export function render(
  ui: React.ReactElement,
  options?: Omit<Parameters<typeof rtlRender>[1], 'wrapper'>,
): RenderResult {
  return rtlRender(ui, { wrapper: Wrapper, ...options });
}
