'use client'

import { useState } from 'react'
import type { VoiceRecognitionEngine } from '@/config/voice-input'
import { VOICE_INPUT_CONFIG } from '@/config/voice-input'
import type { SpeechModel } from '@/app/components/chat/voice-recognition/ws-speech-recognition'

function getSavedBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') { return fallback }
  const saved = localStorage.getItem(key)
  return saved !== null ? saved === 'true' : fallback
}

function getSavedNumber(key: string, fallback: number): number {
  if (typeof window === 'undefined') { return fallback }
  const saved = localStorage.getItem(key)
  return saved !== null ? Number(saved) : fallback
}

function getDefaultNoInputMs(engine: VoiceRecognitionEngine): number {
  if (engine === 'whisper') {
    return VOICE_INPUT_CONFIG.NO_INPUT_TIMEOUT_MS_WHISPER
  }
  if (engine === 'funasr') {
    return VOICE_INPUT_CONFIG.NO_INPUT_TIMEOUT_MS_FUNASR
  }
  return VOICE_INPUT_CONFIG.NO_INPUT_TIMEOUT_MS_BROWSER
}

export function useVoiceSettings() {
  const [autoStopOnNoInput, setAutoStopOnNoInput] = useState(() =>
    getSavedBoolean('voice-auto-stop-on-no-input', true),
  )

  const [autoSendOnStop, setAutoSendOnStop] = useState(() =>
    getSavedBoolean('voice-auto-send-on-stop', VOICE_INPUT_CONFIG.AUTO_SEND_ON_STOP),
  )

  const [autoReadAloud, setAutoReadAloud] = useState(() =>
    getSavedBoolean('voice-auto-read', VOICE_INPUT_CONFIG.AUTO_READ_ALOUD),
  )

  const [voiceEngine, setVoiceEngine] = useState<VoiceRecognitionEngine>(() => {
    if (typeof window === 'undefined') { return VOICE_INPUT_CONFIG.DEFAULT_ENGINE }
    const saved = localStorage.getItem('voice-engine')
    if (saved === 'browser' || saved === 'whisper' || saved === 'funasr') { return saved }
    return VOICE_INPUT_CONFIG.DEFAULT_ENGINE
  })

  const [noInputMs, setNoInputMs] = useState(() => {
    const engine = voiceEngine
    const key = `voice-no-input-ms-${engine}`
    return getSavedNumber(key, getDefaultNoInputMs(engine))
  })

  const [whisperModel, setWhisperModel] = useState<SpeechModel>(() => {
    if (typeof window === 'undefined') { return 'whisper-tiny' }
    const saved = localStorage.getItem('whisper-model')
    const whisperModels: SpeechModel[] = ['whisper-tiny', 'whisper-base', 'whisper-small']
    const funasrModels: SpeechModel[] = ['funasr-paraformer-zh', 'funasr-sensevoice']
    if (voiceEngine === 'whisper' && whisperModels.includes(saved as SpeechModel)) {
      return saved as SpeechModel
    }
    if (voiceEngine === 'funasr' && funasrModels.includes(saved as SpeechModel)) {
      return saved as SpeechModel
    }
    return voiceEngine === 'funasr' ? 'funasr-paraformer-zh' : 'whisper-tiny'
  })

  const handleAutoStopChange = (val: boolean) => {
    setAutoStopOnNoInput(val)
    localStorage.setItem('voice-auto-stop-on-no-input', String(val))
  }

  const handleAutoSendChange = (val: boolean) => {
    setAutoSendOnStop(val)
    localStorage.setItem('voice-auto-send-on-stop', String(val))
  }

  const handleAutoReadAloudChange = (val: boolean) => {
    setAutoReadAloud(val)
    localStorage.setItem('voice-auto-read', String(val))
  }

  const handleTimeoutChange = (val: number) => {
    setNoInputMs(val)
    localStorage.setItem(`voice-no-input-ms-${voiceEngine}`, String(val))
  }

  const handleVoiceEngineChange = (val: VoiceRecognitionEngine) => {
    setVoiceEngine(val)
    localStorage.setItem('voice-engine', val)
    const key = `voice-no-input-ms-${val}`
    const saved = localStorage.getItem(key)
    setNoInputMs(saved !== null ? Number(saved) : getDefaultNoInputMs(val))
    const whisperModels: SpeechModel[] = ['whisper-tiny', 'whisper-base', 'whisper-small']
    const funasrModels: SpeechModel[] = ['funasr-paraformer-zh', 'funasr-sensevoice']
    if (val === 'whisper') {
      const savedModel = localStorage.getItem('whisper-model')
      const newModel = (savedModel && whisperModels.includes(savedModel as SpeechModel))
        ? (savedModel as SpeechModel)
        : 'whisper-tiny'
      setWhisperModel(newModel)
    }
    else if (val === 'funasr') {
      const savedModel = localStorage.getItem('whisper-model')
      const newModel = (savedModel && funasrModels.includes(savedModel as SpeechModel))
        ? (savedModel as SpeechModel)
        : 'funasr-paraformer-zh'
      setWhisperModel(newModel)
    }
  }

  const handleWhisperModelChange = (val: SpeechModel) => {
    setWhisperModel(val)
    localStorage.setItem('whisper-model', val)
  }

  return {
    autoStopOnNoInput,
    autoSendOnStop,
    autoReadAloud,
    noInputMs,
    voiceEngine,
    whisperModel,
    handleAutoStopChange,
    handleAutoSendChange,
    handleAutoReadAloudChange,
    handleTimeoutChange,
    handleVoiceEngineChange,
    handleWhisperModelChange,
  }
}
