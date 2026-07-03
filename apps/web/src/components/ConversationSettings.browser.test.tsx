/**
 * Real-browser (Chromium) tests for ConversationSettings.
 *
 * Tests the Radix Popover model picker (open, then pick "Use default model", then onModelChange(null))
 * and the Radix Accordion (expand "Advanced settings", then the Thinking-effort control is mounted).
 * These interactions require a real browser because Radix Popover and Accordion depend on
 * pointer/keyboard events and DOM APIs unavailable in jsdom.
 */
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { expect, test, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HotkeysProvider } from 'react-hotkeys-hook';

import type { ConversationModel } from '../hooks/conversation/useConversationModel';
import type { ConversationReasoning } from '../hooks/conversation/useConversationReasoning';
import { resetChannels, registerChannel } from '../notifications/notifier';
import type { NotificationEvent } from '../notifications/events';

// ---------------------------------------------------------------------------
// Module-level mocks (vi.hoisted pattern required for browser tests)
// ---------------------------------------------------------------------------

const { onModelChange, onEffortChange } = vi.hoisted(() => ({
  // Resolves `true` (a successful write) so the success-only announce in handlePick fires.
  onModelChange: vi.fn(() => Promise.resolve(true)),
  onEffortChange: vi.fn(),
}));

vi.mock('../hooks/conversation/useModels', () => ({
  useModels: () => ({
    data: [
      {
        id: 'openai:gpt-4o',
        displayName: 'GPT-4o',
        connectionId: 'openai',
        connectionLabel: 'OpenAI',
        providerId: 'openai',
        contextWindow: null,
        maxOutputTokens: null,
        inputPrice: null,
        outputPrice: null,
        capabilities: { text: true, reasoning: false },
      },
    ],
    isPending: false,
  }),
  useConnectionStatuses: () => ({ data: [] }),
}));

vi.mock('../diagnostics/logDiag', () => ({ logDiag: vi.fn() }));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

const { ConversationSettings } = await import('./ConversationSettings');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeModel(overrides?: Partial<ConversationModel>): ConversationModel {
  return {
    modelId: null,
    onModelChange,
    beforeSend: () => Promise.resolve(),
    ...overrides,
  };
}

function makeReasoning(overrides?: Partial<ConversationReasoning>): ConversationReasoning {
  return {
    override: 'inherit',
    capable: true,
    onEffortChange,
    beforeSend: () => Promise.resolve(),
    onToggleThinking: vi.fn(),
    ...overrides,
  };
}

async function renderSettings(model: ConversationModel, reasoning: ConversationReasoning) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={qc}>
      <HotkeysProvider initiallyActiveScopes={['*']}>
        <ConversationSettings model={model} reasoning={reasoning} />
      </HotkeysProvider>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('expanding "Advanced settings" accordion reveals the Thinking-effort control', async () => {
  await renderSettings(makeModel(), makeReasoning({ capable: true }));

  // The Thinking effort control must NOT be in the DOM while the accordion is collapsed
  // (Radix Accordion unmounts collapsed content).
  await expect
    .element(page.getByRole('combobox', { name: 'Thinking effort' }))
    .not.toBeInTheDocument();

  // The accordion trigger must be present and collapsed.
  const trigger = page.getByRole('button', { name: 'Advanced settings' });
  await expect.element(trigger).toBeInTheDocument();
  await expect.element(trigger).toHaveAttribute('aria-expanded', 'false');

  // Expand the accordion.
  await userEvent.click(trigger);

  // After expansion the Thinking effort combobox must be mounted in the DOM.
  await expect.element(page.getByRole('combobox', { name: 'Thinking effort' })).toBeInTheDocument();
});

test('opening model popover and selecting "Use default model" calls onModelChange(null)', async () => {
  const capturedEvents: NotificationEvent[] = [];
  registerChannel((e) => capturedEvents.push(e));

  // Start with a concrete model selected so the picker trigger shows that model.
  await renderSettings(makeModel({ modelId: 'openai:gpt-4o' }), makeReasoning());

  // Open the model picker popover by clicking the trigger button.
  const pickerTrigger = page.getByRole('button', { name: /Model/ });
  await expect.element(pickerTrigger).toBeInTheDocument();
  await userEvent.click(pickerTrigger);

  // "Use default model" must appear as the first option in the open popover.
  const useDefaultOption = page.getByRole('option', { name: 'Use default model' });
  await expect.element(useDefaultOption).toBeInTheDocument();

  // Select it.
  await userEvent.click(useDefaultOption);

  // The handler maps USE_DEFAULT to null before calling onModelChange.
  expect(onModelChange).toHaveBeenCalledWith(null);

  // A conversationModelChanged notification must fire - but only AFTER the write resolves, so this is
  // awaited (the announce now runs in the write's `.then`, not optimistically before it).
  await vi.waitFor(() => {
    const modelEvent = capturedEvents.find((e) => e.type === 'conversationModelChanged');
    expect(
      modelEvent,
      'conversationModelChanged notification must fire on a successful write',
    ).toBeTruthy();
    // The inherit case announces a natural phrase ("the default model"), not the raw option label.
    expect(modelEvent?.type === 'conversationModelChanged' && modelEvent.model).toBe(
      'the default model',
    );
  });

  resetChannels();
});

test('a FAILED model write does NOT fire the success announcement (no double-announce)', async () => {
  const capturedEvents: NotificationEvent[] = [];
  registerChannel((e) => capturedEvents.push(e));

  // A write that REJECTS resolves the hook contract to `false`; the hook announces its own failure
  // (modelOverrideSaveFailed), so handlePick must NOT also announce "Model set to X" - otherwise a
  // screen-reader user hears a contradictory success-then-failure pair for one failed write.
  const failingChange = vi.fn(() => Promise.resolve(false));
  await renderSettings(
    makeModel({ modelId: 'openai:gpt-4o', onModelChange: failingChange }),
    makeReasoning(),
  );

  const pickerTrigger = page.getByRole('button', { name: /Model/ });
  await userEvent.click(pickerTrigger);
  const useDefaultOption = page.getByRole('option', { name: 'Use default model' });
  await userEvent.click(useDefaultOption);

  // The write was attempted...
  expect(failingChange).toHaveBeenCalledWith(null);
  // ...await the SAME promise handlePick chained onto. This is deterministic ONLY because handlePick
  // registers its `.then(ok => ...)` synchronously inside the click (callbacks fire in registration
  // order), so that callback has already run - and seen ok===false, skipping the announce - by the
  // time this await resolves. If handlePick ever adds an extra await before chaining, revisit this.
  await failingChange.mock.results[0]?.value;
  // ...and the success announcement must never have fired (only the hook's own failure announce would).
  expect(capturedEvents.some((e) => e.type === 'conversationModelChanged')).toBe(false);

  resetChannels();
});
