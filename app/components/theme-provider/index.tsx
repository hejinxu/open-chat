'use client'

import { createContext, useContext } from 'react'
import { useTheme, type UseThemeReturn } from '@/hooks/use-theme'

const ThemeContext = createContext<UseThemeReturn | undefined>(undefined)

interface ThemeProviderProps {
  children: React.ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const theme = useTheme()

  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useThemeContext(): UseThemeReturn {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useThemeContext must be used within a ThemeProvider')
  }
  return context
}
