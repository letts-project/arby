import { useState } from 'react'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { applyTheme, storedPreference, type Theme } from '@/lib/theme'
import { cn } from '@/lib/utils'

const OPTIONS: { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

/** Theme switcher: light / dark / system, wired to the theme module
 *  (localStorage-backed; `system` follows the OS preference live). */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => storedPreference())
  const TriggerIcon = OPTIONS.find((o) => o.value === theme)?.icon ?? Sun

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Theme: ${theme}`}
        title={`Theme: ${theme}`}
        className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <TriggerIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[8rem]">
        {OPTIONS.map((o) => (
          <DropdownMenuItem
            key={o.value}
            onSelect={() => {
              applyTheme(o.value)
              setTheme(o.value)
            }}
            className="gap-2 text-[12px]"
          >
            <o.icon className="size-3.5" />
            {o.label}
            <Check className={cn('ml-auto size-3.5', theme === o.value ? 'opacity-100' : 'opacity-0')} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
