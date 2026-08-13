'use client';

/**
 * Server/API state via TanStack Query.
 * Do not mirror this into Zustand.
 */

import { useQuery } from '@tanstack/react-query';
import { fetchPlatformComposition, type PlatformCompositionResponse } from '@/lib/platform';

export const platformCompositionQueryKey = ['platform', 'composition'] as const;

export function usePlatformComposition(enabled = true) {
  return useQuery<PlatformCompositionResponse>({
    queryKey: platformCompositionQueryKey,
    queryFn: fetchPlatformComposition,
    enabled,
    staleTime: 60_000,
  });
}
