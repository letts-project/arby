import { describe, it, expect } from 'vitest'
import { lineCount } from './format'

describe('lineCount', () => {
  it('counts lines across chunks, including a last line without a newline', () => {
    expect(lineCount([])).toBe(0)
    expect(lineCount([{ data: 'a\nb\n' }, { data: 'c\n' }])).toBe(3)
    expect(lineCount([{ data: 'a\nb' }])).toBe(2)
  })
})
