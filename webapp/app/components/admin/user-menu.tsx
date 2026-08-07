'use client'
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react'
import { ChevronDownIcon } from '@heroicons/react/24/outline'
import { BASE_PATH } from '@/config'

interface UserMenuProps {
  user: { id: string, name: string, role: string }
}

export default function UserMenu({ user }: UserMenuProps) {
  const handleLogout = async () => {
    try {
      await fetch(`${BASE_PATH}/api/auth/logout`, { method: 'POST' })
    }
    catch {
      // ignore
    }
    window.location.href = `${BASE_PATH}/login`
  }

  const initial = user.name?.charAt(0)?.toUpperCase() || 'U'

  return (
    <Menu as="div" className="relative">
      <MenuButton className="flex items-center gap-1.5 px-2 py-1 rounded-md text-sm text-content-secondary hover:text-content hover:bg-surface-hover transition-colors">
        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-accent text-white text-xs font-medium">
          {initial}
        </span>
        <ChevronDownIcon className="w-3.5 h-3.5" />
      </MenuButton>
      <MenuItems className="absolute right-0 mt-1 w-48 origin-top-right rounded-md bg-surface-elevated border border-border shadow-lg focus:outline-none z-50">
        <div className="px-3 py-2 border-b border-border">
          <div className="text-sm font-medium text-content">{user.name}</div>
          <div className="text-xs text-content-tertiary">{user.role === 'admin' ? '管理员' : '用户'}</div>
        </div>
        <MenuItem>
          {({ focus }) => (
            <button
              onClick={handleLogout}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                focus ? 'bg-surface-hover text-content' : 'text-content-secondary'
              }`}
            >
              退出系统
            </button>
          )}
        </MenuItem>
      </MenuItems>
    </Menu>
  )
}
