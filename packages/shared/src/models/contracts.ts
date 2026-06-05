import { z } from 'zod';

import { ModelInfoSchema } from './model-info';

/**
 * One connection's live-discovery outcome. `ok` = the listing returned models (or the
 * type does not list); `empty` = a reachable listing returned none; `unreachable` / `unauthorized` /
 * `error` categorize a failed listing. Content-safe: only the connection id and a category, never a
 * URL, host, key, or body.
 */
export const ConnectionDiscoveryStatusSchema = z.object({
  connectionId: z.string().min(1),
  outcome: z.enum(['ok', 'empty', 'unreachable', 'unauthorized', 'error']),
});

/** One connection's content-safe discovery outcome. */
export type ConnectionDiscoveryStatus = z.infer<typeof ConnectionDiscoveryStatusSchema>;

/**
 * Response body for `GET /api/v1/models`: a flat array of {@link ModelInfoSchema}
 * records, each carrying its `providerId` so the client groups by provider for the picker without a
 * second shape. `priceCurrency` and `priceUnit` state, once per response, the unit of every model's
 * `inputPrice`/`outputPrice` (USD per million tokens - models.dev's convention; it exposes no currency
 * of its own, so this is an asserted constant). Both are defaulted literals, so a consumer always
 * receives them and the route need not supply them. The app is single-currency; widen the literals if
 * other currencies/units are ever needed.
 */
export const ModelsResponseSchema = z.object({
  models: z.array(ModelInfoSchema),
  /**
   * Per-connection discovery outcomes, one entry per ENABLED connection. Defaulted so the
   * field always exists and older callers are unaffected. Disabled connections are absent.
   */
  connectionStatuses: z.array(ConnectionDiscoveryStatusSchema).default([]),
  priceCurrency: z.literal('USD').default('USD'),
  priceUnit: z.literal('perMillionTokens').default('perMillionTokens'),
});

/** A validated models-list response. */
export type ModelsResponse = z.infer<typeof ModelsResponseSchema>;
