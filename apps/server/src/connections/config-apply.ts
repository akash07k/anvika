import type { TestConfigOverride } from '@anvika/shared/connections/contracts';
import type { Connection } from '@anvika/shared/settings/connection';

/**
 * The connection carrier shape for the non-secret probe-config fields. Each is optional on the
 * connection union, so they are typed loosely here and overlaid uniformly. The result is fed to
 * `probeTarget`, not re-validated, so no schema check happens here (mirrors {@link applyConnectionSecret}).
 */
type ConfigCarrier = { baseUrl?: string; resourceName?: string; apiVersion?: string };

/**
 * Apply a non-secret config-override to a connection, returning a NEW connection (the input is never
 * mutated). Each of `baseUrl`, `resourceName`, and `apiVersion` is OVERLAID only when present in the
 * override, and LEFT unchanged when absent - via conditional spreads, so a field is never assigned
 * `undefined` (`exactOptionalPropertyTypes`). The connection's secret fields (`apiKey`, `headers`) and
 * every other field are carried through untouched, so a config-only override probes the NEW config
 * with the STORED secret.
 *
 * This is a PURE helper: it moves public config values between plain objects and does no validation
 * (the result is handed to {@link probeTarget}, not re-parsed) - exactly like {@link applyConnectionSecret}.
 *
 * @param connection - The existing (validated) connection to base the result on.
 * @param config - The non-secret config-override describing which public fields to overlay.
 * @returns A new connection with the override applied; the input is unchanged.
 */
export function applyConnectionConfig(
  connection: Connection,
  config: TestConfigOverride,
): Connection {
  return {
    ...connection,
    ...(config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
    ...(config.resourceName !== undefined ? { resourceName: config.resourceName } : {}),
    ...(config.apiVersion !== undefined ? { apiVersion: config.apiVersion } : {}),
  } as Connection & ConfigCarrier as Connection;
}
