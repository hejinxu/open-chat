'use client'

import { useState } from 'react'
import { Cog6ToothIcon } from '@heroicons/react/24/outline'

interface VoiceSettingsProps {
  autoStopOnTimeout: boolean
  onAutoStopChange: (val: boolean) => void
  autoSendOnTimeout: boolean
  onAutoSendChange: (val: boolean) => void
  autoReadAloud: boolean
  onAutoReadAloudChange: (val: boolean) => void
  timeoutMs: number
  onTimeoutChange: (val: number) => void
}

export function VoiceSettings({
  autoStopOnTimeout,
  onAutoStopChange,
  autoSendOnTimeout,
  onAutoSendChange,
  autoReadAloud,
  onAutoReadAloudChange,
  timeoutMs,
  onTimeoutChange,
}: VoiceSettingsProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center w-8 h-8 rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        title="语音设置"
      >
        <Cog6ToothIcon className="w-5 h-5" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute bottom-full right-0 mb-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 p-3">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">语音设置</div>

            <div className="space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-gray-700 dark:text-gray-300">超时自动结束</span>
                <input
                  type="checkbox"
                  checked={autoStopOnTimeout}
                  onChange={e => onAutoStopChange(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-gray-700 dark:text-gray-300">超时自动发送</span>
                <input
                  type="checkbox"
                  checked={autoSendOnTimeout}
                  onChange={e => onAutoSendChange(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-gray-700 dark:text-gray-300">自动朗读回复</span>
                <input
                  type="checkbox"
                  checked={autoReadAloud}
                  onChange={e => onAutoReadAloudChange(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </label>

              <label className="flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-gray-300">超时时间(秒)</span>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={timeoutMs / 1000}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10)
                    if (val >= 1 && val <= 30) {
                      onTimeoutChange(val * 1000)
                    }
                  }}
                  className="w-16 text-right text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </label>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
