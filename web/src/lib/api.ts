import { csrfToken } from './csrf'
import type { ApiError } from './types'

/** ApiHttpError carries the upstream status and the parsed {error,message,details}. */
export class ApiHttpError extends Error {
  status: number
  code: string
  details?: unknown
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiHttpError'
    this.status = status
    this.code = code
    this.details = details
  }
}

/** errorMessage extracts a human string from an ApiHttpError / Error / unknown. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiHttpError) return e.message
  if (e instanceof Error) return e.message
  return String(e)
}

export type QueryParams = Record<string, string | number | boolean | undefined | null>

/** buildQuery serializes params, skipping empty/undefined/null values. */
export function buildQuery(params?: QueryParams): string {
  if (!params) return ''
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    usp.set(k, String(v))
  }
  const s = usp.toString()
  return s ? `?${s}` : ''
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text()
  const body = text ? JSON.parse(text) : undefined
  if (!res.ok) {
    const e = (body ?? {}) as ApiError
    throw new ApiHttpError(res.status, e.error ?? 'error', e.message ?? res.statusText, e.details)
  }
  return body as T
}

/** apiGet performs a JSON GET against /api, throwing ApiHttpError on non-2xx. */
export async function apiGet<T>(path: string, params?: QueryParams): Promise<T> {
  const res = await fetch(path + buildQuery(params), { headers: { Accept: 'application/json' } })
  return parse<T>(res)
}

/** apiMutate performs a CSRF-guarded POST/DELETE, attaching X-CSRF-Token. */
export async function apiMutate<T = unknown>(
  method: 'POST' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { 'X-CSRF-Token': csrfToken() }
  let payload: string | undefined
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const res = await fetch(path, { method, headers, body: payload })
  return parse<T>(res)
}
