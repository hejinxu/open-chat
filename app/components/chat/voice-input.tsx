'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { MicrophoneIcon, StopIcon } from '@heroicons/react/24/solid'

interface VoiceInputProps {
  onResult: (text: string) => void
  disabled?: boolean
}

export function VoiceInput({ onResult, disabled = false }: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const recognitionRef = useRef<any>(null)
  const accumulatedRef = useRef('')
  const onResultRef = useRef(onResult)
  const isActiveRef = useRef(false)
  const restartTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    onResultRef.current = onResult
  }, [onResult])

  const createRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) { return null }

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'zh-CN'

    recognition.onresult = (event: any) => {
      let finalText = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const item = event.results[i]
        if (item.isFinal) {
          finalText += item[0].transcript
        }
      }

      if (finalText) {
        if (accumulatedRef.current) {
          accumulatedRef.current = (`${accumulatedRef.current}，${finalText}`).trim()
        } else {
          accumulatedRef.current = finalText.trim()
        }
        onResultRef.current(accumulatedRef.current)
      }
    }

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error)
      if (isActiveRef.current) {
        restartRecognition()
      }
    }

    recognition.onend = () => {
      if (isActiveRef.current) {
        restartRecognition()
      } else {
        setIsListening(false)
      }
    }

    return recognition
  }, [])

  const restartRecognition = useCallback(() => {
    if (!isActiveRef.current) { return }

    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current)
    }

    restartTimeoutRef.current = setTimeout(() => {
      if (!isActiveRef.current) { return }
      try {
        const newRecognition = createRecognition()
        if (newRecognition) {
          recognitionRef.current = newRecognition
          newRecognition.start()
        }
      } catch (error) {
        console.error('Failed to restart recognition:', error)
        setIsListening(false)
        isActiveRef.current = false
      }
    }, 100)
  }, [createRecognition])

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setIsSupported(false)
      return
    }

    setIsSupported(true)
    recognitionRef.current = createRecognition()

    return () => {
      isActiveRef.current = false
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current)
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    }
  }, [createRecognition])

  const toggleListening = () => {
    if (!recognitionRef.current || disabled) { return }

    if (isListening) {
      isActiveRef.current = false
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current)
      }
      try {
        recognitionRef.current.stop()
      } catch (e) {
        console.error('Error stopping recognition:', e)
      }
      const finalText = accumulatedRef.current.trim()
      if (finalText) {
        onResult(finalText)
      }
      accumulatedRef.current = ''
      setIsListening(false)
    } else {
      accumulatedRef.current = ''
      isActiveRef.current = true
      try {
        recognitionRef.current.start()
        setIsListening(true)
      } catch (error) {
        console.error('Failed to start speech recognition:', error)
        isActiveRef.current = false
      }
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
