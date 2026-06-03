import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { HotkeysProvider } from 'react-hotkeys-hook';

import './styles.css';
import 'streamdown/styles.css';
import { routeTree } from './routeTree.gen';
import { clientLog } from './lib/logger';
import { loadRuntimeConfig } from './lib/loadRuntimeConfig';
import { diagnostics } from './diagnostics/logDiag';
import { startDiagnosticsLifecycle } from './diagnostics/lifecycle';
import { installWindowErrorHandlers } from './diagnostics/window-errors';
import { queryClient } from './lib/queryClient';
import { registerNotificationChannels } from './notifications/register';

registerNotificationChannels();

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('root element missing');
createRoot(rootEl).render(
  <StrictMode>
    <HotkeysProvider initiallyActiveScopes={['*']}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </HotkeysProvider>
  </StrictMode>,
);
clientLog('app-mounted');
void loadRuntimeConfig();
startDiagnosticsLifecycle({
  flush: () => void diagnostics.flush(),
  intervalMs: 1000,
  shouldStop: () => diagnostics.isDisabled(),
});
installWindowErrorHandlers();
