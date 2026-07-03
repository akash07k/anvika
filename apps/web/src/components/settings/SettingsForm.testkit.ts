import type { ModelInfo } from '@anvika/shared/models/model-info';
import type { RedactedSettings } from '@anvika/shared/settings/redact';

/**
 * Build a {@link ModelInfo} for the picker, deriving `connectionId` from the namespaced id (or the
 * provider id when bare). All metadata is null since the picker tests only assert id/label wiring.
 *
 * @param id - The (possibly namespaced) model id.
 * @param providerId - The provider id.
 * @param displayName - The visible option label.
 * @returns A complete ModelInfo fixture.
 */
export function model(
  id: string,
  providerId: ModelInfo['providerId'],
  displayName: string,
): ModelInfo {
  const connectionId = id.includes(':') ? id.slice(0, id.indexOf(':')) : providerId;
  return {
    id,
    providerId,
    connectionId,
    connectionLabel: connectionId,
    displayName,
    contextWindow: null,
    maxOutputTokens: null,
    inputPrice: null,
    outputPrice: null,
    capabilities: { text: true, reasoning: false },
  };
}

/**
 * Build a complete {@link RedactedSettings} fixture with defaults, applying `overrides` last so a test
 * can vary a single field.
 *
 * @param overrides - Fields to override on the default settings.
 * @returns A complete redacted settings fixture.
 */
export function settings(overrides: Partial<RedactedSettings> = {}): RedactedSettings {
  return {
    connections: [],
    selectedModelId: '',
    userName: 'You',
    assistantName: 'Assistant',
    currency: 'USD',
    inrPerUsd: 95.11,
    autoRefreshFxRate: false,
    inrPerUsdUpdatedAt: null,
    timestampWeekday: true,
    timestampDateStyle: 'day-first',
    timestampHourCycle: 'h12',
    timestampSeconds: true,
    announcementPeriodMs: 2000,
    readWholeOnComplete: false,
    focusOnCompletion: 'keep',
    sendKeyMode: 'modEnter',
    quickNavSinglePressReads: 'descriptor',
    quickNavDoublePressMs: 500,
    quickNavLengthCue: 'count-first',
    quickNavPreviewWords: 40,
    reasoningEffort: 'medium',
    hotkeyBindings: {} as RedactedSettings['hotkeyBindings'],
    ...overrides,
  };
}
