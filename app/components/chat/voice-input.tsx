'use client'

import { useState, useEffect, useRef } from 'react'
import { MicrophoneIcon, StopIcon } from '@heroicons/react/24/solid'
import { VOICE_INPUT_CONFIG } from '@/config/voice-input'

interface VoiceInputProps {
  onResult: (text: string) => void
  disabled?: boolean
}

export function VoiceInput({ onResult, disabled = false }: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const recognitionRef = useRef<any>(null)
  const accumulatedRef = useRef('')
  const isActiveRef = useRef(false)
  const timerRef = useRef<any>(null)
  const onResultRef = useRef(onResult)

  useEffect(() => {
    onResultRef.current = onResult
  }, [onResult])

  const clearTimer = () => {
    if (timerRef.current) {
      globalThis.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const startTimer = () => {
    clearTimer()
    timerRef.current = globalThis.setTimeout(() => {
      doStop()
    }, VOICE_INPUT_CONFIG.TIMEOUT_MS)
  }

  const doStop = () => {
    if (!isActiveRef.current) { return }
    isActiveRef.current = false
    clearTimer()
    try { recognitionRef.current?.stop() } catch (e) { /* ignore */ }
    recognitionRef.current = null
    const finalText = accumulatedRef.current.trim()
    if (finalText) {
      onResultRef.current(finalText)
    }
    accumulatedRef.current = ''
    setIsListening(false)
  }

  const doStart = () => {
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) { return }

    accumulatedRef.current = ''
    isActiveRef.current = true

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'zh-CN'

    recognition.onresult = (event: any) => {
      if (!isActiveRef.current) { return }

      let finalText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript
        }
      }

      if (finalText) {
        if (accumulatedRef.current) {
          accumulatedRef.current = (`${accumulatedRef.current}，${finalText}`).trim()
        } else {
          accumulatedRef.current = finalText.trim()
        }
        onResultRef.current(accumulatedRef.current)
        startTimer()
      }
    }

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error)
      if (!isActiveRef.current) { return }
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        doStop()
      }
    }

    recognition.onend = () => {
      if (isActiveRef.current) {
        try {
          recognition.start()
        } catch (e) {
          doStop()
        }
      }
    }

    recognitionRef.current = recognition

    try {
      recognition.start()
      setIsListening(true)
    } catch (error) {
      console.error('Failed to start speech recognition:', error)
      isActiveRef.current = false
    }
  }

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition
    setIsSupported(!!SpeechRecognition)

    return () => {
      isActiveRef.current = false
      clearTimer()
      if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch (e) { /* ignore */ }
      }
    }
  }, [])

  const toggleListening = () => {
    if (disabled) { return }

    if (isListening) {
      doStop()
    } else {
      doStart()
    }
  }

  if (!isSupported) {
    return null
  }

  return (
    <button
      type="button"
      onClick={toggleListening}
      disabled={disabled}
      className={`flex items-center justify-center w-8 h-8 rounded-md transition-colors ${
        isListening
          ? 'text-red-500 voice-input-listening'
          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      title={isListening ? '点击停止录音' : '点击开始语音输入'}
    >
      {isListening
        ? (
          <StopIcon className="w-4 h-4" />
        )
        : (
          <MicrophoneIcon className="w-4 h-4" />
        )}
    </button>
  )
}
