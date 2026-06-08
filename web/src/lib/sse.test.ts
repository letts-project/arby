import { describe, it, expect } from 'vitest'
import { parseEvent, parseOutputLine } from './sse'

describe('sse parsing', () => {
  it('parses a done event', () => {
    const ev = parseEvent('{"seq":6,"event":"done","outcome":"success","exit_code":0,"duration_ms":1234}')
    expect(ev?.event).toBe('done')
    expect(ev?.outcome).toBe('success')
    expect(ev?.exit_code).toBe(0)
  })

  it('parses an output line', () => {
    const l = parseOutputLine('{"t":1714600000123,"stream":"stderr","data":"warn\\n"}')
    expect(l?.stream).toBe('stderr')
    expect(l?.data).toBe('warn\n')
  })

  it('returns null on malformed json', () => {
    expect(parseEvent('not json')).toBeNull()
    expect(parseOutputLine('{')).toBeNull()
    expect(parseOutputLine('123')).toBeNull()
  })
})
