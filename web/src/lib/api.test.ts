import { describe, it, expect, vi, afterEach } from 'vitest'
import { apiGet, apiMutate, ApiHttpError, buildQuery } from './api'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('buildQuery', () => {
  it('drops empty/undefined/null params', () => {
    expect(buildQuery({ status: 'running', lane: '', outcome: undefined, n: 0, ok: false })).toBe(
      '?status=running&n=0&ok=false',
    )
    expect(buildQuery()).toBe('')
  })
})

describe('api', () => {
  it('apiGet builds a query string and parses JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const out = await apiGet<{ items: unknown[] }>('/api/missions', { status: 'running', lane: '', limit: 50 })
    expect(out.items).toEqual([])
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('status=running')
    expect(url).toContain('limit=50')
    expect(url).not.toContain('lane=')
  })

  it('apiMutate attaches X-CSRF-Token from the arby_csrf cookie', async () => {
    document.cookie = 'arby_csrf=tok-123'
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    await apiMutate('POST', '/api/missions/s1/abc/kill', { signal: 'TERM' })
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('tok-123')
    expect(init.method).toBe('POST')
  })

  it('throws ApiHttpError carrying status and the parsed error body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'mission_running', message: 'still running' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    // apiGet once — a Response body is single-use, so don't re-await the mock.
    const err = await apiGet('/api/missions/s1/x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiHttpError)
    expect(err).toMatchObject({ status: 409, code: 'mission_running', message: 'still running' })
  })
})
