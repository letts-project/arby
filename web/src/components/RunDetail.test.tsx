import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEventStream, type EventStreamState } from '@/hooks/useEventStream'
import { useOutputStream, type OutputStreamState } from '@/hooks/useOutputStream'
import type { MergedMission } from '@/lib/types'
import { RunDetail } from './RunDetail'

vi.mock('@/hooks/useEventStream')
vi.mock('@/hooks/useOutputStream')
vi.mock('./MissionRowActions', () => ({ MissionRowActions: () => null }))

const mission: MergedMission = { host: 's1', mission_id: 'm1', mission_name: 'export', status: 'running', input: { limit: 10 } }
let events: EventStreamState
let output: OutputStreamState

beforeEach(() => {
  events = {
    events: [
      { seq: 1, event: 'running', time_started: 1000 },
      { seq: 2, event: 'progress', time: 2000, value: 0, message: 'Starting export' },
      { seq: 3, event: 'progress', time: 3000, value: 0.68, message: 'Exporting records' },
    ],
    connected: true,
    failed: false,
  }
  output = { lines: [], connected: false, done: true, trimmed: false }
  vi.mocked(useEventStream).mockImplementation(() => events)
  vi.mocked(useOutputStream).mockImplementation(() => output)
})

function renderDetail(m = mission) {
  const client = new QueryClient()
  return render(<RunDetail m={m} back={null} onRestarted={() => {}} />, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  })
}

function sectionOrder() {
  return screen.getAllByRole('button', { name: /^(Output|Return|Input)\b/ }).map((button) => button.textContent?.match(/^(Output|Return|Input)/)?.[0])
}

describe('RunDetail', () => {
  it('keeps reported progress visible after a mission finishes without forcing it to 100%', () => {
    const view = renderDetail()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '68')
    view.rerender(<RunDetail m={{ ...mission, status: 'done', outcome: 'success' }} back={null} onRestarted={() => {}} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '68')
  })

  it('retains the latest percentage when a subsequent update only has a message', () => {
    events.events.push({ seq: 4, event: 'progress', message: 'Waiting for upload' })
    renderDetail({ ...mission, status: 'done', outcome: 'failed' })
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '68')
    expect(screen.getAllByText('Waiting for upload')).not.toHaveLength(0)
  })

  it('shows every progress update in history and supports closing with Escape', async () => {
    const user = userEvent.setup()
    renderDetail()
    await user.click(screen.getByRole('button', { name: 'View progress history' }))
    const dialog = screen.getByRole('dialog', { name: 'Progress history' })
    expect(within(dialog).getByText('Starting export')).toBeVisible()
    expect(within(dialog).getByText('0%')).toBeVisible()
    expect(within(dialog).getByText('Exporting records')).toBeVisible()
    expect(within(dialog).getByText('68%')).toBeVisible()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'View progress history' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'View history' }))
    expect(screen.getByRole('dialog')).toBeVisible()
  })

  it('offers history for message-only progress without inventing a percentage', async () => {
    events.events = [{ seq: 1, event: 'progress', message: 'Scanning files' }]
    renderDetail()
    expect(screen.queryByRole('progressbar')).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: 'View progress history' }))
    expect(within(screen.getByRole('dialog')).getByText('Scanning files')).toBeVisible()
  })

  it('does not show progress controls for a mission without progress events', () => {
    events.events = []
    renderDetail()
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.queryByRole('button', { name: 'View progress history' })).toBeNull()
  })

  it('keeps Output, Return and Input in place while output loads, finishes empty, or contains logs', () => {
    output = { ...output, done: false, connected: true }
    const view = renderDetail()
    expect(sectionOrder()).toEqual(['Output', 'Return', 'Input'])
    const done = { ...mission, status: 'done' as const, outcome: 'success' as const, return: { count: 10 } }
    view.rerender(<RunDetail m={done} back={null} onRestarted={() => {}} />)
    expect(sectionOrder()).toEqual(['Output', 'Return', 'Input'])
    output = { ...output, done: true, connected: false }
    view.rerender(<RunDetail m={done} back={null} onRestarted={() => {}} />)
    expect(sectionOrder()).toEqual(['Output', 'Return', 'Input'])
    output = { ...output, lines: [{ t: 1000, stream: 'stdout', data: 'Exported 10 records\n' }] }
    view.rerender(<RunDetail m={done} back={null} onRestarted={() => {}} />)
    expect(sectionOrder()).toEqual(['Output', 'Return', 'Input'])
    expect(screen.getByText('Exported 10 records')).toBeVisible()
  })
})
