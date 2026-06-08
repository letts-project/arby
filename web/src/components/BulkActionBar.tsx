import { useState } from 'react'
import { toast } from 'sonner'
import { RotateCw, Trash2, X } from 'lucide-react'
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
import { HostChip } from '@/components/HostChip'
import { errorMessage } from '@/lib/api'
import type { BulkItem, BulkResult } from '@/lib/types'

/** Floating action bar shown when one or more missions are selected. Runs the
 *  bulk restart/delete endpoints and reports per-id results. */
export function BulkActionBar({ items, onClear }: { items: BulkItem[]; onClear: () => void }) {
  const { bulkRestart, bulkDelete } = useMissionActions()
  const [confirm, setConfirm] = useState<null | 'restart' | 'delete'>(null)
  const [force, setForce] = useState(false)
  const [results, setResults] = useState<BulkResult[] | null>(null)
  const n = items.length
  const pending = bulkRestart.isPending || bulkDelete.isPending

  const summarize = (r: BulkResult[]) => {
    const ok = r.filter((x) => x.ok).length
    const fail = r.length - ok
    if (fail === 0) toast.success(`${ok} succeeded`)
    else toast.warning(`${ok} succeeded · ${fail} failed`)
  }
  const onError = (e: unknown) => toast.error('Bulk action failed', { description: errorMessage(e) })

  // When everything succeeded a toast is enough — clear right away. Any
  // failure opens the per-id results dialog; the selection is cleared only
  // when that dialog closes (clearing earlier would unmount this component,
  // dialog included, before the user sees which ids failed).
  const report = (r: BulkResult[]) => {
    summarize(r)
    if (r.some((x) => !x.ok)) setResults(r)
    else onClear()
  }
  const closeResults = () => {
    setResults(null)
    onClear()
  }

  const run = () => {
    if (confirm === 'restart') {
      bulkRestart.mutate(items, {
        onSuccess: (r) => {
          setConfirm(null)
          report(r.results ?? [])
        },
        onError,
      })
    } else if (confirm === 'delete') {
      bulkDelete.mutate(
        { items, force },
        {
          onSuccess: (r) => {
            setConfirm(null)
            setForce(false)
            report(r.results ?? [])
          },
          onError,
        },
      )
    }
  }

  return (
    <div className="flex items-center gap-3 border-t bg-card px-4 py-2">
      <span className="text-[13px] font-medium">
        {n} selected
      </span>
      <div className="ml-2 flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setConfirm('restart')} disabled={pending}>
          <RotateCw className="size-3.5" />
          Restart
        </Button>
        <Button size="sm" variant="outline" onClick={() => setConfirm('delete')} disabled={pending}>
          <Trash2 className="size-3.5" />
          Delete
        </Button>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="ml-auto inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <X className="size-3.5" />
        Clear
      </button>

      <Dialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm === 'restart' ? 'Restart' : 'Delete'} {n} missions?</DialogTitle>
            <DialogDescription>
              {confirm === 'restart'
                ? 'Each selected mission is restarted as a new mission, grouped per host.'
                : 'Each selected mission and its artifacts are removed. This cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          {confirm === 'delete' && (
            <label className="flex items-center gap-2 text-[13px]">
              <Checkbox checked={force} onCheckedChange={(v) => setForce(v === true)} />
              Force (required for running missions)
            </label>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant={confirm === 'delete' ? 'destructive' : 'default'}
              size="sm"
              onClick={run}
              disabled={pending}
            >
              {confirm === 'restart' ? 'Restart all' : 'Delete all'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={results !== null} onOpenChange={(o) => !o && closeResults()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Results</DialogTitle>
          </DialogHeader>
          <div className="max-h-80 overflow-auto rounded-md border">
            {(results ?? []).map((r) => (
              <div
                key={`${r.host}/${r.id}`}
                className="flex items-center gap-2 border-b px-3 py-1.5 text-[12px] last:border-0"
              >
                <span
                  className={
                    'size-1.5 rounded-full ' + (r.ok ? 'bg-status-success' : 'bg-status-failed')
                  }
                />
                <HostChip host={r.host} />
                <span className="font-mono text-[11px] text-muted-foreground">{r.id.slice(0, 12)}…</span>
                <span className="ml-auto font-mono text-[11px]">
                  {r.ok ? r.mission_id?.slice(0, 12) ?? r.status ?? 'ok' : (r.error ?? 'failed')}
                </span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button size="sm" onClick={closeResults}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
