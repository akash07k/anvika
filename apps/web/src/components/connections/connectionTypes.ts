import type { ConnectionType } from '@anvika/shared/settings/connection';

/** The rendering kind for a connection field. */
export type ConnectionFieldKind =
  | 'text'
  | 'secret'
  | 'url'
  | 'headers'
  | 'manualModels'
  | 'boolean'
  | 'reasoningEffort';

/** One renderable field on a connection form. */
export interface ConnectionFieldDescriptor {
  /** The connection-object key this field reads and writes. */
  key: string;
  /** The visible field label. */
  label: string;
  /** How to render this field. */
  kind: ConnectionFieldKind;
  /** Whether the field is required for this connection type. */
  required?: true;
  /** Optional helper text, shown via the field's aria-describedby. */
  description?: string;
}

/** A connection type's descriptor: its human label and the ordered fields to render. */
export interface ConnectionTypeDescriptor {
  /** The human-readable type name (used in headings and the type selector). */
  label: string;
  /** The fields to render for this type, in render order. */
  fields: ConnectionFieldDescriptor[];
}

/** The shared `label` field present on every connection type. */
const labelField: ConnectionFieldDescriptor = {
  key: 'label',
  label: 'Label',
  kind: 'text',
  required: true,
};

/** The optional API key field shared by all native-key types. */
const apiKeyField: ConnectionFieldDescriptor = {
  key: 'apiKey',
  label: 'API key',
  kind: 'secret',
  description:
    'Your provider API key. It is stored write-only and is never displayed after saving.',
};

/** The optional base-URL override field shared by native-key types. */
const baseUrlOptionalField: ConnectionFieldDescriptor = {
  key: 'baseUrl',
  label: 'Base URL override',
  kind: 'url',
  description:
    "Optional. Overrides the provider's default API endpoint, for example to route through a proxy or a regional gateway. Leave blank to use the official endpoint.",
};

/** The `manualModelIds` field shared by every connection type. */
const manualModelsField: ConnectionFieldDescriptor = {
  key: 'manualModelIds',
  label: 'Manual model IDs',
  kind: 'manualModels',
};

/** The per-connection thinking-effort override, present on every connection type. */
const reasoningEffortField: ConnectionFieldDescriptor = {
  key: 'reasoningEffort',
  label: 'Thinking effort',
  kind: 'reasoningEffort',
  description:
    "Optional. The default thinking effort for this connection's models. A per-conversation choice still overrides it.",
};

/** Fields for a native-key type: label, apiKey, optional baseUrl, manualModels, reasoningEffort. */
const nativeKeyFields: ConnectionFieldDescriptor[] = [
  labelField,
  apiKeyField,
  baseUrlOptionalField,
  manualModelsField,
  reasoningEffortField,
];

/**
 * Descriptor per connection type, keyed by {@link ConnectionType}. This is the single source of
 * truth for which fields `ConnectionForm` renders for each type. Adding a new type means adding
 * one entry here; the form picks it up automatically.
 *
 * Import {@link CONNECTION_TYPES} from `@anvika/shared` rather than hard-coding the type list so
 * the TypeScript exhaustiveness check (`Record<ConnectionType, ...>`) catches any drift.
 */
export const CONNECTION_TYPE_DESCRIPTORS: Record<ConnectionType, ConnectionTypeDescriptor> = {
  anthropic: {
    label: 'Anthropic',
    fields: nativeKeyFields,
  },
  openai: {
    label: 'OpenAI',
    fields: nativeKeyFields,
  },
  google: {
    label: 'Google',
    fields: nativeKeyFields,
  },
  openrouter: {
    label: 'OpenRouter',
    fields: nativeKeyFields,
  },
  xai: {
    label: 'xAI',
    fields: nativeKeyFields,
  },
  azure: {
    label: 'Azure',
    fields: [
      labelField,
      apiKeyField,
      {
        key: 'resourceName',
        label: 'Azure resource name',
        kind: 'text',
        description: 'Your Azure OpenAI resource name. Provide this or a Base URL.',
      },
      {
        key: 'baseUrl',
        label: 'Base URL',
        kind: 'url',
        description: 'The full endpoint URL. Provide this or an Azure resource name.',
      },
      {
        key: 'apiVersion',
        label: 'API version',
        kind: 'text',
        description: 'Optional. The Azure OpenAI API version, for example 2024-10-21.',
      },
      manualModelsField,
      reasoningEffortField,
    ],
  },
  'openai-compatible': {
    label: 'OpenAI-compatible',
    fields: [
      labelField,
      {
        key: 'baseUrl',
        label: 'Base URL',
        kind: 'url',
        required: true,
        description:
          "The server's base URL, including the version path, for example http://localhost:1234/v1.",
      },
      apiKeyField,
      { key: 'headers', label: 'Custom headers', kind: 'headers' },
      {
        key: 'sendThinkingParams',
        label: 'Send extended thinking parameters',
        kind: 'boolean',
        description:
          'Send chat_template_kwargs.enable_thinking to turn on model thinking. Turn this off only if your local server rejects unknown request fields. Local thinking needs a server that exposes reasoning, for example llama.cpp or KoboldCPP started with --jinja.',
      },
      manualModelsField,
      reasoningEffortField,
    ],
  },
};
