import { QueryClient } from '@tanstack/react-query';
import { toAppError } from '../lib/api/errors';

const NO_RETRY = new Set([
  'not_found',
  'not_authorized',
  'not_authenticated',
  'no_access',
  'banned',
  'invalid_input',
  'not_configured',
  'session_expired',
]);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => count < 2 && !NO_RETRY.has(toAppError(err).code),
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    mutations: { retry: false },
  },
});

/** Query keys per feature. Mutations invalidate by prefix (e.g. ['products'] after a sale). */
export const qk = {
  me: ['me'] as const,
  settings: ['settings'] as const,
  team: ['team'] as const,
  categories: (includeArchived: boolean) => ['categories', includeArchived] as const,
  products: {
    all: ['products'] as const,
    list: (filters: object) => ['products', 'list', filters] as const,
    detail: (id: string) => ['products', 'detail', id] as const,
    movements: (id: string) => ['products', 'movements', id] as const,
    lowStock: ['products', 'low-stock'] as const,
  },
  sales: {
    all: ['sales'] as const,
    list: (filters: object) => ['sales', 'list', filters] as const,
    detail: (id: string) => ['sales', 'detail', id] as const,
  },
  expenses: {
    all: ['expenses'] as const,
    list: (filters: object) => ['expenses', 'list', filters] as const,
  },
  reports: {
    all: ['reports'] as const,
    of: (name: string, args: object) => ['reports', name, args] as const,
  },
};
