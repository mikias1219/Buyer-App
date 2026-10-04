import { QueryClient } from '@tanstack/react-query';
import { toAppError } from '../lib/api/errors';

const NO_RETRY = new Set([
  'not_found',
  'not_authorized',
  'not_authenticated',
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

export const qk = {
  me: ['me'] as const,
  settings: ['settings'] as const,
  home: (city: string | null) => ['home', city] as const,
  search: (filters: object) => ['search', filters] as const,
  listing: (id: string) => ['listing', id] as const,
  seller: (id: string) => ['seller', id] as const,
  favorites: ['favorites'] as const,
  myListings: ['myListings'] as const,
  myListing: (id: string) => ['myListing', id] as const,
  payment: (id: string) => ['payment', id] as const,
  priceHint: (category: string, brand: string) => ['priceHint', category, brand] as const,
  admin: {
    all: ['admin'] as const,
    dashboard: ['admin', 'dashboard'] as const,
    queue: ['admin', 'queue'] as const,
    payments: (status: string, search: string) => ['admin', 'payments', status, search] as const,
    reports: (status: string) => ['admin', 'reports', status] as const,
    users: (search: string, filter: string) => ['admin', 'users', search, filter] as const,
    user: (id: string) => ['admin', 'user', id] as const,
    listings: (status: string, search: string) => ['admin', 'listings', status, search] as const,
    settings: ['admin', 'settings'] as const,
    audit: (action: string, target: string) => ['admin', 'audit', action, target] as const,
  },
};
