import React, { useState, useEffect } from 'react'
import type { FC } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChatBubbleOvalLeftEllipsisIcon,
  PencilSquareIcon,
  EllipsisVerticalIcon,
  TrashIcon,
  Cog6ToothIcon,
  ArrowRightStartOnRectangleIcon,
} from '@heroicons/react/24/outline'
import { ChatBubbleOvalLeftEllipsisIcon as ChatBubbleOvalLeftEllipsisSolidIcon } from '@heroicons/react/24/solid'
import Button from '@/app/components/base/button'
import AppIcon from '@/app/components/base/app-icon'
import { ThemeToggleButton } from '@/app/components/theme-toggle-button'
import { BASE_PATH } from '@/config'
import type { ConversationItem } from '@/types/app'

function classNames(...classes: any[]) {
  return classes.filter(Boolean).join(' ')
}

const MAX_CONVERSATION_LENTH = 20

export interface ISidebarProps {
  copyRight: string
  currentId: string
  onCurrentIdChange: (id: string) => void
  list: ConversationItem[]
  isMobile?: boolean
  title?: string
  onDelete?: (id: string) => void
  user?: { name: string, role: string } | null
  isEmbed?: boolean
}

const Sidebar: FC<ISidebarProps> = ({
  copyRight,
  currentId,
  onCurrentIdChange,
  list,
  isMobile,
  title,
  onDelete,
  user,
  isEmbed,
}) => {
  const { t } = useTranslation()
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  useEffect(() => {
    if (openMenuId === null) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest(`[data-menu-id="${openMenuId}"]`))
        setOpenMenuId(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openMenuId])

  useEffect(() => {
    if (!userMenuOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-user-menu]'))
        setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [userMenuOpen])

  const handleLogout = async () => {
    setUserMenuOpen(false)
    await fetch(`${BASE_PATH}/api/auth/logout`, { method: 'POST' })
    window.location.href = `${BASE_PATH}/login`
  }

  const handleAdmin = () => {
    setUserMenuOpen(false)
    window.location.href = `${BASE_PATH}/admin`
  }

  return (
    <div
      className="shrink-0 flex flex-col overflow-y-auto bg-surface pc:w-[244px] tablet:w-[192px] mobile:w-[240px] border-r border-border-subtle h-screen"
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center space-x-2">
          <AppIcon size="small" />
          <div className="text-sm text-content font-bold">{title}</div>
        </div>
        <ThemeToggleButton />
      </div>

      {list.length < MAX_CONVERSATION_LENTH && (
        <div className="flex flex-shrink-0 p-4 !pb-0">
          <Button
            type="accent"
            onClick={() => { onCurrentIdChange('-1') }}
            className="group block w-full flex-shrink-0 !justify-start !h-9 text-content-accent items-center text-sm"
          >
            <PencilSquareIcon className="mr-2 h-4 w-4" /> {t('app.chat.newChat')}
          </Button>
        </div>
      )}

      <nav className="mt-4 flex-1 space-y-1 bg-surface p-4 !pt-0">
        {list.map((item) => {
          const isCurrent = item.id === currentId
          const ItemIcon
            = isCurrent ? ChatBubbleOvalLeftEllipsisSolidIcon : ChatBubbleOvalLeftEllipsisIcon
          const isMenuOpen = openMenuId === item.id
          return (
            <div
              key={item.id}
              className={classNames(
                isCurrent
                  ? 'bg-accent-bg text-content-accent'
                  : 'text-content-tertiary hover:bg-surface-hover hover:text-content-secondary',
                'group flex items-center rounded-md px-2 py-2 text-sm font-medium cursor-pointer relative',
              )}
            >
              <div
                onClick={() => onCurrentIdChange(item.id)}
                className="flex items-center min-w-0 flex-1"
              >
                <ItemIcon
                  className={classNames(
                    isCurrent
                      ? 'text-content-accent'
                      : 'text-content-quaternary group-hover:text-content-tertiary',
                    'mr-3 h-5 w-5 flex-shrink-0',
                  )}
                  aria-hidden="true"
                />
                <span className="truncate">{item.name}</span>
              </div>
              {onDelete && (
                <button
                  data-menu-id={item.id}
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => setOpenMenuId(isMenuOpen ? null : item.id)}
                  className={classNames(
                    isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                    'ml-1 p-1 rounded hover:bg-surface-hover flex-shrink-0 transition-opacity',
                  )}
                  title="更多操作"
                >
                  <EllipsisVerticalIcon className="h-4 w-4" />
                </button>
              )}
              {isMenuOpen && (
                <div data-menu-id={item.id} className="absolute right-0 top-full mt-1 w-32 bg-surface-elevated border border-border rounded-lg shadow-lg z-50 py-1">
                  <button
                    onClick={() => { onDelete(item.id); setOpenMenuId(null) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-red-500 hover:bg-surface-danger-hover transition-colors"
                  >
                    <TrashIcon className="h-4 w-4" />
                    <span>删除</span>
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Footer: User menu or copyright */}
      <div className="flex flex-shrink-0 pr-4 pb-4 pl-4">
        {user && !isEmbed
          ? (
            <div className="relative" data-user-menu>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-surface-hover transition-colors text-left"
              >
                <div className="w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center text-xs font-medium flex-shrink-0">
                  {user.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <span className="text-sm text-content truncate">{user.name}</span>
              </button>
              {userMenuOpen && (
                <div className="absolute bottom-full left-0 mb-1 w-40 bg-surface-elevated border border-border rounded-lg shadow-lg z-50 py-1">
                  {user.role === 'admin' && !isEmbed && (
                    <button
                      onClick={handleAdmin}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-content hover:bg-surface-hover transition-colors"
                    >
                      <Cog6ToothIcon className="h-4 w-4" />
                      <span>{t('common.auth.admin')}</span>
                    </button>
                  )}
                  {user.role === 'admin' && !isEmbed && <div className="my-1 border-t border-border" />}
                  {!isEmbed && (
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-content hover:bg-surface-danger-hover transition-colors"
                    >
                      <ArrowRightStartOnRectangleIcon className="h-4 w-4" />
                      <span>{t('common.auth.logout')}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
            )
          : (
            <div className="text-content-quaternary font-normal text-xs">
              © {copyRight} {(new Date()).getFullYear()}
            </div>
            )}
      </div>
    </div>
  )
}

export default React.memo(Sidebar)
