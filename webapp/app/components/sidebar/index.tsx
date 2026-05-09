import React, { useState, useEffect } from 'react'
import type { FC } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChatBubbleOvalLeftEllipsisIcon,
  PencilSquareIcon,
  EllipsisVerticalIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { ChatBubbleOvalLeftEllipsisIcon as ChatBubbleOvalLeftEllipsisSolidIcon } from '@heroicons/react/24/solid'
import Button from '@/app/components/base/button'
import AppIcon from '@/app/components/base/app-icon'
import { ThemeToggleButton } from '@/app/components/theme-toggle-button'
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
}

const Sidebar: FC<ISidebarProps> = ({
  copyRight,
  currentId,
  onCurrentIdChange,
  list,
  isMobile,
  title,
  onDelete,
}) => {
  const { t } = useTranslation()
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

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
                  onMouseDown={(e) => e.stopPropagation()}
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
      {/* <a className="flex flex-shrink-0 p-4" href="https://langgenius.ai/" target="_blank">
        <Card><div className="flex flex-row items-center"><ChatBubbleOvalLeftEllipsisSolidIcon className="text-primary-600 h-6 w-6 mr-2" /><span>LangGenius</span></div></Card>
      </a> */}
      <div className="flex flex-shrink-0 pr-4 pb-4 pl-4">
        <div className="text-content-quaternary font-normal text-xs">© {copyRight} {(new Date()).getFullYear()}</div>
      </div>
    </div>
  )
}

export default React.memo(Sidebar)
