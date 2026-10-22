import { Check, Circle, Clock, LoaderCircle, OctagonX, Trash2, X, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tip } from './Tip'
import type { Mission } from '@/lib/types'

interface Tone {
  label: string
  icon: LucideIcon
  tone: string
  spin?: boolean
}

/** toneFor maps a mission's status/outcome to a label, glyph and colour. */
function toneFor(m: Pick<Mission, 'status' | 'outcome'>): Tone {
  if (m.status === 'running') return { label: 'running', icon: LoaderCircle, tone: 'text-status-running', spin: true }
  if (m.status === 'queued') return { label: 'queued', icon: Circle, tone: 'text-status-queued' }
  if (m.status === 'deleting') return { label: 'deleting', icon: Trash2, tone: 'text-status-warn' }
  const o = m.outcome ?? 'done'
  if (o === 'success') return { label: 'success', icon: Check, tone: 'text-status-success' }
  if (o === 'killed') return { label: 'killed', icon: OctagonX, tone: 'text-status-warn' }
  if (o === 'timeout') return { label: 'timeout', icon: Clock, tone: 'text-status-warn' }
  if (o === 'crashed' || o === 'oom' || o === 'lost') return { label: o, icon: Zap, tone: 'text-status-failed' }
  return { label: o, icon: X, tone: 'text-status-failed' }
}

/** Mission state as a coloured glyph and word; `iconOnly` keeps the word for
 *  screen readers and the tooltip. */
export function StatusBadge({
  mission,
  className,
  iconOnly,
}: {
  mission: Pick<Mission, 'status' | 'outcome'>
  className?: string
  iconOnly?: boolean
}) {
  const { label, icon: Icon, tone, spin } = toneFor(mission)
  const badge = (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap font-medium', tone, className)}>
      <Icon className={cn('size-3.5 shrink-0', spin && 'animate-spin [animation-duration:2s]')} strokeWidth={2.5} aria-hidden />
      {iconOnly ? <span className="sr-only">{label}</span> : label}
    </span>
  )
  return iconOnly ? <Tip label={label}>{badge}</Tip> : badge
}
