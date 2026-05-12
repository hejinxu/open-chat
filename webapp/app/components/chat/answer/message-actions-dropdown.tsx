'use client'
import type { FC } from 'react'
import React, { useEffect, useState } from 'react'
import { EllipsisHorizontalIcon, TrashIcon } from '@heroicons/react/24/outline'

interface MessageActionsDropdownProps {
  messageId: string
  onDelete: (messageId: string) => void
  isLastMessage?: boolean
}

const MessageActionsDropdown: FC<MessageActionsDropdownProps> = ({
  messageId,
  onDelete,
  isLastMessage = false,
}) => {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest(`[data-menu-id="action-${messageId}"]`)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, messageId])

  const handleDelete = () => {
    setOpen(false)
    onDelete(messageId)
  }

  return (
    <div className="relative inline-flex">
      <button
        data-menu-id={`action-${messageId}`}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => setOpen(!open)}
        className="relative box-border flex items-center justify-center h-7 w-7 p-0.5 rounded-lg bg-surface cursor-pointer text-content-tertiary hover:bg-surface-hover hover:text-content"
        style={{ boxShadow: '0px 4px 6px -1px rgba(0, 0, 0, 0.1), 0px 2px 4px -2px rgba(0, 0, 0, 0.05)' }}
        title="更多操作"
      >
        <EllipsisHorizontalIcon className="w-4 h-4" />
      </button>
      {open && (
        <div
          data-menu-id={`action-${messageId}`}
          className={`absolute w-28 bg-surface-elevated border border-border rounded-lg shadow-lg z-50 py-1 ${isLastMessage ? 'left-0 bottom-full mb-1' : 'left-0 top-full mt-1'}`}
        >
          <button
            onClick={handleDelete}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-red-500 hover:bg-surface-danger-hover transition-colors"
          >
            <TrashIcon className="h-4 w-4" />
            <span>删除</span>
          </button>
        </div>
      )}
    </div>
  )
}

export default React.memo(MessageActionsDropdown)
