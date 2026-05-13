'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Cog6ToothIcon } from '@heroicons/react/24/outline'
import type { VoiceRecognitionEngine } from '@/config/voice-input'
import type { WhisperModel } from './voice-recognition/whisper-recognition'

interface VoiceSettingsProps {
  autoStopOnNoInput: boolean
  onAutoStopChange: (val: boolean) => void
  autoSendOnStop: boolean
  onAutoSendChange: (val: boolean) => void
  autoReadAloud: boolean
  onAutoReadAloudChange: (val: boolean) => void
  noInputMs: number
  onTimeoutChange: (val: number) => void
  engine: VoiceRecognitionEngine
  onEngineChange: (val: VoiceRecognitionEngine) => void
  whisperModel: WhisperModel
  onWhisperModelChange: (val: WhisperModel) => void
}

const WHISPER_MODELS: { value: WhisperModel, label: string, desc: string }[] = [
  { value: 'whisper-tiny', label: 'Whisper Tiny', desc: '最快，精度一般' },
  { value: 'whisper-base', label: 'Whisper Base', desc: '较快，精度良好' },
  { value: 'whisper-small', label: 'Whisper Small', desc: '较慢，精度最好' },
  { value: 'funasr-paraformer-zh', label: 'FunASR Paraformer', desc: '中文识别，速度快精度高' },
  { value: 'funasr-sensevoice', label: 'FunASR SenseVoice', desc: '多语言，中英日韩粤' },
]

export function VoiceSettings({
  autoStopOnNoInput,
  onAutoStopChange,
  autoSendOnStop,
  onAutoSendChange,
  autoReadAloud,
  onAutoReadAloudChange,
  noInputMs,
  onTimeoutChange,
  engine,
  onEngineChange,
  whisperModel,
  onWhisperModelChange,
}: VoiceSettingsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({})
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const positionPanel = useCallback(() => {
    const btn = btnRef.current
    if (!btn) { return }
    const rect = btn.getBoundingClientRect()
    const panelH = panelRef.current?.offsetHeight || 300
    const panelW = 288
    const gap = 8

    let top = rect.top - panelH - gap
    if (top < 8) {
      top = rect.bottom + gap
    }
    let left = rect.right - panelW
    if (left < 8) {
      left = 8
    }

    setPanelStyle({ position: 'fixed', top, left, width: panelW })
  }, [])

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(positionPanel)
    }
  }, [isOpen, positionPanel])

  useEffect(() => {
    if (!isOpen) { return }
    const onResize = () => positionPanel()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [isOpen, positionPanel])

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center w-8 h-8 rounded-md text-content-tertiary hover:text-content-secondary hover:bg-surface-hover transition-colors"
        title="语音设置"
      >
        <Cog6ToothIcon className="w-5 h-5" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div
            ref={panelRef}
            className="fixed z-50 w-72 bg-surface-elevated rounded-lg shadow-lg border border-border p-3"
            style={panelStyle}
          >
            <div className="text-sm font-medium text-content mb-3">语音设置</div>

            <div className="space-y-3">
              <label className="flex items-center justify-between">
                <span className="text-sm text-content-tertiary">识别引擎</span>
                <select
                  value={engine}
                  onChange={e => onEngineChange(e.target.value as VoiceRecognitionEngine)}
                  className="text-sm px-2 py-1 rounded border bg-surface-tertiary text-content focus:outline-none focus:ring-2"
                  style={{ '--tw-ring-color': 'var(--ring)' } as React.CSSProperties}
                >
                  <option value="browser">浏览器识别</option>
                  <option value="whisper">Whisper 离线</option>
                </select>
              </label>

              {engine === 'whisper' && (
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-content-tertiary">Whisper 模型</span>
                  <select
                    value={whisperModel}
                    onChange={e => onWhisperModelChange(e.target.value as WhisperModel)}
                    className="text-sm px-2 py-1 rounded border bg-surface-tertiary text-content focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': 'var(--ring)' } as React.CSSProperties}
                  >
                    {WHISPER_MODELS.map(m => (
                      <option key={m.value} value={m.value}>{m.label} - {m.desc}</option>
                    ))}
                  </select>
                </label>
              )}

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-content-tertiary">无录音输入自动结束</span>
                <input
                  type="checkbox"
                  checked={autoStopOnNoInput}
                  onChange={e => onAutoStopChange(e.target.checked)}
                  className="w-4 h-4 rounded border text-accent focus:ring-2"
                  style={{ '--tw-ring-color': 'var(--ring)' } as React.CSSProperties}
                />
              </label>

              {autoStopOnNoInput && (
                <label className="flex items-center justify-between">
                  <span className="text-sm text-content-tertiary">无录音时长(秒)</span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={noInputMs / 1000}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10)
                      if (val >= 1 && val <= 30) {
                        onTimeoutChange(val * 1000)
                      }
                    }}
                    className="w-16 text-right text-sm px-2 py-1 rounded border bg-surface-tertiary text-content focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': 'var(--ring)' } as React.CSSProperties}
                  />
                </label>
              )}

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-content-tertiary">录音结束自动发送</span>
                <input
                  type="checkbox"
                  checked={autoSendOnStop}
                  onChange={e => onAutoSendChange(e.target.checked)}
                  className="w-4 h-4 rounded border text-accent focus:ring-2"
                  style={{ '--tw-ring-color': 'var(--accent)' } as React.CSSProperties}
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-content-tertiary">自动朗读回复</span>
                <input
                  type="checkbox"
                  checked={autoReadAloud}
                  onChange={e => onAutoReadAloudChange(e.target.checked)}
                  className="w-4 h-4 rounded border text-accent focus:ring-2"
                  style={{ '--tw-ring-color': 'var(--accent)' } as React.CSSProperties}
                />
              </label>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
