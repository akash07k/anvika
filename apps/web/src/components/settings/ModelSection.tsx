import type { RedactedSettings } from '@anvika/shared/settings/redact';

import { useAnnounceDiscoveryProblems } from '../../hooks/connections/useAnnounceDiscoveryProblems';
import { useConnectionStatuses, useModels } from '../../hooks/conversation/useModels';

import { isLoadProblem } from '../connections/discoveryStatusMessage';
import { ModelRefreshControl } from './ModelRefreshControl';
import { ModelComboboxField } from '../fields/ModelComboboxField';
import { TextField } from '../fields/TextField';

/** Props for {@link ModelSection}. */
export interface ModelSectionProps {
  /** The redacted settings (for the selected model id). */
  settings: RedactedSettings;
  /** Per-field validation errors keyed by field id (ADR 0015). */
  fieldErrors: Record<string, string>;
  /** Commit a new `selectedModelId` (the picker and the custom-id field both call this). */
  onSelectedModelChange: (value: string) => void;
}

/**
 * The Settings "Model" section: the populated model picker (available models from
 * `useModels`) plus a custom-id escape hatch, both writing `selectedModelId`. It also surfaces the
 * per-connection discovery state: a pointer on the picker when any connection could not be
 * reached. Split from {@link SettingsForm} to keep each component within the size cap and
 * single-responsibility (ADR 0007).
 *
 * @param props - See {@link ModelSectionProps}.
 * @returns The Model section.
 */
export function ModelSection({ settings, fieldErrors, onSelectedModelChange }: ModelSectionProps) {
  const { data: models, isPending } = useModels();
  const { data: statuses } = useConnectionStatuses();
  useAnnounceDiscoveryProblems(statuses, settings.connections);
  const discoveryProblem = (statuses ?? []).some((s) => isLoadProblem(s.outcome));
  return (
    <>
      <h2>Model</h2>
      <ModelComboboxField
        id="selected-model"
        label="Model"
        error={fieldErrors['selected-model']}
        value={settings.selectedModelId}
        models={models ?? []}
        loading={isPending}
        discoveryProblem={discoveryProblem}
        onChange={onSelectedModelChange}
      />
      <TextField
        id="custom-model-id"
        label="Custom model id (advanced)"
        description="Any provider:model id; overrides the selection above when you commit. Takes effect once that provider's key is set."
        value={settings.selectedModelId}
        onCommit={onSelectedModelChange}
      />
      <ModelRefreshControl connections={settings.connections} />
    </>
  );
}
