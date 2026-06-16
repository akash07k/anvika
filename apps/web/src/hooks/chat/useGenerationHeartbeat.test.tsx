import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NotificationEvent } from '../../notifications/events';
import { registerChannel, resetChannels } from '../../notifications/notifier';
import { useGenerationHeartbeat } from './useGenerationHeartbeat';

const seen: NotificationEvent[] = [];

function Harness({
  generating,
  phase = 'answering',
}: {
  generating: boolean;
  phase?: 'thinking' | 'answering';
}) {
  useGenerationHeartbeat(generating, 2000, phase);
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  seen.length = 0;
  registerChannel((e) => seen.push(e));
});

afterEach(() => {
  resetChannels();
  vi.useRealTimers();
});

describe('useGenerationHeartbeat', () => {
  it('announces start immediately and progress every period while generating', () => {
    const { rerender } = render(<Harness generating={true} />);
    expect(seen).toEqual([{ type: 'generationStarted' }]);

    vi.advanceTimersByTime(2000);
    expect(seen.at(-1)).toEqual({ type: 'generationProgress', seconds: 2 });

    vi.advanceTimersByTime(2000);
    expect(seen.at(-1)).toEqual({ type: 'generationProgress', seconds: 4 });

    // Leaving the generating state stops the timer: no further events.
    rerender(<Harness generating={false} />);
    const count = seen.length;
    vi.advanceTimersByTime(4000);
    expect(seen.length).toBe(count);
  });

  it('does not announce anything while not generating', () => {
    render(<Harness generating={false} />);
    vi.advanceTimersByTime(6000);
    expect(seen).toEqual([]);
  });

  it('ticks with the thinking flag while in the thinking phase, then announces the transition', () => {
    const { rerender } = render(<Harness generating={true} phase="thinking" />);
    expect(seen).toEqual([{ type: 'generationStarted' }, { type: 'thinkingStarted' }]);

    vi.advanceTimersByTime(2000);
    expect(seen.at(-1)).toEqual({ type: 'generationProgress', seconds: 2, thinking: true });

    rerender(<Harness generating={true} phase="answering" />);
    // The transition reports the elapsed thinking duration (2s of fake time advanced above), not just
    // that it happened, so a regression in the seconds math is caught.
    expect(seen).toContainEqual({ type: 'thinkingComplete', seconds: 2 });
    vi.advanceTimersByTime(2000);
    const lastTick = seen.at(-1);
    expect(lastTick?.type).toBe('generationProgress');
    // The answer-phase tick carries no thinking flag (the field is omitted, not set to undefined).
    expect(lastTick).not.toHaveProperty('thinking');
  });
});
