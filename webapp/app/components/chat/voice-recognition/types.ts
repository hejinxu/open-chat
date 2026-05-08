export interface VoiceRecognitionResult {
  text: string
  isFinal: boolean
}

export interface VoiceRecognitionEngine {
  start: () => void
  stop: () => void
  isSupported: () => boolean
  isListening: () => boolean
  isReady: () => boolean
  getLoadingProgress: () => number
}

export type { VoiceRecognitionResult }
