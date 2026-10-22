import { useState } from 'react'
import { cn } from '@/lib/utils'

type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

const INLINE_ITEMS = 24
const OPEN_DEPTH = 2
const OPEN_SIZE = 8

function isScalar(v: Json): v is null | boolean | number | string {
  return v === null || typeof v !== 'object'
}

function Scalar({ v }: { v: null | boolean | number | string }) {
  return <span>{JSON.stringify(v)}</span>
}

const toggle = 'cursor-pointer rounded-sm px-0.5 text-muted-foreground hover:bg-accent hover:text-foreground'

/** An array of scalars on wrapping lines, cut after INLINE_ITEMS. */
function InlineArray({ items }: { items: (null | boolean | number | string)[] }) {
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, INLINE_ITEMS)
  return (
    <span>
      [
      {shown.map((v, i) => (
        <span key={i}>
          <Scalar v={v} />
          {i < shown.length - 1 && ', '}
        </span>
      ))}
      {!all && items.length > INLINE_ITEMS && (
        <button type="button" onClick={() => setAll(true)} className={toggle}>
          … +{items.length - INLINE_ITEMS}
        </button>
      )}
      ]
    </span>
  )
}

function Node({ v, depth }: { v: Json; depth: number }) {
  if (isScalar(v)) return <Scalar v={v} />
  if (Array.isArray(v) && v.every(isScalar)) return <InlineArray items={v as (null | boolean | number | string)[]} />
  return <Block v={v} depth={depth} />
}

/** An object, or an array holding objects: one entry per line, folded when
 *  deep and large. */
function Block({ v, depth }: { v: Json[] | { [k: string]: Json }; depth: number }) {
  const entries: [string | null, Json][] = Array.isArray(v) ? v.map((x) => [null, x]) : Object.entries(v)
  const [open, setOpen] = useState(depth < OPEN_DEPTH || entries.length <= OPEN_SIZE)
  const [l, r] = Array.isArray(v) ? ['[', ']'] : ['{', '}']
  if (entries.length === 0) return <span>{l + r}</span>
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={toggle}>
        {l}… {entries.length} {Array.isArray(v) ? 'items' : 'keys'}
        {r}
      </button>
    )
  }
  return (
    <>
      {l}
      <div className="pl-4">
        {entries.map(([k, x], i) => (
          <div key={k ?? i}>
            {k !== null && <span className="text-muted-foreground">{JSON.stringify(k)}: </span>}
            <Node v={x} depth={depth + 1} />
            {i < entries.length - 1 && ','}
          </div>
        ))}
      </div>
      {r}
    </>
  )
}

/** JSON (input/return) laid out compactly: scalar arrays inline, long arrays
 *  cut, deep large objects folded; everything expands on click. */
export function JsonTree({ json, className }: { json: unknown; className?: string }) {
  return (
    <div className={cn('font-mono text-[12.5px] leading-[1.6] break-words whitespace-pre-wrap', className)}>
      <Node v={json as Json} depth={0} />
    </div>
  )
}
