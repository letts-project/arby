import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { applyTheme, currentTheme, type Theme } from '@/lib/theme'

/** A compact light/dark switch wired to the theme module (localStorage-backed). */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => currentTheme())
  const next: Theme = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      onClick={() => {
        applyTheme(next)
        setTheme(next)
      }}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  )
}
