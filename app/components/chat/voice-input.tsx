'use client'

import { useState, useRef, useEffect } from 'react'
import { MicrophoneIcon, StopIcon } from '@heroicons/react/24/solid'

interface VoiceInputProps {
  onResult: (text: string) => void
  disabled?: boolean
}

export function VoiceInput({ onResult, disabled = false }: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const finalTranscriptRef = useRef('')
  const onResultRef = useRef(onResult)

  useEffect(() => {
    onResultRef.current = onResult
  }, [onResult])

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setIsSupported(false)
      return
    }

    setIsSupported(true)

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'zh-CN'

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscriptRef.current += event.results[i][0].transcript
        }
      }
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error)
      setIsListening(false)
    }

    recognition.onend = () => {
      const text = finalTranscriptRef.current.trim()
      if (text) {
        onResultRef.current(text)
      }
      finalTranscriptRef.current = ''
      setIsListening(false)
    }

    recognitionRef.current = recognition

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    }
  }, [])

  const toggleListening = () => {
    if (!recognitionRef.current || disabled) { return }

    if (isListening) {
      recognitionRef.current.stop()
    } else {
      finalTranscriptRef.current = ''
      try {
        recognitionRef.current.start()
        setIsListening(true)
      } catch (error) {
        console.error('Failed to start speech recognition:', error)
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
          ? 'bg-red-500 hover:bg-red-600 text-white voice-input-listening'
          : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300'
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
