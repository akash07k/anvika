import type { ReasoningEffortOverride } from '@anvika/shared/reasoning/effort';

import { OVERRIDE_EFFORT_OPTIONS } from '../lib/message/reasoning';
import { SelectField } from './fields/SelectField';

/** Props for {@link ReasoningEffortControl}. */
export interface ReasoningEffortControlProps {
  /** The current resolved override value the control mirrors (`inherit` until the user overrides). */
  value: ReasoningEffortOverride;
  /** Whether the active model can reason; when false the control is disabled with an explanation. */
  capable: boolean;
  /** Called with the chosen override (`inherit` clears it back to the resolved effort). */
  onChange: (value: ReasoningEffortOverride) => void;
}

/**
 * The composer's per-conversation thinking-effort combobox. It reads Inherit / Off / Low / Medium /
 * High and writes the sticky per-conversation override. When the active model is not
 * reasoning-capable the control stays present but disabled, with the honest description "This model
 * does not support thinking", so the state is never misleading for a screen-reader user.
 *
 * @param props - See {@link ReasoningEffortControlProps}.
 * @returns The labelled effort select.
 */
export function ReasoningEffortControl({ value, capable, onChange }: ReasoningEffortControlProps) {
  return (
    <SelectField
      id="conversation-reasoning-effort"
      label="Thinking effort"
      description={capable ? undefined : 'This model does not support thinking'}
      value={value}
      options={OVERRIDE_EFFORT_OPTIONS}
      disabled={!capable}
      onChange={(v) => onChange(v as ReasoningEffortOverride)}
    />
  );
}
