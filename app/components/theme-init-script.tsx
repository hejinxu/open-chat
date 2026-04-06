'use client'

import { useEffect } from 'react'
import {
  THEME_STORAGE_KEY,
  DEFAULT_THEME,
  isValidThemeMode,
  THEME_MODES,
} from '@/config/theme'

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

export function ThemeInitScript() {
  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY)
    let theme = DEFAULT_THEME

    if (savedTheme && isValidThemeMode(savedTheme)) {
      theme = savedTheme
    }

    let resolvedTheme: 'light' | 'dark'

    if (theme === THEME_MODES.SYSTEM) {
      resolvedTheme = getSystemTheme()
    } else {
      resolvedTheme = theme as 'light' | 'dark'
    }

    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(resolvedTheme)
  }, [])

  return null
}
