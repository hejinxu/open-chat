'use client'

import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import { MicrophoneIcon, StopIcon } from '@heroicons/react/24/solid'
import { VOICE_INPUT_CONFIG } from '@/config/voice-input'
import { setAutoReadPending, stopReadAloud } from './text-to-speech'

interface VoiceInputProps {
  onResult: (text: string) => void
  onAutoSend?: () => void
  disabled?: boolean
  autoStopOnTimeout?: boolean
  timeoutMs?: number
  autoSendOnTimeout?: boolean
  autoReadAloud?: boolean
}

export const VoiceInput = forwardRef(({ onResult, onAutoSend, disabled = false, autoStopOnTimeout = true, timeoutMs = VOICE_INPUT_CONFIG.TIMEOUT_MS, autoSendOnTimeout = VOICE_INPUT_CONFIG.AUTO_SEND_ON_TIMEOUT, autoReadAloud = VOICE_INPUT_CONFIG.AUTO_READ_ALOUD }: VoiceInputProps, ref: React.Ref<{ stop: () => void }>) => {
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const recognitionRef = useRef<any>(null)
  const accumulatedRef = useRef('')
  const isActiveRef = useRef(false)
  const timerRef = useRef<any>(null)
  const onResultRef = useRef(onResult)
  const onAutoSendRef = useRef(onAutoSend)
  const autoStopOnTimeoutRef = useRef(autoStopOnTimeout)
  const timeoutMsRef = useRef(timeoutMs)
  const autoSendOnTimeoutRef = useRef(autoSendOnTimeout)
  const autoReadAloudRef = useRef(autoReadAloud)

  useEffect(() => {
    onResultRef.current = onResult
  }, [onResult])

  useEffect(() => {
    onAutoSendRef.current = onAutoSend
  }, [onAutoSend])

  useEffect(() => {
    autoStopOnTimeoutRef.current = autoStopOnTimeout
  }, [autoStopOnTimeout])

  useEffect(() => {
    timeoutMsRef.current = timeoutMs
  }, [timeoutMs])

  useEffect(() => {
    autoSendOnTimeoutRef.current = autoSendOnTimeout
  }, [autoSendOnTimeout])

  useEffect(() => {
    autoReadAloudRef.current = autoReadAloud
  }, [autoReadAloud])

  const clearTimer = () => {
    if (timerRef.current) {
      globalThis.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const startTimer = () => {
    clearTimer()
    if (!autoStopOnTimeoutRef.current) { return }
    timerRef.current = globalThis.setTimeout(() => {
      doStop(true)
    }, timeoutMsRef.current)
  }

  const doStop = (fromTimeout = false) => {
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
    if (fromTimeout && autoSendOnTimeoutRef.current && finalText && onAutoSendRef.current) {
      if (autoReadAloudRef.current) {
        setAutoReadPending(true)
      }
      onAutoSendRef.current()
    }
  }

  const doStart = () => {
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) { return }

    accumulatedRef.current = ''
    isActiveRef.current = true
    stopReadAloud()

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
    if (isListening) {
      doStop()
    } else if (!disabled) {
      doStart()
    }
  }

  useImperativeHandle(ref, () => ({
    stop: doStop,
  }), [])

  if (!isSupported) {
    return null
  }

  return (
    <button
      type="button"
      onClick={toggleListening}
      className={`flex items-center justify-center w-8 h-8 rounded-md transition-colors cursor-pointer ${
        isListening
          ? 'text-red-500 voice-input-listening'
          : (disabled ? 'text-gray-300 dark:text-gray-600' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200')
      }`}
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
})
