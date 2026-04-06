'use client'

import { useThemeContext } from '../theme-provider'
import { THEME_MODES } from '@/config/theme'
import { MoonIcon, SunIcon, ComputerDesktopIcon } from '@heroicons/react/24/outline'
import { useState, useRef, useEffect } from 'react'

export function ThemeToggleButton() {
  const { theme, setTheme } = useThemeContext()
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const getThemeIcon = () => {
    if (theme === THEME_MODES.LIGHT) {
      return <SunIcon className="h-4 w-4" />
    }
    if (theme === THEME_MODES.DARK) {
      return <MoonIcon className="h-4 w-4" />
    }
    return <ComputerDesktopIcon className="h-4 w-4" />
  }

  const handleButtonClick = () => {
    setIsDropdownOpen(!isDropdownOpen)
  }

  const handleDropdownItemClick = (newTheme: typeof THEME_MODES[keyof typeof THEME_MODES]) => {
    setTheme(newTheme)
    setIsDropdownOpen(false)
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isDropdownOpen])

  return (
    <div className="flex items-center">
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={handleButtonClick}
          className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
        >
          {getThemeIcon()}
        </button>
        {isDropdownOpen && (
          <div className="absolute right-0 mt-2 w-36 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50">
            <div className="py-1">
              <button
                onClick={() => handleDropdownItemClick(THEME_MODES.LIGHT)}
                className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${theme === THEME_MODES.LIGHT ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
              >
                <SunIcon className="h-4 w-4" />
                浅色
              </button>
              <button
                onClick={() => handleDropdownItemClick(THEME_MODES.DARK)}
                className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${theme === THEME_MODES.DARK ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
              >
                <MoonIcon className="h-4 w-4" />
                深色
              </button>
              <button
                onClick={() => handleDropdownItemClick(THEME_MODES.SYSTEM)}
                className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${theme === THEME_MODES.SYSTEM ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
              >
                <ComputerDesktopIcon className="h-4 w-4" />
                跟随系统
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
