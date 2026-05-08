export type VoiceRecognitionEngine = 'browser' | 'whisper'

export const VOICE_INPUT_CONFIG = {
  NO_INPUT_TIMEOUT_MS_BROWSER: 5000,
  NO_INPUT_TIMEOUT_MS_WHISPER: 10000,
  AUTO_SEND_ON_STOP: true,
  AUTO_READ_ALOUD: true,
  DEFAULT_ENGINE: 'browser' as VoiceRecognitionEngine,
  WHISPER_MODEL: 'onnx-community/whisper-small',
  SEND_DELAY_MS: 5000,
}

export type VoiceInputConfig = typeof VOICE_INPUT_CONFIG
