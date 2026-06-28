import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { MissionsTable } from './MissionsTable'
import type { MergedMission } from '@/lib/types'

function makeRow(over: Partial<MergedMission>): MergedMission {
  return {
    host: 'srv-izi1',
    mission_id: 'm-1',
    mission_name: 'nightly-sweep',
    display_name: 'nightly-sweep',
    lane: 'default',
    status: 'done',
    outcome: 'success',
    time_created: 1_700_000_000_000,
    duration_ms: 1000,
    ...over,
  } as MergedMission
}

// Render the table inside a real router so the per-row <Link> resolves to a
// genuine <a href>. The detail route must be registered for the href to build.
async function renderTable(rows: MergedMission[]) {
  const rootRoute = createRootRoute({ component: Outlet })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <MissionsTable rows={rows} />,
  })
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/missions/$host/$id',
    component: () => <div>detail</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, detailRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  // RouterProvider mounts asynchronously — wait for the first row link.
  await screen.findAllByRole('link', { name: /^Open mission/ })
}

describe('MissionsTable', () => {
  it('renders each row as a real link to the mission detail (cmd+click opens a new tab)', async () => {
    await renderTable([
      makeRow({ host: 'srv-izi1', mission_id: 'm-1', mission_name: 'alpha' }),
      makeRow({ host: 'dug2', mission_id: 'm-2', mission_name: 'beta' }),
    ])

    const links = screen.getAllByRole('link', { name: /^Open mission/ })
    expect(links).toHaveLength(2)
    // Real anchors with hrefs are what make modifier-click / middle-click /
    // "Open in new tab" work natively.
    expect(links[0].tagName).toBe('A')
    expect(links[0]).toHaveAttribute('href', '/missions/srv-izi1/m-1')
    expect(links[1]).toHaveAttribute('href', '/missions/dug2/m-2')
  })

  it('keeps the in-row controls (copy id, actions menu) usable alongside the link', async () => {
    await renderTable([makeRow({})])

    expect(screen.getByRole('button', { name: 'Copy mission id' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mission actions' })).toBeInTheDocument()
  })
})
