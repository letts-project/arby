import type { MergedMission, BulkItem } from '@/lib/types'

/** Missions are identified by (host, mission_id) — selection keys must be too. */
export function selectionKey(m: Pick<MergedMission, 'host' | 'mission_id'>): string {
  return `${m.host}/${m.mission_id}`
}

/** Maps a selection set back to the {host,id}[] the bulk endpoints expect. */
export function toBulkItems(rows: MergedMission[], selected: Set<string>): BulkItem[] {
  return rows.filter((r) => selected.has(selectionKey(r))).map((r) => ({ host: r.host, id: r.mission_id }))
}
