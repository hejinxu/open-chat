import type { VoiceRecognitionEngine, VoiceRecognitionResult } from './types'

type BrowserRecognitionCallback = (result: VoiceRecognitionResult) => void

export class BrowserRecognition implements VoiceRecognitionEngine {
  private recognition: any = null
  private callback: BrowserRecognitionCallback | null = null

  constructor(callback: BrowserRecognitionCallback) {
    this.callback = callback
  }

  isSupported(): boolean {
    return !!(window.SpeechRecognition || (window as any).webkitSpeechRecognition)
  }

  isListening(): boolean {
    return !!(this.recognition && this.recognition.recording !== false)
  }

  isReady(): boolean {
    return true
  }

  getLoadingProgress(): number {
    return 1
  }

  start(): void {
    if (this.recognition) { return }

    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) { return }

    this.recognition = new SpeechRecognition()
    this.recognition.continuous = true
    this.recognition.interimResults = true
    this.recognition.lang = 'zh-CN'

    this.recognition.onresult = (event: any) => {
      let finalText = ''
      let interimText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalText += transcript
        }
        else {
          interimText += transcript
        }
      }
      if (finalText && this.callback) {
        this.callback({ text: finalText, isFinal: true })
      }
      else if (interimText && this.callback) {
        this.callback({ text: interimText, isFinal: false })
      }
    }

    this.recognition.onerror = (event: any) => {
      const ignorable = ['no-speech', 'aborted', 'no-match']
      if (ignorable.includes(event.error)) {
        return
      }
      console.warn('[BrowserRecognition] Error:', event.error)
      this.recognition = null
    }

    this.recognition.onend = () => {
      if (this.recognition) {
        try {
          this.recognition.start()
        } catch {
          this.recognition = null
        }
      }
    }

    try {
      this.recognition.start()
    } catch (e) {
      this.recognition = null
    }
  }

  stop(): void {
    if (this.recognition) {
      try { this.recognition.stop() } catch (e) { /* ignore */ }
      this.recognition = null
    }
  }
}
