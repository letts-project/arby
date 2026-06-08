import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api'

/** Read-only applied config of a host (opaque JSON). */
export function useConfig(host: string) {
  return useQuery({
    queryKey: ['config', host],
    queryFn: () => apiGet<unknown>(`/api/config/${encodeURIComponent(host)}`),
  })
}
