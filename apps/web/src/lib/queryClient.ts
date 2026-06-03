import { QueryClient } from '@tanstack/react-query';

/** The app-wide TanStack Query client (single instance, created once at module load). */
export const queryClient = new QueryClient();
