import { z } from 'zod';

import { ReasoningEffortSchema } from './reasoning/effort';

/**
 * Request body for the per-conversation reasoning override (`PATCH
 * /api/v1/conversations/:id/reasoning`): set the thinking-effort override to a concrete effort, or
 * `null` to clear it back to inherit. Strict (unknown keys rejected) per the both-direction
 * trust-boundary rule.
 */
export const SetReasoningOverrideSchema = z.strictObject({
  reasoningOverride: ReasoningEffortSchema.nullable(),
});

/** A validated set-reasoning-override request body. */
export type SetReasoningOverride = z.infer<typeof SetReasoningOverrideSchema>;

/**
 * Request body for the per-conversation model override (`PATCH
 * /api/v1/conversations/:id/model`): set the conversation's model to a concrete (non-empty) model
 * id, or `null` to clear it back to inherit the default model. Empty string is rejected - "inherit"
 * is expressed as `null`, never `''`, so the stored override is unambiguous. Strict (unknown keys
 * rejected) per the both-direction trust-boundary rule.
 */
export const SetModelOverrideSchema = z.strictObject({
  modelId: z.string().min(1).nullable(),
});

/** A validated set-model-override request body. */
export type SetModelOverride = z.infer<typeof SetModelOverrideSchema>;
