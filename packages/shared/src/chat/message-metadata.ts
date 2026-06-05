import { z } from 'zod';

/** Per-turn token sub-counts (all optional; providers report different subsets). */
const UsageTokensSchema = z.object({
  input: z.number().int().nonnegative().optional(),
  output: z.number().int().nonnegative().optional(),
  total: z.number().int().nonnegative().optional(),
  cacheRead: z.number().int().nonnegative().optional(),
  cacheWrite: z.number().int().nonnegative().optional(),
  reasoning: z.number().int().nonnegative().optional(),
});

/** The per-million-token price snapshot captured at generation time, in USD. */
const UsagePriceSchema = z.object({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  currency: z.literal('USD'),
});

/** The finish reason the model reported for a turn. */
const FinishReasonSchema = z.enum([
  'stop',
  'length',
  'content-filter',
  'tool-calls',
  'error',
  'other',
]);

/**
 * Content-safe per-assistant-turn usage metadata: token counts, the resolved
 * model that produced the turn, the finish reason, and the price snapshot used to estimate cost. All
 * fields optional - a provider may omit counts, and an unpriced model (Azure, local, unknown) has no
 * price. Never carries prompt or response text.
 */
export const UsageMetadataSchema = z.object({
  tokens: UsageTokensSchema.optional(),
  finishReason: FinishReasonSchema.optional(),
  rawFinishReason: z.string().optional(),
  /** The server-resolved namespaced `provider:model` id used for the turn. */
  modelId: z.string().optional(),
  /** The provider's own reported model id, kept for fidelity (may be a versioned variant). */
  providerReportedModelId: z.string().optional(),
  responseId: z.string().optional(),
  responseAt: z.number().int().nonnegative().optional(),
  price: UsagePriceSchema.optional(),
  /**
   * Set by the server when a turn did NOT complete: `'aborted'` (the user pressed Stop) or `'error'`
   * (the stream failed). Kept separate from `finishReason` (the model's own reason) so a synthesized
   * incomplete marker never conflates with a real finish reason. Content-safe (an enum, never text).
   */
  incompleteReason: z.enum(['aborted', 'error']).optional(),
});

/** The resolved usage metadata for one assistant turn. */
export type UsageMetadata = z.infer<typeof UsageMetadataSchema>;

/** Per-message metadata carried on every UIMessage (AI SDK v6 message metadata). Rides the persisted
 *  UIMessage JSON, so it survives reload with no schema change. `createdAt` is epoch milliseconds:
 *  the user message's send time (client-stamped) or the assistant message's stream-start time
 *  (server-stamped). `usage` is the content-safe per-turn usage metadata (assistant turns only). */
export const MessageMetadataSchema = z.object({
  createdAt: z.number().int().nonnegative(),
  usage: UsageMetadataSchema.optional(),
  /**
   * The wall-clock milliseconds the model spent thinking before the answer began:
   * the gap between the first reasoning delta and the first text delta. Content-safe (a duration,
   * never reasoning text). Optional - present only on assistant turns where thinking occurred.
   */
  reasoningMs: z.number().int().nonnegative().optional(),
});

/** The metadata shape stamped on each message. */
export type MessageMetadata = z.infer<typeof MessageMetadataSchema>;
