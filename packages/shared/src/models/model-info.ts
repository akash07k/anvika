import { z } from 'zod';

/**
 * The model provider TYPE ids - the connection types (ADR 0004 as amended for connections). A model's
 * `providerId` is its connection's type; its `id` is the namespaced `connectionId:model`.
 */
export const MODEL_PROVIDER_IDS = [
  'anthropic',
  'openai',
  'google',
  'azure',
  'openrouter',
  'xai',
  'openai-compatible',
] as const;

/** A model provider type id (connection type). */
export type ModelProviderId = (typeof MODEL_PROVIDER_IDS)[number];

/**
 * Per-model capability flags. Currently carries `text` and `reasoning`; the object shape
 * stays open so it can later add `image`, `tools`, etc. without a contract change.
 * `reasoning` is true when the server's capability registry can enable thinking for the model.
 */
export const ModelCapabilitiesSchema = z.object({ text: z.boolean(), reasoning: z.boolean() });

/** The capability flags for a model. */
export type ModelCapabilities = z.infer<typeof ModelCapabilitiesSchema>;

/**
 * The wire shape of one available model. `id` is the
 * namespaced `connectionId:model` id the client sends back as `selectedModelId`. `providerId` is the
 * connection type; `connectionId` and `connectionLabel` identify the originating connection. Price
 * fields are USD per million tokens; price and context fields are nullable to accommodate
 * openai-compatible and any live-discovered model that lacks the metadata.
 */
export const ModelInfoSchema = z.object({
  id: z.string(),
  providerId: z.enum(MODEL_PROVIDER_IDS),
  connectionId: z.string().min(1),
  connectionLabel: z.string().min(1),
  displayName: z.string(),
  contextWindow: z.int().positive().nullable(),
  maxOutputTokens: z.int().positive().nullable(),
  inputPrice: z.number().nonnegative().nullable(),
  outputPrice: z.number().nonnegative().nullable(),
  capabilities: ModelCapabilitiesSchema,
});

/** A validated available-model record. */
export type ModelInfo = z.infer<typeof ModelInfoSchema>;
