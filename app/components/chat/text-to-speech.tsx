'use client'

import { useState, useCallback, useEffect } from 'react'
import { SpeakerWaveIcon, SpeakerXMarkIcon } from '@heroicons/react/24/outline'

interface TextToSpeechProps {
  text: string
  disabled?: boolean
}

let pendingAutoRead = false
let autoReadCallback: ((text: string) => void) | null = null

export function setAutoReadPending(val: boolean) {
  pendingAutoRead = val
}

export function triggerAutoReadIfPending(text: string) {
  if (autoReadCallback) {
    pendingAutoRead = false
    autoReadCallback(text)
  }
}

export function stopReadAloud() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel()
  }
}

export function TextToSpeech({ text, disabled = false }: TextToSpeechProps) {
  const [isSpeaking, setIsSpeaking] = useState(false)

  const speak = useCallback((content: string) => {
    if (!content.trim()) { return }
    if (!window.speechSynthesis) { return }

    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(content)
    utterance.lang = 'zh-CN'
    utterance.rate = 1
    utterance.pitch = 1

    utterance.onend = () => {
      setIsSpeaking(false)
    }

    utterance.onerror = () => {
      setIsSpeaking(false)
    }

    window.speechSynthesis.speak(utterance)
    setIsSpeaking(true)
  }, [])

  useEffect(() => {
    autoReadCallback = speak
    return () => {
      autoReadCallback = null
    }
  }, [speak])

  const toggle = () => {
    if (disabled) { return }

    if (isSpeaking) {
      window.speechSynthesis.cancel()
      setIsSpeaking(false)
      return
    }

    speak(text)
  }

  if (!window.speechSynthesis) {
    return null
  }

  return (
    <div
      className={`relative box-border flex items-center justify-center h-7 w-7 p-0.5 rounded-lg bg-surface cursor-pointer text-content-tertiary hover:bg-surface-hover hover:text-content ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      style={{ boxShadow: '0px 4px 6px -1px rgba(0, 0, 0, 0.1), 0px 2px 4px -2px rgba(0, 0, 0, 0.05)' }}
      onClick={disabled ? undefined : toggle}
      title={isSpeaking ? '停止朗读' : '语音朗读'}
    >
      {isSpeaking
        ? (
          <SpeakerXMarkIcon className="w-4 h-4 text-red-500" />
        )
        : (
          <SpeakerWaveIcon className="w-4 h-4" />
        )}
    </div>
  )
}
