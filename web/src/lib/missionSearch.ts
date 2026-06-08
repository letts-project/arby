import type { MissionsFilter } from '@/hooks/useMissions'

export interface MissionSearch {
  status?: string
  outcome?: string
  lane?: string
  mission?: string
  order?: 'created' | 'finished'
  host?: string
  cursor?: string
  limit?: number
}

const STATUS = new Set(['queued', 'running', 'done'])
const OUTCOME = new Set(['success', 'failed', 'killed', 'timeout', 'crashed', 'lost', 'oom'])

/**
 * normalizeSearch validates the URL search-params for the missions list: it
 * drops empty/unknown keys, validates the status/outcome/order enums, and clamps
 * the limit to a sane max. Used as the route's `validateSearch`.
 */
export function normalizeSearch(raw: Record<string, unknown>): MissionSearch {
  const s: MissionSearch = {}
  const str = (k: string) => (typeof raw[k] === 'string' && raw[k] !== '' ? (raw[k] as string) : undefined)
  if (str('status') && STATUS.has(raw.status as string)) s.status = raw.status as string
  if (str('outcome') && OUTCOME.has(raw.outcome as string)) s.outcome = raw.outcome as string
  if (str('lane')) s.lane = raw.lane as string
  if (str('mission')) s.mission = raw.mission as string
  if (raw.order === 'created' || raw.order === 'finished') s.order = raw.order
  if (str('host')) s.host = raw.host as string
  if (str('cursor')) s.cursor = raw.cursor as string
  const n = Number(raw.limit)
  if (Number.isFinite(n) && n > 0) s.limit = Math.min(200, Math.floor(n))
  return s
}

/**
 * toFilter maps the URL search to the /api/missions query. All fields —
 * including `host`, which narrows the server-side fan-out — pass through, so
 * pagination and counts stay correct under every filter.
 */
export function toFilter(s: MissionSearch): MissionsFilter {
  return { ...s }
}
