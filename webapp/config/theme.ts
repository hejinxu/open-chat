export type ThemeMode = 'light' | 'dark' | 'system' | 'tech-blue'

export const THEME_MODES: Record<string, ThemeMode> = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
  TECH_BLUE: 'tech-blue',
}

export const THEME_STORAGE_KEY = 'theme-mode'

export const DEFAULT_THEME: ThemeMode = (process.env.NEXT_PUBLIC_DEFAULT_THEME as ThemeMode) || THEME_MODES.LIGHT

export function isValidThemeMode(mode: string): mode is ThemeMode {
  return Object.values(THEME_MODES).includes(mode as ThemeMode)
}
