import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DTable, DThead, DTr, DTd, SortableDTh } from './Table'
import { useTableSort } from '@/hooks/useTableSort'

function renderHeader(activeKey: string, dir: 'asc' | 'desc', onToggle = () => {}) {
  return render(
    <DTable>
      <DThead>
        <tr>
          <SortableDTh sortKey="host" sort={{ key: activeKey, dir }} onToggle={onToggle}>
            Host
          </SortableDTh>
          <SortableDTh sortKey="queued" sort={{ key: activeKey, dir }} onToggle={onToggle}>
            Queued
          </SortableDTh>
        </tr>
      </DThead>
    </DTable>,
  )
}

describe('SortableDTh', () => {
  it('marks the active column with aria-sort and others "none"', () => {
    renderHeader('host', 'asc')
    expect(screen.getByText('Host').closest('th')).toHaveAttribute('aria-sort', 'ascending')
    expect(screen.getByText('Queued').closest('th')).toHaveAttribute('aria-sort', 'none')
  })

  it('reflects descending direction', () => {
    renderHeader('host', 'desc')
    expect(screen.getByText('Host').closest('th')).toHaveAttribute('aria-sort', 'descending')
  })

  it('calls onToggle with its own column key when clicked', () => {
    const onToggle = vi.fn()
    renderHeader('host', 'asc', onToggle)
    fireEvent.click(screen.getByText('Queued'))
    expect(onToggle).toHaveBeenCalledWith('queued')
  })
})

// End-to-end of the pattern every display table uses: useTableSort + SortableDTh.
function SortDemo() {
  const rows = [{ host: 's10' }, { host: 's2' }, { host: 's1' }]
  const { sort, toggle, sorted } = useTableSort<{ host: string }>(
    { host: (r) => r.host },
    { key: 'host', dir: 'asc' },
  )
  return (
    <DTable>
      <DThead>
        <tr>
          <SortableDTh sortKey="host" sort={sort} onToggle={toggle}>
            Host
          </SortableDTh>
        </tr>
      </DThead>
      <tbody>
        {sorted(rows).map((r) => (
          <DTr key={r.host}>
            <DTd>{r.host}</DTd>
          </DTr>
        ))}
      </tbody>
    </DTable>
  )
}

describe('sortable table (integration)', () => {
  const cells = () => screen.getAllByRole('cell').map((c) => c.textContent)

  it('defaults to natural ascending order and reverses on header click', () => {
    render(<SortDemo />)
    expect(cells()).toEqual(['s1', 's2', 's10']) // natural: s2 < s10, not lexicographic
    fireEvent.click(screen.getByText('Host'))
    expect(cells()).toEqual(['s10', 's2', 's1'])
  })
})
