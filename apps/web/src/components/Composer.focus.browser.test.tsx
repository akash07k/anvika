import { StrictMode } from 'react';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { afterEach, expect, test } from 'vitest';

import { DEFAULT_KEYMAP } from '@anvika/shared/settings/keymap';

import {
  consumeComposerFocus,
  requestComposerFocus,
} from '../lib/conversation/composerFocusIntent';
import { Composer } from './Composer';

afterEach(() => {
  consumeComposerFocus('c1');
  consumeComposerFocus('other');
});

function renderComposer(conversationId = 'c1', wrapper: 'plain' | 'strict' = 'plain') {
  const tree = (
    <HotkeysProvider initiallyActiveScopes={['*', 'chat']}>
      <Composer
        conversationId={conversationId}
        disabled={false}
        onSend={() => {}}
        sendKeyMode="modEnter"
        sendBinding={DEFAULT_KEYMAP.send}
      />
    </HotkeysProvider>
  );
  return render(wrapper === 'strict' ? <StrictMode>{tree}</StrictMode> : tree);
}

test('focuses the textarea on mount when a matching focus intent is pending', async () => {
  requestComposerFocus('c1');
  await renderComposer('c1');
  await expect.element(page.getByRole('textbox', { name: 'Message' })).toHaveFocus();
});

test('does not focus the textarea on mount when no intent is pending', async () => {
  await renderComposer('c1');
  await expect.element(page.getByRole('textbox', { name: 'Message' })).not.toHaveFocus();
});

test('does not focus when the pending intent is for a different conversation', async () => {
  requestComposerFocus('other'); // intent for a conversation this composer is NOT
  await renderComposer('c1');
  await expect.element(page.getByRole('textbox', { name: 'Message' })).not.toHaveFocus();
});

test('focuses under StrictMode double-mount when a matching intent is pending', async () => {
  requestComposerFocus('c1');
  await renderComposer('c1', 'strict');
  await expect.element(page.getByRole('textbox', { name: 'Message' })).toHaveFocus();
});
