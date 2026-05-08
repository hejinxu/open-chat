'use client'

import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import { MicrophoneIcon, StopIcon } from '@heroicons/react/24/solid'
import { VOICE_INPUT_CONFIG } from '@/config/voice-input'
import type { VoiceRecognitionEngine } from '@/config/voice-input'
import { setAutoReadPending, stopReadAloud } from './text-to-speech'
import { BrowserRecognition } from './voice-recognition/browser-recognition'
import { WhisperRecognition } from './voice-recognition/whisper-recognition'
import type { WhisperModel } from './voice-recognition/whisper-recognition'
import type { VoiceRecognitionResult } from './voice-recognition/types'

interface VoiceInputProps {
  onResult: (text: string) => void
  onAutoSend?: () => void
  disabled?: boolean
  autoStopOnNoInput?: boolean
  noInputMs?: number
  autoSendOnStop?: boolean
  autoReadAloud?: boolean
  engine?: VoiceRecognitionEngine
  whisperModel?: WhisperModel
}

export const VoiceInput = forwardRef(({ onResult, onAutoSend, disabled = false, autoStopOnNoInput = true, noInputMs = VOICE_INPUT_CONFIG.NO_INPUT_TIMEOUT_MS_BROWSER, autoSendOnStop = VOICE_INPUT_CONFIG.AUTO_SEND_ON_STOP, autoReadAloud = VOICE_INPUT_CONFIG.AUTO_READ_ALOUD, engine = VOICE_INPUT_CONFIG.DEFAULT_ENGINE, whisperModel = 'whisper-tiny' }: VoiceInputProps, ref: React.Ref<{ stop: () => void }>) => {
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const [isWaitingForResult, setIsWaitingForResult] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const engineRef = useRef<any>(null)
  const isActiveRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const speechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const accumulatedRef = useRef('')
  const interimRef = useRef('')
  const pendingSendRef = useRef(false)
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownEndRef = useRef(0)
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const onResultRef = useRef(onResult)
  const onAutoSendRef = useRef(onAutoSend)
  const autoStopOnNoInputRef = useRef(autoStopOnNoInput)
  const noInputMsRef = useRef(noInputMs)
  const autoSendOnStopRef = useRef(autoSendOnStop)
  const autoReadAloudRef = useRef(autoReadAloud)
  const engineTypeRef = useRef(engine)
  const whisperModelRef = useRef(whisperModel)

  useEffect(() => { onResultRef.current = onResult }, [onResult])
  useEffect(() => { onAutoSendRef.current = onAutoSend }, [onAutoSend])
  useEffect(() => { autoStopOnNoInputRef.current = autoStopOnNoInput }, [autoStopOnNoInput])
  useEffect(() => { noInputMsRef.current = noInputMs }, [noInputMs])
  useEffect(() => { autoSendOnStopRef.current = autoSendOnStop }, [autoSendOnStop])
  useEffect(() => { autoReadAloudRef.current = autoReadAloud }, [autoReadAloud])
  useEffect(() => { whisperModelRef.current = whisperModel }, [whisperModel])

  useEffect(() => {
    engineTypeRef.current = engine
    if (isActiveRef.current) {
      isActiveRef.current = false
      clearTimer()
      if (engineRef.current) {
        try { engineRef.current.stop() } catch (e) { /* ignore */ }
        engineRef.current = null
      }
      setIsListening(false)
    }
  }, [engine])

  const createEngine = (callback: (result: VoiceRecognitionResult) => void) => {
    if (engineTypeRef.current === 'whisper') {
      return new WhisperRecognition(callback, whisperModelRef.current)
    }
    return new BrowserRecognition(callback)
  }

  const checkSupport = () => {
    if (typeof window === 'undefined') { return false }
    if (engineTypeRef.current === 'whisper') {
      return !!navigator.mediaDevices?.getUserMedia
    }
    return !!(window.SpeechRecognition || (window as any).webkitSpeechRecognition)
  }

  const clearTimer = () => {
    if (timerRef.current) {
      globalThis.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (speechTimerRef.current) {
      globalThis.clearTimeout(speechTimerRef.current)
      speechTimerRef.current = null
    }
  }

  const clearSendTimer = () => {
    if (sendTimerRef.current) {
      globalThis.clearTimeout(sendTimerRef.current)
      sendTimerRef.current = null
    }
  }

  const clearCountdown = () => {
    if (countdownIntervalRef.current) {
      globalThis.clearInterval(countdownIntervalRef.current)
      countdownIntervalRef.current = null
    }
    countdownEndRef.current = 0
    setCountdown(0)
  }

  const startCountdown = (delayMs: number) => {
    clearCountdown()
    countdownEndRef.current = Date.now() + delayMs
    setCountdown(Math.ceil(delayMs / 100) / 10)
    countdownIntervalRef.current = globalThis.setInterval(() => {
      const remaining = countdownEndRef.current - Date.now()
      if (remaining <= 0) {
        if (countdownIntervalRef.current) {
          globalThis.clearInterval(countdownIntervalRef.current)
          countdownIntervalRef.current = null
        }
        setCountdown(0)
        return
      }
      setCountdown(Math.ceil(remaining / 100) / 10)
    }, 100)
  }

  const doStop = (fromTimeout = false) => {
    if (!isActiveRef.current) { return }
    isActiveRef.current = false
    clearTimer()
    clearSendTimer()
    clearCountdown()
    pendingSendRef.current = false
    setIsWaitingForResult(false)
    try { engineRef.current?.stop() } catch (e) { /* ignore */ }
    engineRef.current = null
    setIsListening(false)
  }

  const doStart = () => {
    if (!checkSupport()) { return }

    stopReadAloud()
    accumulatedRef.current = ''
    interimRef.current = ''
    pendingSendRef.current = false
    clearSendTimer()
    clearCountdown()
    setIsWaitingForResult(false)
    isActiveRef.current = true

    const voiceEngine = createEngine((result: VoiceRecognitionResult) => {
      if (!isActiveRef.current) { return }

      if (autoStopOnNoInputRef.current) {
        if (speechTimerRef.current) {
          globalThis.clearTimeout(speechTimerRef.current)
        }
        speechTimerRef.current = globalThis.setTimeout(() => {
          if (!isActiveRef.current) { return }

          isActiveRef.current = false
          clearTimer()
          try { engineRef.current?.stop() } catch (e) { /* ignore */ }
          engineRef.current = null
          setIsListening(false)

          if (autoSendOnStopRef.current && onAutoSendRef.current) {
            pendingSendRef.current = true
            setIsWaitingForResult(true)
            startCountdown(noInputMsRef.current)
            sendTimerRef.current = globalThis.setTimeout(() => {
              if (!pendingSendRef.current) { return }
              pendingSendRef.current = false
              clearCountdown()
              setIsWaitingForResult(false)
              const finalText = accumulatedRef.current.trim()
              if (finalText) {
                onResultRef.current(finalText)
                if (autoReadAloudRef.current) { setAutoReadPending(true) }
                onAutoSendRef.current!()
              }
            }, noInputMsRef.current)
          }
        }, noInputMsRef.current)
      }

      if (result.isFinal && result.text) {
        const text = result.text.trim()
        if (!text) { return }

        if (engineTypeRef.current === 'whisper') {
          accumulatedRef.current = text
        }
        else {
          if (accumulatedRef.current) {
            accumulatedRef.current = `${accumulatedRef.current}，${text}`
          }
          else {
            accumulatedRef.current = text
          }
        }
        interimRef.current = ''
        onResultRef.current(accumulatedRef.current)

        if (pendingSendRef.current) {
          clearSendTimer()
          startCountdown(noInputMsRef.current)
          sendTimerRef.current = globalThis.setTimeout(() => {
            if (!pendingSendRef.current) { return }
            pendingSendRef.current = false
            clearCountdown()
            setIsWaitingForResult(false)
            const finalText = accumulatedRef.current.trim()
            if (finalText) {
              onResultRef.current(finalText)
              if (autoReadAloudRef.current) { setAutoReadPending(true) }
              onAutoSendRef.current!()
            }
          }, noInputMsRef.current)
        }
      }
      else if (!result.isFinal && result.text) {
        const interim = result.text.trim()
        if (!interim) { return }

        interimRef.current = interim
        const preview = accumulatedRef.current
          ? `${accumulatedRef.current}，${interim}`
          : interim
        onResultRef.current(preview)
      }
    })

    voiceEngine.start()
    engineRef.current = voiceEngine
    setIsListening(true)

    clearTimer()
    if (autoStopOnNoInputRef.current) {
      speechTimerRef.current = globalThis.setTimeout(() => {
        if (!isActiveRef.current) { return }

        isActiveRef.current = false
        clearTimer()
        try { engineRef.current?.stop() } catch (e) { /* ignore */ }
        engineRef.current = null
        setIsListening(false)

        if (autoSendOnStopRef.current && onAutoSendRef.current) {
          pendingSendRef.current = true
          setIsWaitingForResult(true)
          startCountdown(noInputMsRef.current)
          sendTimerRef.current = globalThis.setTimeout(() => {
            if (!pendingSendRef.current) { return }
            pendingSendRef.current = false
            clearCountdown()
            setIsWaitingForResult(false)
            const finalText = accumulatedRef.current.trim()
            if (finalText) {
              onResultRef.current(finalText)
              if (autoReadAloudRef.current) { setAutoReadPending(true) }
              onAutoSendRef.current!()
            }
          }, noInputMsRef.current)
        }
      }, noInputMsRef.current)
    }
  }

  useEffect(() => {
    setIsSupported(checkSupport())
    return () => {
      isActiveRef.current = false
      clearTimer()
      clearSendTimer()
      clearCountdown()
      if (engineRef.current) {
        try { engineRef.current.stop() } catch (e) { /* ignore */ }
      }
    }
  }, [])

  useEffect(() => {
    setIsSupported(checkSupport())
  }, [engine])

  const toggleListening = () => {
    if (isListening) {
      doStop(false)
    } else if (!disabled) {
      doStart()
    }
  }

  useImperativeHandle(ref, () => ({
    stop: () => doStop(false),
  }), [])

  if (!isSupported) { return null }

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative" title={isListening ? '点击停止录音' : '点击开始语音输入'}>
        <button
          type="button"
          onClick={toggleListening}
          className={`flex items-center justify-center w-8 h-8 rounded-md transition-colors cursor-pointer ${
            isListening
              ? 'text-red-500 voice-input-listening'
              : (disabled ? 'text-content-quaternary' : 'text-content-tertiary hover:text-content-secondary')
          }`}
        >
          {isListening
            ? <StopIcon className="w-4 h-4" />
            : <MicrophoneIcon className="w-4 h-4" />
          }
        </button>
      </div>
      {isWaitingForResult && (
        <span className="text-xs text-content-quaternary whitespace-nowrap animate-pulse">
          等待结果 {countdown.toFixed(1)}s
        </span>
      )}
    </div>
  )
})
