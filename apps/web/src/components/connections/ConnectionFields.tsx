import type { ConnectionFieldDescriptor } from './connectionTypes';
import { OVERRIDE_EFFORT_OPTIONS } from '../../lib/message/reasoning';
import { SelectField } from '../fields/SelectField';
import { SecretField } from '../fields/SecretField';
import { TextField } from '../fields/TextField';
import { ToggleField } from '../fields/ToggleField';
import type { ConnectionDraft } from './connectionDraft';
import { HeadersEditor } from './HeadersEditor';
import { ManualModelsEditor } from './ManualModelsEditor';

/** Read the boolean draft value for a descriptor whose kind is `boolean`. */
function booleanValue(draft: ConnectionDraft, key: string): boolean {
  if (key === 'sendThinkingParams') return draft.sendThinkingParams;
  return false;
}

/** Read the plaintext draft value for a descriptor whose kind is `text` or `url`. */
function textValue(draft: ConnectionDraft, key: string): string {
  if (key === 'label') return draft.label;
  if (key === 'baseUrl') return draft.baseUrl;
  if (key === 'resourceName') return draft.resourceName;
  if (key === 'apiVersion') return draft.apiVersion;
  return '';
}

/**
 * Render the type-specific fields of a {@link ConnectionDraft} from its descriptors. Each descriptor
 * maps by `kind`: `secret` -> {@link SecretField} (commit-on-blur lifts the typed key into the draft
 * and marks it dirty; a cancelled Replace resets the draft to keep the stored key), `text`/`url` ->
 * {@link TextField} (commit-on-blur), `headers` ->
 * {@link HeadersEditor}, `manualModels` -> {@link ManualModelsEditor}. The owning form supplies the
 * descriptors and a single `patch` so this component stays presentational.
 */
export function ConnectionFields({
  fields,
  draft,
  isSetApiKey,
  patch,
}: {
  fields: ConnectionFieldDescriptor[];
  draft: ConnectionDraft;
  isSetApiKey: boolean;
  patch: (patch: Partial<ConnectionDraft>) => void;
}) {
  return (
    <>
      {fields.map((field) => {
        const id = `connection-field-${field.key}`;
        if (field.kind === 'secret') {
          return (
            <SecretField
              key={field.key}
              id={id}
              label={field.label}
              description={field.description}
              isSet={isSetApiKey && !draft.apiKeyDirty}
              onCommit={(value) => patch({ apiKey: value, apiKeyDirty: true })}
              onCancelReplace={() => patch({ apiKey: undefined, apiKeyDirty: false })}
            />
          );
        }
        if (field.kind === 'headers') {
          return (
            <HeadersEditor
              key={field.key}
              rows={draft.headers}
              onChange={(headers) => patch({ headers })}
            />
          );
        }
        if (field.kind === 'manualModels') {
          return (
            <ManualModelsEditor
              key={field.key}
              ids={draft.manualModelIds}
              onChange={(manualModelIds) => patch({ manualModelIds })}
            />
          );
        }
        if (field.kind === 'boolean') {
          return (
            <ToggleField
              key={field.key}
              id={id}
              label={field.label}
              description={field.description}
              checked={booleanValue(draft, field.key)}
              onChange={(checked) => patch({ [field.key]: checked } as Partial<ConnectionDraft>)}
            />
          );
        }
        if (field.kind === 'reasoningEffort') {
          return (
            <SelectField
              key={field.key}
              id={id}
              label={field.label}
              description={field.description}
              value={draft.reasoningEffort}
              options={OVERRIDE_EFFORT_OPTIONS}
              onChange={(value) =>
                patch({ reasoningEffort: value as ConnectionDraft['reasoningEffort'] })
              }
            />
          );
        }
        // `text` and `url` both render a TextField; the schema validates URL shape on submit.
        return (
          <TextField
            key={field.key}
            id={id}
            label={field.label}
            description={field.description}
            required={field.required}
            value={textValue(draft, field.key)}
            onCommit={(value) => patch({ [field.key]: value } as Partial<ConnectionDraft>)}
          />
        );
      })}
    </>
  );
}
