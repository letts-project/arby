import { describe, it, expect } from 'vitest'
import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { QueuesTable } from './QueuesTable'
import type { HostStatus, LaneStatus } from '@/lib/types'

const hosts: HostStatus[] = [
  { id: 's1', online: true, managed: true, uptime_seconds: 60, queue_summary: { queued: 9, running: 3 } },
  { id: 's2', online: false, managed: true, queue_summary: { queued: 0, running: 0 } },
]
const lanes: LaneStatus[] = [
  { host: 's1', name: 'default', queued: 2, running: 2, concurrency: 3, paused: false },
  { host: 's1', name: 'batch', queued: 7, running: 1, concurrency: 2, paused: true },
]

function Collapsible() {
  const [open, setOpen] = useState<Set<string>>(new Set())
  return (
    <QueuesTable
      hosts={hosts}
      lanes={lanes}
      reasons={{ s2: 'connection refused' }}
      expanded={open}
      onToggle={(id) => setOpen((s) => new Set(s.has(id) ? [] : [id]))}
    />
  )
}

async function renderCollapsible() {
  const rootRoute = createRootRoute({ component: Outlet })
  const index = createRoute({ getParentRoute: () => rootRoute, path: '/', component: Collapsible })
  const router = createRouter({
    routeTree: rootRoute.addChildren([index]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  await screen.findByRole('button', { name: 'Show lanes of s1' })
}

describe('QueuesTable (collapsible)', () => {
  it('folds a dugdale into one row that sums its lanes', async () => {
    await renderCollapsible()

    expect(screen.queryByRole('link', { name: 'default' })).toBeNull()
    expect(screen.getByRole('link', { name: '9' })).toHaveAttribute('href', '/missions?state=queued&host=s1')
    expect(screen.getByText('1 paused')).toBeInTheDocument()
    expect(screen.getByText('unreachable')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /lanes of s2/ })).toBeNull()
  })

  it('shows the lanes when the dugdale is expanded', async () => {
    await renderCollapsible()

    fireEvent.click(screen.getByRole('button', { name: 'Show lanes of s1' }))

    expect(screen.getByRole('link', { name: 'default' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue s1/batch' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide lanes of s1' })).toHaveAttribute('aria-expanded', 'true')
  })
})
