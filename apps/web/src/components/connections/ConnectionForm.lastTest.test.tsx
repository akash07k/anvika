import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TestOutcome } from '../../hooks/connections/useTestConnection';

const mutate = vi.fn();
// `data` carries a settled outcome so the form's persistent LastTestStatus line has something to show.
let testData: TestOutcome | undefined;
vi.mock('../../hooks/connections/useTestConnection', () => ({
  useTestConnection: () => ({ mutate, isPending: false, data: testData }),
}));

vi.mock('../../notifications/notifier', () => ({ notify: vi.fn() }));

import { ConnectionForm } from './ConnectionForm';

beforeEach(() => {
  mutate.mockClear();
  testData = undefined;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ConnectionForm durable test status', () => {
  it('renders a re-readable "Last test" line after a successful test', () => {
    testData = { kind: 'ok', modelCount: 2 };
    render(<ConnectionForm mode="add" existingIds={[]} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    // The durable, non-live record a screen-reader user can navigate back to and re-read.
    expect(screen.getByText('Last test: OK, found 2 models')).toBeInTheDocument();
  });

  it('renders no status line before any test has run', () => {
    render(<ConnectionForm mode="add" existingIds={[]} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByText(/last test:/i)).not.toBeInTheDocument();
  });
});
