import { z } from 'zod';

/** Response body of GET /api/v1/health. `logContent` mirrors the server's content-logging opt-in
 *  (operator/runtime metadata, never a user setting), read once at client boot. */
export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  logContent: z.boolean(),
});

/** The validated GET /api/v1/health response type. */
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
