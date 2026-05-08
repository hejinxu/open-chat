import type { VoiceRecognitionResult } from './types'
import { io as socketIo } from 'socket.io-client'

type WhisperCallback = (result: VoiceRecognitionResult) => void

export type WhisperModel = 'whisper-tiny' | 'whisper-base' | 'whisper-small' | 'funasr-paraformer-zh' | 'funasr-sensevoice'

function getWhisperWsUrl(): string {
  if (typeof window === 'undefined') { return '' }
  const port = (window as any).__WHISPER_PORT__ || '8787'
  return `http://${window.location.hostname}:${port}`
}

export class WhisperRecognition {
  private isActive = false
  private callback: WhisperCallback | null = null
  private audioContext: AudioContext | null = null
  private stream: MediaStream | null = null
  private socket: any = null
  private modelName: WhisperModel

  constructor(callback: WhisperCallback, modelName: WhisperModel = 'whisper-tiny') {
    this.callback = callback
    this.modelName = modelName
  }

  isSupported(): boolean {
    return typeof window !== 'undefined'
      && !!navigator.mediaDevices?.getUserMedia
  }

  isListening(): boolean {
    return this.isActive
  }

  isReady(): boolean {
    return true
  }

  getLoadingProgress(): number {
    return 1
  }

  start(): void {
    if (this.isActive) { return }
    this.connectAndRecord()
  }

  private async connectAndRecord(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })

      this.audioContext = new AudioContext({ sampleRate: 16000 })
      const source = this.audioContext.createMediaStreamSource(this.stream)
      const processor = this.audioContext.createScriptProcessor(4096, 1, 1)

      await this.connectSocket()

      this.isActive = true

      processor.onaudioprocess = (e) => {
        if (!this.isActive || !this.socket?.connected) { return }

        const inputData = e.inputBuffer.getChannelData(0)
        this.socket.emit('audio', { data: Array.from(inputData) })
      }

      source.connect(processor)
      processor.connect(this.audioContext.destination)
    } catch (e) {
      console.warn('[WhisperRecognition] Failed to start:', e)
      this.isActive = false
      this.cleanup()
    }
  }

  private async connectSocket(): Promise<void> {
    const url = getWhisperWsUrl()

    return new Promise((resolve, reject) => {
      this.socket = socketIo(`${url}/speech`, {
        transports: ['websocket'],
        reconnection: false,
      })

      const timeout = setTimeout(() => {
        if (!this.socket?.connected) {
          this.socket?.disconnect()
          reject(new Error('WebSocket connection timeout'))
        }
      }, 5000)

      this.socket.on('connect', () => {
        clearTimeout(timeout)
        console.log('[WhisperRecognition] Socket connected')
        this.socket.emit('config', { model: this.modelName })
        resolve()
      })

      this.socket.on('connect_error', () => {
        clearTimeout(timeout)
        reject(new Error('WebSocket connection failed'))
      })

      this.socket.on('disconnect', () => {
        console.log('[WhisperRecognition] Socket disconnected')
        this.cleanup()
      })

      this.socket.on('result', (msg: any) => {
        if (msg.text && this.callback) {
          this.callback({ text: msg.text, isFinal: true })
        }
      })

      this.socket.on('config_ok', (msg: any) => {
        console.log(`[WhisperRecognition] Server using model: ${msg.model}`)
      })

      this.socket.on('error', (msg: any) => {
        console.warn('[WhisperRecognition] Server error:', msg.message)
      })
    })
  }

  stop(): void {
    this.isActive = false

    if (this.socket?.connected) {
      try {
        this.socket.emit('stop')
      } catch {}
    }
  }

  private cleanup(): void {
    if (this.socket) {
      const socket = this.socket
      this.socket = null
      try { socket.disconnect() } catch {}
    }

    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop())
      this.stream = null
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => {})
      this.audioContext = null
    }
  }

  setProgressCallback(_cb: (progress: number) => void): void {
  }
}
