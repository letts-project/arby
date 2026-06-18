import { toast } from 'sonner'
import { Loader2, Pause, Play } from 'lucide-react'
import { useLaneActions } from '@/hooks/useLaneActions'
import { errorMessage } from '@/lib/api'

/** Pause/continue button for one lane on one host. Shared by the Lanes page and
 *  the per-dugdale page. */
export function LaneToggle({ host, lane, paused }: { host: string; lane: string; paused: boolean }) {
  const { pause, cont } = useLaneActions()
  const pending = pause.isPending || cont.isPending
  const onClick = () => {
    const action = paused ? cont : pause
    action.mutate(
      { host, lane },
      {
        onSuccess: () => toast.success(paused ? `Resumed ${lane}` : `Paused ${lane}`),
        onError: (e) => toast.error('Lane action failed', { description: errorMessage(e) }),
      },
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex h-7 w-[92px] items-center justify-center gap-1 rounded-md border px-2 text-[12px] transition-colors hover:bg-accent disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="size-3 animate-spin" />
      ) : paused ? (
        <Play className="size-3" />
      ) : (
        <Pause className="size-3" />
      )}
      {paused ? 'Continue' : 'Pause'}
    </button>
  )
}
