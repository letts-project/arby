import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Copy, MoreHorizontal, RotateCw, OctagonX, Trash2 } from 'lucide-react'
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
import { acquireInteractionLock } from '@/lib/interactionLock'
import { errorMessage } from '@/lib/api'
import { inputSummary, missionTitle } from '@/lib/missionView'
import { Where } from './Where'
import { Tip } from './Tip'
import { cn } from '@/lib/utils'
import type { Mission } from '@/lib/types'

type Target = { host: string; mission_id: string } & Pick<
  Mission,
  'status' | 'kind' | 'mission_name' | 'display_name' | 'lane' | 'input'
>

/** The mission a confirm dialog acts on. */
function Subject({ m }: { m: Target }) {
  const input = inputSummary(m.input)
  return (
    <div className="rounded-md bg-muted px-3 py-2">
      <div>
        <Where host={m.host} lane={m.lane} className="font-medium" />
        <span className="ml-3 font-mono text-[12px] text-muted-foreground">{m.mission_id}</span>
      </div>
      {input && <div className="mt-0.5 truncate font-mono text-[12px] text-muted-foreground">{input}</div>}
    </div>
  )
}

const iconBtn =
  'inline-grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground'

/**
 * Restart / Kill / Delete for one mission, each behind a confirm dialog.
 * `row` renders icon buttons and a menu for a table row; `page` renders
 * labelled buttons for the detail header.
 */
export function MissionRowActions({
  mission,
  onRestarted,
  layout = 'row',
}: {
  mission: Target
  onRestarted?: (newId: string) => void
  layout?: 'row' | 'page'
}) {
  const navigate = useNavigate()
  const { restart, kill, del } = useMissionActions()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirm, setConfirm] = useState<null | 'restart' | 'kill' | 'delete'>(null)
  const [force, setForce] = useState(false)

  const overlayOpen = menuOpen || confirm !== null
  useEffect(() => {
    if (!overlayOpen) return
    return acquireInteractionLock()
  }, [overlayOpen])

  const running = mission.status === 'running'
  const done = mission.status === 'done'
  const id = { host: mission.host, id: mission.mission_id }
  const name = missionTitle(mission)
  const detailRoute = mission.kind === 'exec' ? '/exec/$host/$id' : '/missions/$host/$id'
  const close = () => {
    setConfirm(null)
    setForce(false)
  }

  const doRestart = () =>
    restart.mutate(id, {
      onSuccess: (r) => {
        close()
        if (onRestarted) {
          toast.success(`Restarted ${name}`)
          onRestarted(r.mission_id)
          return
        }
        toast.success(`Restarted ${name}`, {
          action: {
            label: 'Open',
            onClick: () => void navigate({ to: detailRoute, params: { host: mission.host, id: r.mission_id } }),
          },
        })
      },
      onError: (e) => toast.error('Restart failed', { description: errorMessage(e) }),
    })

  const doKill = () =>
    kill.mutate(
      { ...id, signal: force ? 'KILL' : 'TERM' },
      {
        onSuccess: () => {
          close()
          toast.success(`Sent ${force ? 'KILL' : 'TERM'} to ${name}`)
        },
        onError: (e) => toast.error('Kill failed', { description: errorMessage(e) }),
      },
    )

  const doDelete = () =>
    del.mutate(
      { ...id, force },
      {
        onSuccess: () => {
          close()
          toast.success(`Deleted ${name}`)
        },
        onError: (e) => toast.error('Delete failed', { description: errorMessage(e) }),
      },
    )

  const copyId = () => {
    void navigator.clipboard?.writeText(mission.mission_id)
    toast.success('Mission id copied')
  }

  const buttons =
    layout === 'page' ? (
      <div className="flex items-center gap-2">
        {done && (
          <Button size="sm" onClick={() => setConfirm('restart')}>
            <RotateCw className="size-3.5" />
            Restart
          </Button>
        )}
        {running && (
          <Button size="sm" variant="outline" onClick={() => setConfirm('kill')}>
            <OctagonX className="size-3.5" />
            Kill
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setConfirm('delete')}>
          <Trash2 className="size-3.5" />
          Delete
        </Button>
      </div>
    ) : (
      <div className="flex items-center justify-end gap-0.5">
        {done && (
          <Tip label="Restart">
            <button
              type="button"
              aria-label="Restart mission"
              onClick={() => setConfirm('restart')}
              className={cn(iconBtn, 'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100')}
            >
              <RotateCw className="size-3.5" />
            </button>
          </Tip>
        )}
        {running && (
          <Tip label="Kill">
            <button
              type="button"
              aria-label="Kill mission"
              onClick={() => setConfirm('kill')}
              className={cn(iconBtn, 'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100')}
            >
              <OctagonX className="size-3.5" />
            </button>
          </Tip>
        )}
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <Tip label="More actions">
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Mission actions" className={iconBtn}>
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
          </Tip>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={copyId}>
              <Copy className="size-3.5" />
              Copy id
            </DropdownMenuItem>
            {done && (
              <DropdownMenuItem onSelect={() => setConfirm('restart')}>
                <RotateCw className="size-3.5" />
                Restart
              </DropdownMenuItem>
            )}
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
      </div>
    )

  return (
    <div onClick={(e) => e.stopPropagation()}>
      {buttons}

      <Dialog open={confirm === 'restart'} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restart {name}?</DialogTitle>
            <DialogDescription>
              Runs it again with the same input, as a new mission. This record stays as it is.
            </DialogDescription>
          </DialogHeader>
          <Subject m={mission} />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={close}>
              Cancel
            </Button>
            <Button size="sm" onClick={doRestart} disabled={restart.isPending} autoFocus>
              Restart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirm === 'kill'} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kill {name}?</DialogTitle>
            <DialogDescription>
              Sends TERM to the process; the mission may still clean up before it exits.
            </DialogDescription>
          </DialogHeader>
          <Subject m={mission} />
          <label className="flex items-center gap-2">
            <Checkbox checked={force} onCheckedChange={(v) => setForce(v === true)} />
            Send KILL instead (no cleanup)
          </label>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={close}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={doKill} disabled={kill.isPending} autoFocus>
              Kill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirm === 'delete'} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>
              {mission.status === 'queued'
                ? 'It has not started yet; deleting takes it off the queue.'
                : 'Removes the record, its output and files. This cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          <Subject m={mission} />
          {running && (
            <label className="flex items-center gap-2">
              <Checkbox checked={force} onCheckedChange={(v) => setForce(v === true)} />
              It is still running: kill it first, then delete
            </label>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={close}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={doDelete} disabled={del.isPending || (running && !force)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
