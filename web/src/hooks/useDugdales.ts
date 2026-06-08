import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api'
import type { DugdalesResult } from '@/lib/types'

/** Per-host status table (same data as the dashboard host strip). */
export function useDugdales() {
  return useQuery({
    queryKey: ['dugdales'],
    queryFn: () => apiGet<DugdalesResult>('/api/dugdales'),
    refetchInterval: 4000,
  })
}
