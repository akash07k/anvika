import { z } from 'zod';

/**
 * The four base reasoning efforts, escalating. `'off'` is the lowest effort (no thinking),
 * not a separate boolean. This is the single shared notion of "how much thinking" reused by
 * the settings schema, the per-connection/per-conversation overrides, and the capability
 * registry (ADR 0029). EXTENSION POINT: a deeper `'xhigh'` (and a matching larger budget in
 * `reasoning-rules.ts`) can be appended here later as an additive enum + registry edit if `'high'`
 * proves too shallow; keep the order escalating and respect the `BUDGET_TOKENS` output-cap invariant.
 */
export const REASONING_EFFORTS = ['off', 'low', 'medium', 'high'] as const;

/** A reasoning effort: `'off' | 'low' | 'medium' | 'high'`. */
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

/** The Zod enum for a base reasoning effort, used at every settings trust boundary. */
export const ReasoningEffortSchema = z.enum(REASONING_EFFORTS);

/**
 * The override efforts: the four base efforts plus `'inherit'`, used on the per-connection and
 * per-conversation override layers where "fall through to the layer below" is a valid choice.
 */
export const REASONING_EFFORT_OVERRIDES = ['inherit', 'off', 'low', 'medium', 'high'] as const;

/** A reasoning effort override: a base effort or `'inherit'`. */
export type ReasoningEffortOverride = (typeof REASONING_EFFORT_OVERRIDES)[number];

/** The Zod enum for a reasoning effort override (the override layers). */
export const ReasoningEffortOverrideSchema = z.enum(REASONING_EFFORT_OVERRIDES);

/** A non-off reasoning effort: the level threaded into the registry `enable(effort)` builder. */
export type ReasoningLevel = Exclude<ReasoningEffort, 'off'>;
