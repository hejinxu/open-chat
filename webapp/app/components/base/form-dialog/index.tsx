'use client'
import type { FC, ReactNode } from 'react'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'

export interface FormDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  children: ReactNode
  confirmText?: string
  cancelText?: string
  loading?: boolean
}

const FormDialog: FC<FormDialogProps> = ({
  open,
  onClose,
  onConfirm,
  title,
  children,
  confirmText,
  cancelText,
  loading = false,
}) => {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onClose={onClose} className="relative z-[100]">
      <div className="fixed inset-0 bg-black/50 transition-opacity" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-md bg-surface-elevated border border-border rounded-xl shadow-xl p-6">
          <DialogTitle className="text-lg font-semibold text-content mb-4">
            {title}
          </DialogTitle>
          <div className="mb-6">
            {children}
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm rounded-lg bg-surface text-content-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
            >
              {cancelText || t('common.operation.cancel')}
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="px-4 py-2 text-sm rounded-lg bg-accent text-white hover:opacity-90 transition-colors disabled:opacity-50"
            >
              {loading ? '...' : (confirmText || t('common.operation.confirm'))}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}

export default React.memo(FormDialog)
