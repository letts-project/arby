import type { ExecFilter } from '@/hooks/useExecs'

export interface ExecSearch {
  status?: string
  outcome?: string
  group_id?: string
  order?: 'created' | 'finished'
  host?: string
  cursor?: string
  limit?: number
}

const STATUS = new Set(['queued', 'running', 'done'])
const OUTCOME = new Set(['success', 'failed', 'killed', 'timeout', 'crashed', 'lost', 'oom'])

/** Validates the exec list URL search (drop empties, validate enums, clamp limit). */
export function normalizeExecSearch(raw: Record<string, unknown>): ExecSearch {
  const s: ExecSearch = {}
  const str = (k: string) => (typeof raw[k] === 'string' && raw[k] !== '' ? (raw[k] as string) : undefined)
  if (str('status') && STATUS.has(raw.status as string)) s.status = raw.status as string
  if (str('outcome') && OUTCOME.has(raw.outcome as string)) s.outcome = raw.outcome as string
  if (str('group_id')) s.group_id = raw.group_id as string
  if (raw.order === 'created' || raw.order === 'finished') s.order = raw.order
  if (str('host')) s.host = raw.host as string
  if (str('cursor')) s.cursor = raw.cursor as string
  const n = Number(raw.limit)
  if (Number.isFinite(n) && n > 0) s.limit = Math.min(200, Math.floor(n))
  return s
}

/** Maps the exec URL search to the /api/exec query. All fields — including
 *  `host`, which narrows the server-side fan-out — pass through. */
export function toExecFilter(s: ExecSearch): ExecFilter {
  return { ...s }
}
