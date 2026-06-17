import { createFileRoute } from '@tanstack/react-router';

import { SettingsView } from '../components/settings/SettingsView';

/** The settings route: renders the accessible settings surface. */
export const Route = createFileRoute('/settings')({
  component: SettingsView,
});
