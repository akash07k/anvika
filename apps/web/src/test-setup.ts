import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

import '@testing-library/jest-dom/vitest';

beforeEach(() => {
  // jsdom emits noisy errors when router or focus behavior scrolls the window.
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  cleanup();
});
