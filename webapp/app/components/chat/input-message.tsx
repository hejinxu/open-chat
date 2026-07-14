'use client'

import { ExclamationCircleIcon, InformationCircleIcon, XMarkIcon } from '@heroicons/react/20/solid'

export interface InputMessageType {
  type: 'error' | 'info' | 'loading'
  message: string
  closable?: boolean
}

interface InputMessageProps extends InputMessageType {
  onClose?: () => void
}

export function InputMessage({ type, message, closable = true, onClose }: InputMessageProps) {
  const bgColor = type === 'error' ? 'bg-danger-bg' : 'bg-accent-bg'
  const textColor = type === 'error' ? 'text-danger-text' : 'text-content-accent'
  const iconColor = type === 'error' ? 'text-danger-icon' : 'text-accent'

  return (
    <div className={`flex items-center justify-between px-3 py-2 mb-2 rounded-lg ${bgColor}`}>
      <div className="flex items-center gap-2">
        {type === 'error' && <ExclamationCircleIcon className={`w-4 h-4 ${iconColor}`} />}
        {type === 'info' && <InformationCircleIcon className={`w-4 h-4 ${iconColor}`} />}
        {type === 'loading' && (
          <svg className={`animate-spin w-4 h-4 ${iconColor}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        )}
        <span className={`text-sm ${textColor}`}>{message}</span>
      </div>
      {closable && onClose && (
        <button
          type="button"
          onClick={onClose}
          className={`ml-2 p-0.5 rounded hover:bg-surface-hover transition-colors ${textColor}`}
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
