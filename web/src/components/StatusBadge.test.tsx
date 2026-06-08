import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge } from './StatusBadge'

describe('StatusBadge', () => {
  it('labels non-terminal missions by status', () => {
    render(<StatusBadge mission={{ status: 'running' }} />)
    expect(screen.getByText('running')).toBeInTheDocument()
  })

  it('labels done missions by outcome', () => {
    const { rerender } = render(<StatusBadge mission={{ status: 'done', outcome: 'success' }} />)
    expect(screen.getByText('success')).toBeInTheDocument()
    rerender(<StatusBadge mission={{ status: 'done', outcome: 'failed' }} />)
    expect(screen.getByText('failed')).toBeInTheDocument()
  })

  it('applies the failed tone to crashed/oom/lost outcomes', () => {
    const { container } = render(<StatusBadge mission={{ status: 'done', outcome: 'crashed' }} />)
    expect(container.querySelector('.text-status-failed')).not.toBeNull()
  })

  it('applies the warn tone to killed/timeout outcomes', () => {
    const { container } = render(<StatusBadge mission={{ status: 'done', outcome: 'timeout' }} />)
    expect(container.querySelector('.text-status-warn')).not.toBeNull()
  })
})
