import { Link } from '@tanstack/react-router'
import { useDugdales } from '@/hooks/useDugdales'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** Cluster pulse for the top bar: running/queued totals (links into the
 *  filtered list) and which dugdales are unreachable. */
export function ClusterHealth() {
  const { data } = useDugdales()
  if (!data) return null
  const managed = data.hosts.filter((h) => h.managed)
  const down = data.hosts.filter((h) => !h.online)
  const running = managed.reduce((n, h) => n + (h.online ? h.queue_summary.running : 0), 0)
  const queued = managed.reduce((n, h) => n + (h.online ? h.queue_summary.queued : 0), 0)
  const reasons = data.unavailable_reasons ?? {}

  return (
    <div className="flex items-center gap-4 whitespace-nowrap">
      <Link to="/missions" search={{ state: 'running' }} className="hidden hover:underline lg:inline">
        <span className="font-medium text-status-running">{running}</span>{' '}
        <span className="text-muted-foreground">running</span>
      </Link>
      <Link to="/missions" search={{ state: 'queued' }} className="hidden hover:underline lg:inline">
        <span className="font-medium">{queued}</span> <span className="text-muted-foreground">queued</span>
      </Link>
      {down.length === 0 ? (
        <Link to="/dugdales" className="hidden text-muted-foreground hover:text-foreground md:inline">
          {data.hosts.length} dugdales up
        </Link>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Link to="/dugdales" className="font-medium text-status-failed hover:underline">
              {down.map((h) => h.id).join(', ')} unreachable
            </Link>
          </TooltipTrigger>
          <TooltipContent align="end" className="max-w-md">
            {down.map((h) => (
              <div key={h.id}>
                <span className="font-medium">{h.id}</span>: {reasons[h.id] ?? 'not responding'}
              </div>
            ))}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
