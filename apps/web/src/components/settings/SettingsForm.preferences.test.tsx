import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useModelsMock, useConnectionStatusesMock } = vi.hoisted(() => ({
  useModelsMock: vi.fn(),
  useConnectionStatusesMock: vi.fn(),
}));
vi.mock('../../hooks/conversation/useModels', () => ({
  useModels: useModelsMock,
  useConnectionStatuses: useConnectionStatusesMock,
}));
// The connections fieldset (rendered transitively) calls useSetConnectionSecret(); stub it inert (no
// QueryClientProvider here). The secret-write path is covered by ConnectionsFieldset.test.tsx.
vi.mock('../../hooks/connections/useSetConnectionSecret', () => ({
  useSetConnectionSecret: () => ({ mutateAsync: vi.fn() }),
}));

import { SettingsForm } from './SettingsForm';
import { settings } from './SettingsForm.testkit';

describe('SettingsForm preference field wiring', () => {
  beforeEach(() => {
    useModelsMock.mockReturnValue({ data: [], isSuccess: true });
    useConnectionStatusesMock.mockReturnValue({ data: [], isSuccess: true });
  });

  // Field-wiring coverage (preserved across the model-control rewrite): the non-model
  // settings fields must keep committing through onPatch, all announcing the save by default.
  it('commits the announcement period on blur with a wire patch and optimistic update', async () => {
    const onPatch = vi.fn();
    render(<SettingsForm settings={settings()} onPatch={onPatch} />);
    const input = screen.getByRole('spinbutton', { name: /announcement period/i });
    await userEvent.clear(input);
    await userEvent.type(input, '2500');
    expect(onPatch).not.toHaveBeenCalled(); // no per-keystroke patch
    await userEvent.tab();
    expect(onPatch).toHaveBeenCalledTimes(1);
    const firstCall = onPatch.mock.calls[0];
    if (!firstCall) throw new Error('expected onPatch to be called');
    expect(firstCall[0]).toEqual({ announcementPeriodMs: 2500 });
    expect(firstCall[2]).toBeUndefined(); // announces the save by default
  });

  it('commits a toggle change immediately and announces the save by default', async () => {
    const onPatch = vi.fn();
    render(<SettingsForm settings={settings()} onPatch={onPatch} />);
    await userEvent.click(screen.getByRole('checkbox', { name: /read whole response/i }));
    const firstCall = onPatch.mock.calls[0];
    if (!firstCall) throw new Error('expected onPatch to be called');
    expect(firstCall[0]).toEqual({ readWholeOnComplete: true });
    expect(firstCall[2]).toBeUndefined(); // announces the save by default
  });

  it('labels the send-key field "Send key mode" and names the Alt+Enter shortcut', () => {
    render(<SettingsForm settings={settings()} onPatch={vi.fn()} />);
    const control = screen.getByLabelText('Send key mode');
    const ids = (control.getAttribute('aria-describedby') ?? '').split(' ');
    const desc = ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
    expect(desc).toContain('Alt+Enter');
  });

  it('commits a select change and announces the save by default', async () => {
    const onPatch = vi.fn();
    render(<SettingsForm settings={settings()} onPatch={onPatch} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /send key/i }), 'enter');
    const firstCall = onPatch.mock.calls[0];
    if (!firstCall) throw new Error('expected onPatch to be called');
    expect(firstCall[0]).toEqual({ sendKeyMode: 'enter' });
    expect(firstCall[2]).toBeUndefined();
  });

  it('shows a field-level error as text associated to the field named by its id (ADR 0015)', () => {
    render(
      <SettingsForm
        settings={settings()}
        onPatch={vi.fn()}
        fieldErrors={{ 'announcement-period': 'Too small' }}
      />,
    );
    const control = screen.getByLabelText('Announcement period (ms)');
    const describedBy = control.getAttribute('aria-describedby') ?? '';
    const errEl = describedBy
      .split(' ')
      .map((id) => document.getElementById(id))
      .find((el) => el?.textContent === 'Too small');
    expect(errEl).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull(); // no role=alert (ADR 0015)
  });

  it('renders the length-cue select and the preview-length number field', () => {
    render(<SettingsForm settings={settings()} onPatch={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: /length cue position/i })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /preview length/i })).toHaveValue(40);
  });

  it('commits the length cue and announces the save by default', async () => {
    const onPatch = vi.fn();
    render(<SettingsForm settings={settings()} onPatch={onPatch} />);
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /length cue position/i }),
      'count-after',
    );
    const firstCall = onPatch.mock.calls[0];
    if (!firstCall) throw new Error('expected onPatch to be called');
    expect(firstCall[0]).toEqual({ quickNavLengthCue: 'count-after' });
    expect(firstCall[2]).toBeUndefined();
  });

  it('commits the preview length on blur', async () => {
    const onPatch = vi.fn();
    render(<SettingsForm settings={settings()} onPatch={onPatch} />);
    const input = screen.getByRole('spinbutton', { name: /preview length/i });
    await userEvent.clear(input);
    await userEvent.type(input, '60');
    expect(onPatch).not.toHaveBeenCalled(); // no per-keystroke patch
    await userEvent.tab();
    const firstCall = onPatch.mock.calls[0];
    if (!firstCall) throw new Error('expected onPatch to be called');
    expect(firstCall[0]).toEqual({ quickNavPreviewWords: 60 });
  });

  it('disables the descriptor-only controls when single press reads full content', () => {
    render(
      <SettingsForm settings={settings({ quickNavSinglePressReads: 'full' })} onPatch={vi.fn()} />,
    );
    expect(screen.getByRole('combobox', { name: /length cue position/i })).toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: /preview length/i })).toBeDisabled();
  });

  it('enables the descriptor-only controls when single press reads the descriptor', () => {
    render(<SettingsForm settings={settings()} onPatch={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: /length cue position/i })).toBeEnabled();
    expect(screen.getByRole('spinbutton', { name: /preview length/i })).toBeEnabled();
  });

  it('renders the display-name fields and commits a change on blur', async () => {
    const onPatch = vi.fn();
    render(<SettingsForm settings={settings()} onPatch={onPatch} />);
    const assistant = screen.getByLabelText('Assistant name');
    await userEvent.clear(assistant);
    await userEvent.type(assistant, 'Claude');
    await userEvent.tab();
    const firstCall = onPatch.mock.calls[0];
    if (!firstCall) throw new Error('expected onPatch to be called');
    expect(firstCall[0]).toEqual({ assistantName: 'Claude' });
    expect(firstCall[2]).toBeUndefined();
  });
});
