/** fmtDuration renders a millisecond span compactly: 840ms, 4.2s, 3m 12s, 1h 4m. */
export function fmtDuration(ms?: number): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = ms / 1000
  if (s < 10) return `${s.toFixed(1)}s`
  if (s < 60) return `${Math.round(s)}s`
  const m = Math.floor(s / 60)
  const rs = Math.floor(s % 60)
  if (m < 60) return `${m}m ${rs}s`
  const h = Math.floor(m / 60)
  const rm = m % 60
  if (h < 24) return `${h}h ${rm}m`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

/** fmtTime renders an absolute local timestamp (epoch ms) as YYYY-MM-DD HH:MM:SS. */
export function fmtTime(ms?: number): string {
  if (!ms) return '—'
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** fmtAgo renders a coarse relative time: "now", "12s", "5m", "3h", "2d". */
export function fmtAgo(ms?: number): string {
  if (!ms) return '—'
  const d = Date.now() - ms
  if (d < 0) return 'now'
  const s = Math.floor(d / 1000)
  if (s < 5) return 'now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  return `${days}d ago`
}

/** fmtBytes renders a byte count: 0 B, 1.4 KiB, 12.0 MiB, 3.2 GiB. */
export function fmtBytes(n?: number): string {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  const units = ['KiB', 'MiB', 'GiB', 'TiB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(1)} ${units[i]}`
}

/** lineCount counts the text lines in output chunks (one chunk may hold
 *  several lines, and the last line may lack its newline). */
export function lineCount(chunks: { data: string }[]): number {
  let n = 0
  for (const c of chunks) for (const ch of c.data) if (ch === '\n') n++
  const last = chunks[chunks.length - 1]?.data
  return last && !last.endsWith('\n') ? n + 1 : n
}
