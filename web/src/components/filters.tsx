import { useEffect, useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'

/** A compact "label: all | <option>" select used across filter bars. */
export function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value?: string
  options: string[]
  onChange: (v: string | undefined) => void
}) {
  return (
    <Select value={value ?? 'all'} onValueChange={(v) => onChange(v === 'all' ? undefined : v)}>
      <SelectTrigger size="sm" className="h-7 min-w-[112px] text-[12px]">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{label}: all</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
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
  width = 'w-[150px]',
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
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
      }}
      className={`h-7 ${width} text-[12px]`}
    />
  )
}
