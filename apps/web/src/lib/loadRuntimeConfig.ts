import { HealthResponseSchema } from '@anvika/shared/health';

import { useRuntimeConfigStore } from '../stores/runtimeConfigStore';
import { apiGet } from './api-client';

/**
 * Fetch server runtime config once at boot and populate the runtime-config store. A failure leaves
 * the safe default (`logContent: false`), so the notification log channel stays codes-only until the
 * flag is known.
 */
export async function loadRuntimeConfig(): Promise<void> {
  try {
    const health = await apiGet('/api/v1/health', HealthResponseSchema);
    useRuntimeConfigStore.getState().setLogContent(health.logContent);
  } catch {
    // Keep the safe default: a failed runtime-config fetch keeps content logging off.
  }
}
