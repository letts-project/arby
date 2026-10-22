import { toast } from 'sonner'
import { Loader2, Pause, Play } from 'lucide-react'
import { useLaneActions } from '@/hooks/useLaneActions'
import { errorMessage } from '@/lib/api'
import { cn } from '@/lib/utils'

/** Pause/continue for one lane on one host. */
export function LaneToggle({ host, lane, paused }: { host: string; lane: string; paused: boolean }) {
  const { pause, cont } = useLaneActions()
  const pending = pause.isPending || cont.isPending
  const onClick = () => {
    const action = paused ? cont : pause
    action.mutate(
      { host, lane },
      {
        onSuccess: () => toast.success(paused ? `${host}/${lane} continues` : `${host}/${lane} paused`),
        onError: (e) => toast.error(`Couldn’t ${paused ? 'continue' : 'pause'} ${host}/${lane}`, { description: errorMessage(e) }),
      },
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-label={`${paused ? 'Continue' : 'Pause'} ${host}/${lane}`}
      className={cn(
        'inline-flex h-6 w-[84px] items-center justify-center gap-1 rounded-md border text-[12px] transition-colors disabled:opacity-60',
        paused
          ? 'border-foreground bg-foreground text-background hover:bg-foreground/85'
          : 'border-input text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {pending ? <Loader2 className="size-3 animate-spin" /> : paused ? <Play className="size-3" /> : <Pause className="size-3" />}
      {paused ? 'Continue' : 'Pause'}
    </button>
  )
}
