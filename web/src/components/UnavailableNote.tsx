import { AlertTriangle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { UnavailableReasons } from '@/lib/types'

/** A one-line warning that a list is missing the dugdales that failed the
 *  fan-out; the per-host cause is in the tooltip. */
export function UnavailableNote({
  hosts,
  reasons,
  className,
}: {
  hosts?: string[]
  reasons?: UnavailableReasons
  className?: string
}) {
  if (!hosts || hosts.length === 0) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('inline-flex cursor-default items-center gap-1.5 text-status-warn', className)}>
          <AlertTriangle className="size-3.5 shrink-0" />
          Not including {hosts.join(', ')}: unreachable
        </span>
      </TooltipTrigger>
      <TooltipContent align="end" className="max-w-md">
        {hosts.map((h) => (
          <div key={h} className="break-all">
            <span className="font-medium">{h}</span>: {reasons?.[h] ?? 'not responding'}
          </div>
        ))}
      </TooltipContent>
    </Tooltip>
  )
}
