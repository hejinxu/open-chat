'use client'
import type { FC, ReactNode } from 'react'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'

export interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title?: string
  message?: string | ReactNode
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'default'
}

const ConfirmDialog: FC<ConfirmDialogProps> = ({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  cancelText,
  variant = 'default',
}) => {
  const { t } = useTranslation()

  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} className="relative z-[100]">
      <div className="fixed inset-0 bg-black/50 transition-opacity" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-sm bg-surface-elevated border border-border rounded-xl shadow-xl p-6">
          <DialogTitle className="text-lg font-semibold text-content mb-2">
            {title || t('common.operation.confirm')}
          </DialogTitle>
          {message && (
            <div className="text-sm text-content-secondary mb-6">
              {message}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg bg-surface text-content-secondary hover:bg-surface-hover transition-colors"
            >
              {cancelText || t('common.operation.cancel')}
            </button>
            <button
              onClick={handleConfirm}
              className={
                variant === 'danger'
                  ? 'px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors'
                  : 'px-4 py-2 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors'
              }
            >
              {confirmText || t('common.operation.confirm')}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}

export default React.memo(ConfirmDialog)
