import { QueryClient } from '@tanstack/react-query';
import { CACHE_TTL } from './constants';

/**
 * Single TanStack Query client.
 * TTLs follow the caching tiers in Developers.pdf §12.
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: CACHE_TTL.availability,
        gcTime: 10 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
