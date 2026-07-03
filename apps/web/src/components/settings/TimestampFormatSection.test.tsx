import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TimestampFormatSection } from './TimestampFormatSection';
import type { RedactedSettings } from '@anvika/shared/settings/redact';

const base = {
  timestampWeekday: true,
  timestampDateStyle: 'day-first',
  timestampHourCycle: 'h12',
  timestampSeconds: true,
} as unknown as RedactedSettings;

function renderSection(over: Partial<RedactedSettings> = {}) {
  const onWeekdayChange = vi.fn();
  const onDateStyleChange = vi.fn();
  const onHourCycleChange = vi.fn();
  const onSecondsChange = vi.fn();
  render(
    <TimestampFormatSection
      settings={{ ...base, ...over }}
      fieldErrors={{}}
      onWeekdayChange={onWeekdayChange}
      onDateStyleChange={onDateStyleChange}
      onHourCycleChange={onHourCycleChange}
      onSecondsChange={onSecondsChange}
    />,
  );
  return { onWeekdayChange, onDateStyleChange, onHourCycleChange, onSecondsChange };
}

describe('TimestampFormatSection', () => {
  it('renders the four labelled controls under a Timestamp format heading', () => {
    renderSection();
    expect(screen.getByRole('heading', { name: 'Timestamp format' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Show weekday' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Date style' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Clock' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Show seconds' })).toBeInTheDocument();
  });

  it('dispatches each change through its handler', () => {
    const h = renderSection();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show weekday' }));
    expect(h.onWeekdayChange).toHaveBeenCalledWith(false);
    fireEvent.change(screen.getByRole('combobox', { name: 'Date style' }), {
      target: { value: 'month-first' },
    });
    expect(h.onDateStyleChange).toHaveBeenCalledWith('month-first');
    fireEvent.change(screen.getByRole('combobox', { name: 'Clock' }), { target: { value: 'h24' } });
    expect(h.onHourCycleChange).toHaveBeenCalledWith('h24');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show seconds' }));
    expect(h.onSecondsChange).toHaveBeenCalledWith(false);
  });
});
