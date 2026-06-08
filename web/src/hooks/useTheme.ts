import { useEffect, useState } from 'react'
import { currentTheme, type Theme } from '@/lib/theme'

/**
 * useThemeValue tracks the live theme by observing the <html> class, so
 * components (e.g. the toaster) stay in sync when the theme is toggled anywhere.
 */
export function useThemeValue(): Theme {
  const [theme, setTheme] = useState<Theme>(() => currentTheme())
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(currentTheme()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return theme
}
