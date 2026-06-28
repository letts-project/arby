import { describe, it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import type { HostStatus } from '@/lib/types'

// AppShell pulls in navigation/data widgets we don't need here; render it as a
// passthrough so only the Dugdales route content mounts.
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
    applied_at: 1_700_000_000,
    queue_summary: { queued: 0, running: 1 },
    labels: ['eu'],
  },
  {
    id: 'dug-noauth',
    online: true,
    managed: false,
    queue_summary: { queued: 0, running: 0 },
  },
]

vi.mock('@/hooks/useDugdales', () => ({
  useDugdales: () => ({
    data: { hosts },
    isLoading: false,
    isError: false,
    error: null,
    refetch: () => {},
  }),
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
  await screen.findByRole('link', { name: 'View config for srv-izi1' })
}

describe('Dugdales table', () => {
  it('makes each managed host row a real link to its config (cmd+click opens a new tab)', async () => {
    await renderDugdales()

    const link = screen.getByRole('link', { name: 'View config for srv-izi1' })
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', '/config/srv-izi1')
  })

  it('leaves unmanaged host rows inert (no link)', async () => {
    await renderDugdales()

    // Only the managed host gets a config link; the unmanaged one stays inert.
    expect(screen.getAllByRole('link', { name: /^View config for/ })).toHaveLength(1)
    expect(screen.queryByRole('link', { name: 'View config for dug-noauth' })).toBeNull()
  })

  it('keeps label chips clickable (filter) above the row link', async () => {
    await renderDugdales()

    // The chip is a button, not swallowed by the stretched row link.
    expect(screen.getByRole('button', { name: 'eu' })).toBeInTheDocument()
  })
})
