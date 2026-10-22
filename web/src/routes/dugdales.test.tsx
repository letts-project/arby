import { describe, it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import type { HostStatus, LaneStatus } from '@/lib/types'

vi.mock('@/components/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

const hosts: HostStatus[] = [
  {
    id: 'srv-izi1',
    online: true,
    managed: true,
    version: '0.0.22',
    uptime_seconds: 3600,
    applied_at: 1_700_000_000_000,
    queue_summary: { queued: 3, running: 1 },
    labels: ['eu'],
  },
  { id: 'dug-noauth', online: true, managed: false, queue_summary: { queued: 0, running: 0 } },
  { id: 'dug-down', online: false, managed: true, queue_summary: { queued: 0, running: 0 } },
]

const lanes: LaneStatus[] = [
  { host: 'srv-izi1', name: 'default', queued: 3, running: 1, concurrency: 2, paused: false },
  { host: 'srv-izi1', name: 'batch', queued: 7, running: 0, concurrency: 1, paused: true },
]

vi.mock('@/hooks/useDugdales', () => ({
  useDugdales: () => ({
    data: { hosts, unavailable_hosts: ['dug-down'], unavailable_reasons: { 'dug-down': 'connection refused' } },
    isLoading: false,
    isError: false,
    error: null,
    refetch: () => {},
  }),
}))

vi.mock('@/hooks/useLanes', () => ({
  useLanes: () => ({ data: { lanes }, isLoading: false }),
}))

async function renderDugdales() {
  const { routeTree } = await import('@/routeTree.gen')
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/dugdales'] }),
  })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  await screen.findByRole('link', { name: 'srv-izi1' })
}

describe('Dugdales page', () => {
  it('links each managed dugdale to its page and leaves unmanaged ones inert', async () => {
    await renderDugdales()

    expect(screen.getByRole('link', { name: 'srv-izi1' })).toHaveAttribute('href', '/dugdales/srv-izi1')
    expect(screen.queryByRole('link', { name: 'dug-noauth' })).toBeNull()
    expect(screen.getByText('up, not managed by arby')).toBeInTheDocument()
  })

  it('says why a dugdale is unreachable', async () => {
    await renderDugdales()

    expect(screen.getByText('unreachable: connection refused')).toBeInTheDocument()
  })

  it('links lane backlogs to the filtered missions list and offers Continue on a paused lane', async () => {
    await renderDugdales()

    expect(screen.getByRole('link', { name: '7' })).toHaveAttribute('href', '/missions?state=queued&host=srv-izi1&lane=batch')
    expect(screen.getByRole('button', { name: 'Continue srv-izi1/batch' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pause srv-izi1/default' })).toBeInTheDocument()
  })
})
