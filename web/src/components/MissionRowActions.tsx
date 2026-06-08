import { useState } from 'react'
import { MoreHorizontal, RotateCw, Trash2, OctagonX } from 'lucide-react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useMissionActions } from '@/hooks/useMissionActions'
import { errorMessage } from '@/lib/api'
import type { Mission } from '@/lib/types'

interface Target {
  host: string
  mission_id: string
}

/**
 * Per-mission action menu: Restart, Kill and Delete each go through a confirm
 * dialog (Delete offers a force toggle). Toasts report the outcome. Used by the
 * missions table rows and the detail page.
 */
export function MissionRowActions({
  mission,
  onRestarted,
  align = 'end',
}: {
  mission: Target & Pick<Mission, 'status'>
  onRestarted?: (newId: string) => void
  align?: 'start' | 'end'
}) {
  const { restart, kill, del } = useMissionActions()
  const [confirm, setConfirm] = useState<null | 'restart' | 'kill' | 'delete'>(null)
  const [force, setForce] = useState(false)
  const t: Target = { host: mission.host, mission_id: mission.mission_id }
  const running = mission.status === 'running'
  const id = { host: t.host, id: t.mission_id }

  const doRestart = () =>
    restart.mutate(id, {
      onSuccess: (r) => {
        toast.success('Mission restarted', { description: `→ ${r.mission_id}` })
        setConfirm(null)
        onRestarted?.(r.mission_id)
      },
      onError: (e) => toast.error('Restart failed', { description: errorMessage(e) }),
    })

  const doKill = () =>
    kill.mutate(id, {
      onSuccess: () => {
        toast.success('Kill signal sent')
        setConfirm(null)
      },
      onError: (e) => toast.error('Kill failed', { description: errorMessage(e) }),
    })

  const doDelete = () =>
    del.mutate(
      { ...id, force },
      {
        onSuccess: () => {
          toast.success('Deletion requested')
          setConfirm(null)
          setForce(false)
        },
        onError: (e) => toast.error('Delete failed', { description: errorMessage(e) }),
      },
    )

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Mission actions"
            className="inline-grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-40">
          <DropdownMenuItem onSelect={() => setConfirm('restart')}>
            <RotateCw className="size-3.5" />
            Restart
          </DropdownMenuItem>
          {running && (
            <DropdownMenuItem onSelect={() => setConfirm('kill')}>
              <OctagonX className="size-3.5" />
              Kill
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm('delete')}>
            <Trash2 className="size-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirm === 'restart'} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restart mission?</DialogTitle>
            <DialogDescription>
              Queues a fresh run of this mission on <span className="font-mono">{t.host}</span> as a new
              mission; the original record is kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={doRestart} disabled={restart.isPending}>
              Restart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirm === 'kill'} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kill mission?</DialogTitle>
            <DialogDescription>
              Sends an advisory TERM signal to the running mission on{' '}
              <span className="font-mono">{t.host}</span>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={doKill} disabled={kill.isPending}>
              Send signal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirm === 'delete'} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete mission?</DialogTitle>
            <DialogDescription>
              Removes the mission and its artifacts on <span className="font-mono">{t.host}</span>. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-center gap-2 text-[13px]">
            <Checkbox checked={force} onCheckedChange={(v) => setForce(v === true)} />
            Force (required to delete a running mission)
          </label>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={doDelete} disabled={del.isPending}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
