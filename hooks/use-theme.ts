'use client'

import { useEffect, useState } from 'react'
import type {
  ThemeMode,
} from '@/config/theme'
import {
  THEME_MODES,
  THEME_STORAGE_KEY,
  DEFAULT_THEME,
  isValidThemeMode,
} from '@/config/theme'

export interface UseThemeReturn {
  theme: ThemeMode
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

export function useTheme(): UseThemeReturn {
  const [theme, setThemeState] = useState<ThemeMode>(DEFAULT_THEME)
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      let initialTheme = DEFAULT_THEME
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY)
      if (savedTheme && isValidThemeMode(savedTheme)) {
        initialTheme = savedTheme
      }

      if (initialTheme === THEME_MODES.SYSTEM) {
        return getSystemTheme()
      }
      return initialTheme as 'light' | 'dark'
    }
    return DEFAULT_THEME === THEME_MODES.DARK ? 'dark' : 'light'
  })

  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY)

    // 优先使用 localStorage 中保存的用户选择
    // 如果没有保存，则使用 .env.local 中配置的默认主题
    if (savedTheme && isValidThemeMode(savedTheme)) {
      setThemeState(savedTheme)
    } else {
      setThemeState(DEFAULT_THEME)
    }
  }, [])

  useEffect(() => {
    const applyTheme = () => {
      let newResolvedTheme: 'light' | 'dark'

      if (theme === THEME_MODES.SYSTEM) {
        newResolvedTheme = getSystemTheme()
      } else {
        newResolvedTheme = theme as 'light' | 'dark'
      }

      setResolvedTheme(newResolvedTheme)

      const root = window.document.documentElement
      root.classList.remove('light', 'dark')
      root.classList.add(newResolvedTheme)
    }

    applyTheme()

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemThemeChange = () => {
      if (theme === THEME_MODES.SYSTEM) {
        applyTheme()
      }
    }

    mediaQuery.addEventListener('change', handleSystemThemeChange)
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange)
  }, [theme])

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme)
    localStorage.setItem(THEME_STORAGE_KEY, newTheme)
  }

  const toggleTheme = () => {
    const nextTheme = theme === THEME_MODES.LIGHT
      ? THEME_MODES.DARK
      : theme === THEME_MODES.DARK
        ? THEME_MODES.SYSTEM
        : THEME_MODES.LIGHT
    setTheme(nextTheme)
  }

  return {
    theme,
    resolvedTheme,
    setTheme,
    toggleTheme,
  }
}
