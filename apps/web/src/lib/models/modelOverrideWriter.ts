import { apiPatchNoContent } from '../api-client';

/** A small stateful writer for the per-conversation model override. */
export interface ModelOverrideWriter {
  /**
   * Persist the override (a namespaced model id, or `null` to inherit the default) for the writer's
   * conversation id. Fires immediately at `PATCH /api/v1/conversations/:id/model`, which
   * create-if-absents the row (so a draft persists on first write). The returned promise REJECTS on
   * failure; the caller handles that (the hook notifies via `modelOverrideSaveFailed`). A swallowed
   * copy is stored so `pending()` is await-safe for the send-ordering gate.
   */
  write(value: string | null): Promise<void>;
  /**
   * Await the latest in-flight write so the send path reads the updated model before the chat send.
   * Always resolves (never rejects); resolves immediately when no write is in flight.
   */
  pending(): Promise<void>;
}

/**
 * Build a {@link ModelOverrideWriter} bound to a single conversation id. The write is OUTSIDE the
 * settings single-flight queue; the send path awaits {@link ModelOverrideWriter.pending}. The endpoint
 * returns 204 (no body), so it uses {@link apiPatchNoContent}.
 *
 * @param conversationId - The conversation whose model override this writer persists.
 * @returns A fresh writer (one per conversation surface).
 */
export function createModelOverrideWriter(conversationId: string): ModelOverrideWriter {
  let inFlight: Promise<void> = Promise.resolve();
  return {
    write(value) {
      const p = apiPatchNoContent(`/api/v1/conversations/${conversationId}/model`, {
        modelId: value,
      });
      // Track the latest write; swallow rejection here so `pending` is await-safe (the control
      // reconciles to the server state via the conversation detail query on the next read).
      inFlight = p.catch(() => undefined);
      return p;
    },
    pending() {
      return inFlight;
    },
  };
}
