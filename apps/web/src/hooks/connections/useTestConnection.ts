import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import {
  TestConnectionResponseSchema,
  type TestConnectionRequest,
  type TestConnectionResponse,
} from '@anvika/shared/connections/contracts';

import { notify } from '../../notifications/notifier';
import { apiPost } from '../../lib/api-client';

/**
 * Delay before the "still testing" reassurance fires while a test is still in flight. FIXED
 * interactive-test timing, deliberately distinct from the generation `announcementPeriodMs`: this
 * is a one-shot reassurance for a button press, not a recurring heartbeat.
 */
const STILL_RUNNING_MS = 3000;

/**
 * Hard ceiling after which a still-pending test is aborted and reported as unreachable. FIXED
 * interactive-test timing. Deliberately longer than the 2s background-discovery timeout so a
 * slow-but-valid provider is not falsely reported "unreachable" during a manual test.
 */
const CEILING_MS = 8000;

/** The endpoint the test-connection mutation posts to. */
const TEST_PATH = '/api/v1/connections/test';

/**
 * A content-safe summary of a finished test, returned alongside the announcement so a persistent
 * (non-live) "Last test" status line can be rendered. It carries only a model count or an error
 * category - never a label, secret, header value, base URL, or the server's error message.
 */
export type TestOutcome =
  | { kind: 'ok'; modelCount: number }
  | { kind: 'ok-no-listing' }
  | { kind: 'failed'; category: 'unauthorized' | 'unreachable' | 'error' };

/** Map a content-bearing server error code to the content-safe failure category. */
function categoryForCode(
  code: 'unauthorized' | 'unreachable' | 'bad-config' | 'unknown',
): 'unauthorized' | 'unreachable' | 'error' {
  if (code === 'unauthorized') return 'unauthorized';
  if (code === 'unreachable') return 'unreachable';
  return 'error';
}

/**
 * Map a resolved (HTTP 200) test response to its content-safe {@link TestOutcome}, WITHOUT
 * announcing. The pure half of {@link announceOutcome}, reused on the silenced path so an aborted
 * owner still gets a content-safe result without a contradicting late announcement.
 */
function outcomeFor(response: TestConnectionResponse): TestOutcome {
  if (response.ok && response.modelCount !== undefined && response.modelCount > 0) {
    return { kind: 'ok', modelCount: response.modelCount };
  }
  if (response.ok) return { kind: 'ok-no-listing' };
  return { kind: 'failed', category: categoryForCode(response.error?.code ?? 'unknown') };
}

/**
 * Announce the outcome of a resolved (HTTP 200) test response AND return its content-safe summary.
 * The announcement and the returned {@link TestOutcome} are the same outcome in two media.
 */
function announceOutcome(response: TestConnectionResponse): TestOutcome {
  const outcome = outcomeFor(response);
  if (outcome.kind === 'ok') notify({ type: 'connectionTestOk', modelCount: outcome.modelCount });
  else if (outcome.kind === 'ok-no-listing') notify({ type: 'connectionTestOkNoListing' });
  else notify({ type: 'connectionTestFailed', category: outcome.category });
  return outcome;
}

/**
 * Run a single test-connection request: announce start, arm the still-running and ceiling timers,
 * post the request with an abort signal, and announce the content-safe outcome. The timers are
 * always cleared before any outcome announcement so the reassurance never races a settle.
 *
 * When `ownerSignal` aborts (its owner - e.g. the form - unmounts), the in-flight request is
 * cancelled and `silenced` is set so NO further announcement fires: a late "Connection OK/failed"
 * must never contradict the "saved" the user already heard. The promise still resolves to a
 * content-safe {@link TestOutcome}; it is simply not announced. The abort listener is `once` and
 * removed on settle so it cannot leak. This never changes any announcement's content-safety.
 */
async function runTest(
  request: TestConnectionRequest,
  ownerSignal?: AbortSignal,
): Promise<TestOutcome> {
  notify({ type: 'connectionTestStarted' });

  const controller = new AbortController();
  let aborted = false;
  let silenced = false;
  const stillRunning = setTimeout(() => {
    if (!silenced) notify({ type: 'connectionTestStillRunning' });
  }, STILL_RUNNING_MS);
  const ceiling = setTimeout(() => {
    aborted = true;
    controller.abort();
  }, CEILING_MS);
  const onOwnerAbort = (): void => {
    silenced = true;
    controller.abort();
  };
  ownerSignal?.addEventListener('abort', onOwnerAbort, { once: true });
  const clear = (): void => {
    clearTimeout(stillRunning);
    clearTimeout(ceiling);
    ownerSignal?.removeEventListener('abort', onOwnerAbort);
  };

  try {
    const response = await apiPost(
      TEST_PATH,
      request,
      TestConnectionResponseSchema,
      controller.signal,
    );
    clear();
    // A 200 with a missing body cannot happen for this endpoint (the schema is always supplied),
    // but treat an absent body as an unknown failure rather than crashing.
    if (!response) {
      if (!silenced) notify({ type: 'connectionTestFailed', category: 'error' });
      return { kind: 'failed', category: 'error' };
    }
    // When silenced, return the same content-safe outcome without announcing it.
    if (silenced) return outcomeFor(response);
    return announceOutcome(response);
  } catch {
    clear();
    // A thrown transport error never carries an `unauthorized` code (that category is only derived
    // from a resolved 200 body's `code` field via {@link categoryForCode}). So a throw is either the
    // abort ceiling (unreachable) or an otherwise-unknown failure (error).
    const category = aborted ? 'unreachable' : 'error';
    if (!silenced) notify({ type: 'connectionTestFailed', category });
    return { kind: 'failed', category };
  }
}

/**
 * A TanStack mutation that tests a provider connection and announces the outcome through the typed
 * notification layer with a bounded timing state machine (start, a single still-running reassurance
 * at {@link STILL_RUNNING_MS}, and a {@link CEILING_MS} abort ceiling). Every announcement is
 * content-safe: it carries only a model count or an error category - never a label, secret, header
 * value, base URL, or the server's error message.
 *
 * Each run also resolves to a content-safe {@link TestOutcome} (the same outcome it announced), so a
 * caller can render a persistent non-live "Last test" status line from `mutation.data` without
 * touching any secret or content field.
 *
 * @param ownerSignal - Optional owner-lifetime signal. When it aborts (the caller unmounts), an
 *   in-flight test is cancelled and its outcome announcement is SILENCED, so a late "Connection
 *   OK/failed" never contradicts a "saved" the user already heard. Omit it to keep the prior
 *   behaviour (e.g. {@link ConnectionListItem}, whose test is not tied to a transient form).
 * @returns The TanStack {@link UseMutationResult}; call `mutate(request)` to start a test.
 */
export function useTestConnection(
  ownerSignal?: AbortSignal,
): UseMutationResult<TestOutcome, Error, TestConnectionRequest> {
  return useMutation<TestOutcome, Error, TestConnectionRequest>({
    mutationFn: (request) => runTest(request, ownerSignal),
  });
}
