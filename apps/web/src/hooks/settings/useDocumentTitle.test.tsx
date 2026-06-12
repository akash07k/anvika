import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useDocumentTitle } from './useDocumentTitle';

function Titled({ title }: { title: string }) {
  useDocumentTitle(title);
  return null;
}

describe('useDocumentTitle', () => {
  it('sets document.title to the given value', () => {
    render(<Titled title="Settings - Anvika" />);
    expect(document.title).toBe('Settings - Anvika');
  });

  it('updates the title when the value changes (navigation)', () => {
    const { rerender } = render(<Titled title="Chat - Anvika" />);
    expect(document.title).toBe('Chat - Anvika');
    rerender(<Titled title="Settings - Anvika" />);
    expect(document.title).toBe('Settings - Anvika');
  });
});
