import type {
  TestConnectionRequest,
  TestConnectionResponse,
} from '@anvika/shared/connections/contracts';
import type { Connection } from '@anvika/shared/settings/connection';
import type { Settings } from '@anvika/shared/settings/schema';

import type { FetchImpl } from '../models/discovery/shared';
import { applyConnectionConfig } from './config-apply';
import { probeTarget } from './probe-target';
import { applyConnectionSecret } from './secret-apply';

/** The interactive probe ceiling in milliseconds (bounded so the UI never hangs). */
const DEFAULT_TIMEOUT_MS = 8000;

/** Injectable deps for {@link testConnection}: saved settings (to resolve a connectionId) + fetch. */
export interface TestConnectionDeps {
  /** The saved settings, used to resolve a `{ connectionId }` request to a stored connection. */
  settings?: Settings;
  /** The fetch implementation; defaults to the global `fetch`. */
  fetchImpl?: FetchImpl;
  /** The abort timeout in milliseconds; defaults to {@link DEFAULT_TIMEOUT_MS}. */
  timeoutMs?: number;
}

/**
 * Resolve the request to the connection to probe: a full config directly, or a saved one by id with
 * an optional non-secret `config` override and an optional secret `override` applied on top of the
 * stored connection before probing. An unknown id resolves to `null` (the caller maps that to a
 * `bad-config` error). The config is overlaid FIRST, then the secret, so a kept-key + changed-config
 * Test probes the NEW config with the STORED key. The stored connection itself is never mutated.
 */
function resolveConnection(
  req: TestConnectionRequest,
  settings: Settings | undefined,
): Connection | null {
  if ('connection' in req) return req.connection;
  const stored = settings?.connections.find((c) => c.id === req.connectionId);
  if (!stored) return null;
  const withConfig = req.config ? applyConnectionConfig(stored, req.config) : stored;
  return req.override ? applyConnectionSecret(withConfig, req.override) : withConfig;
}

/** Count models in a listing body that may use the `data` (OpenAI-shape) or `models` (Google) array. */
function countModels(body: unknown): number {
  const obj = (body ?? {}) as { data?: unknown; models?: unknown };
  const list = Array.isArray(obj.data) ? obj.data : Array.isArray(obj.models) ? obj.models : null;
  return list ? list.length : 0;
}

/**
 * Probe a connection's model-listing endpoint and return a content-safe result: ok with a model count,
 * or a categorized error. Unlike the fail-soft discovery adapters (which collapse every
 * failure to `[]`), this reads the raw HTTP status so it can distinguish unauthorized (401/403) from
 * reachable-but-no-listing (404 -> ok with 0 models) from unreachable (network error) from unknown
 * (other non-2xx). Never includes the key, headers, base URL, or any response body in the result or any
 * log.
 *
 * @param req - A saved-connection reference (`{ connectionId }`) or a full config (`{ connection }`).
 * @param deps - Saved settings (to resolve a `connectionId`) and an injectable fetch/timeout.
 * @returns The content-safe {@link TestConnectionResponse}.
 */
export async function testConnection(
  req: TestConnectionRequest,
  deps: TestConnectionDeps = {},
): Promise<TestConnectionResponse> {
  const connection = resolveConnection(req, deps.settings);
  if (!connection) {
    return { ok: false, error: { code: 'bad-config', message: 'Connection not found' } };
  }
  const { url, headers } = probeTarget(connection);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { headers, signal: controller.signal });
    if (res.ok) {
      const body = await res.json().catch(() => null);
      return { ok: true, modelCount: countModels(body) };
    }
    if (res.status === 404) return { ok: true, modelCount: 0 };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: { code: 'unauthorized', message: 'Authentication failed' } };
    }
    return {
      ok: false,
      error: { code: 'unknown', message: `Provider returned status ${res.status}` },
    };
  } catch {
    return { ok: false, error: { code: 'unreachable', message: 'Could not reach the provider' } };
  } finally {
    clearTimeout(timer);
  }
}
