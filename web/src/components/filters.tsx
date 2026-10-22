import { useEffect, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** A compact "Label value ▾" select; the empty choice reads `anyLabel`. */
export function FilterSelect({
  label,
  value,
  options,
  onChange,
  anyLabel = 'any',
}: {
  label: string
  value?: string
  options: (string | { value: string; label: string })[]
  onChange: (v: string | undefined) => void
  anyLabel?: string
}) {
  const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
  return (
    <Select value={value ?? '__any'} onValueChange={(v) => onChange(v === '__any' ? undefined : v)}>
      <SelectTrigger
        size="sm"
        aria-label={label}
        className={cn('h-7 gap-1.5 rounded-md px-2 text-[13px] shadow-none', value && 'border-foreground/40')}
      >
        <span className="text-muted-foreground">{label}</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__any">{anyLabel}</SelectItem>
        {opts.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** A text filter that commits on Enter / blur (not every keystroke). */
export function TextFilter({
  value,
  placeholder,
  onCommit,
  width = 'w-[180px]',
}: {
  value?: string
  placeholder: string
  onCommit: (v: string | undefined) => void
  width?: string
}) {
  const [local, setLocal] = useState(value ?? '')
  useEffect(() => setLocal(value ?? ''), [value])
  const commit = () => {
    const v = local.trim()
    if (v !== (value ?? '')) onCommit(v === '' ? undefined : v)
  }
  return (
    <Input
      value={local}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') {
          setLocal('')
          onCommit(undefined)
        }
      }}
      className={cn('h-7', width, value && 'border-foreground/40')}
    />
  )
}

/** Classes for an underlined text tab (a router Link at the call site). */
export function tabClass(active: boolean): string {
  return cn(
    '-mb-px flex items-baseline gap-1.5 border-b-2 pb-2 transition-colors',
    active ? 'border-foreground font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
  )
}

export function TabCount({ n, tone }: { n?: number; tone?: string }) {
  if (!n) return null
  return <span className={cn('text-[12px]', tone ?? 'text-muted-foreground')}>{n}</span>
}
