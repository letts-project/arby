import { describe, it, expect, beforeEach } from 'vitest'
import { resolveInitialTheme, applyTheme, currentTheme } from './theme'

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
  })

  it('prefers localStorage over the ?theme query and default', () => {
    localStorage.setItem('arby-theme', 'dark')
    expect(resolveInitialTheme('?theme=light', 'light')).toBe('dark')
  })

  it('falls back to ?theme then to the configured default', () => {
    expect(resolveInitialTheme('?theme=dark', 'light')).toBe('dark')
    expect(resolveInitialTheme('', 'light')).toBe('light')
    expect(resolveInitialTheme('', 'dark')).toBe('dark')
  })

  it('applyTheme toggles the .dark class and persists', () => {
    applyTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('arby-theme')).toBe('dark')
    expect(currentTheme()).toBe('dark')
    applyTheme('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(currentTheme()).toBe('light')
  })
})
