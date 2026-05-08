import { Converter } from 'opencc-js'
import { loadModel, MODELS } from '../lib/model-loader.mjs'
import { callFunASR } from '../lib/funasr.mjs'
import { computeRMS, filterHallucinations } from '../lib/audio-utils.mjs'

const PROCESS_INTERVAL_MS = parseInt(process.env.SPEECH_PROCESS_INTERVAL || '1500', 10)
const MIN_AUDIO_LENGTH = parseInt(process.env.SPEECH_MIN_AUDIO_LENGTH || '8000', 10)
const DEFAULT_MODEL = process.env.SPEECH_MODEL || 'whisper-tiny'
const SILENCE_THRESHOLD = 0.03
const toSimplified = Converter({ from: 'tw', to: 'cn' })

const clientStates = new Map()

function getClientState(socketId) {
  if (!clientStates.has(socketId)) {
    clientStates.set(socketId, {
      audioBuffer: new Float32Array(0),
      isProcessing: false,
      lastResult: '',
      processTimeout: null,
      modelName: DEFAULT_MODEL,
    })
  }
  return clientStates.get(socketId)
}

async function transcribe(audioData, language, task, modelName) {
  const modelConfig = MODELS[modelName]

  if (modelConfig?.type === 'funasr') {
    return await callFunASR(audioData, modelConfig.funasrModel)
  }

  const model = await loadModel(modelName)
  const result = await model(audioData, {
    language,
    task,
    return_timestamps: false,
    initial_prompt: '以下是普通话的句子。',
  })
  let text = (result?.text || '').trim()
  text = filterHallucinations(text)
  text = toSimplified(text)
  return text
}

async function processBuffer(socket, trigger = 'unknown') {
  const state = getClientState(socket.id)
  if (state.isProcessing) {
    console.log(`[Speech] processBuffer SKIP (already processing) trigger=${trigger}`)
    return
  }

  if (state.audioBuffer.length < MIN_AUDIO_LENGTH) {
    console.log(`[Speech] processBuffer SKIP (buffer=${state.audioBuffer.length} < ${MIN_AUDIO_LENGTH}) trigger=${trigger}`)
    return
  }

  state.isProcessing = true
  const audioToProcess = state.audioBuffer

  const rms = computeRMS(audioToProcess)
  console.log(`[Speech] processBuffer START trigger=${trigger} buffer=${audioToProcess.length} rms=${rms.toFixed(4)}`)
  if (rms < SILENCE_THRESHOLD) {
    console.log(`[Speech] processBuffer SKIP (silence rms=${rms.toFixed(4)} < ${SILENCE_THRESHOLD})`)
    state.isProcessing = false
    return
  }

  try {
    const text = await transcribe(audioToProcess, 'chinese', 'transcribe', state.modelName)
    const duration = (audioToProcess.length / 16000).toFixed(1)
    console.log(`[Speech] [${state.modelName}] Transcribed ${audioToProcess.length} samples (${duration}s): "${text}"`)
    if (text && text !== state.lastResult) {
      state.lastResult = text
      socket.emit('result', { text, is_final: true })
    }
  } catch (e) {
    console.error(`[Speech] Transcription error for ${socket.id}:`, e.message)
    socket.emit('error', { message: e.message })
  } finally {
    state.isProcessing = false
  }
}

export default {
  name: 'speech',
  namespace: '/speech',

  async init() {
    const whisperModels = Object.keys(MODELS).filter(k => MODELS[k].type === 'whisper')
    console.log(`[Speech] Preloading Whisper models: ${whisperModels.join(', ')}`)
    const results = await Promise.allSettled(whisperModels.map(m => loadModel(m)))
    const loaded = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected')
    console.log(`[Speech] Loaded ${loaded}/${whisperModels.length} models`)
    for (const f of failed) {
      console.error(`[Speech] Failed to preload model:`, f.reason?.message)
    }
  },

  onConnection(socket) {
    console.log(`[Speech] Client connected: ${socket.id}`)

    socket.emit('ready')

    socket.on('config', (msg) => {
      if (msg.model && MODELS[msg.model]) {
        const state = getClientState(socket.id)
        state.modelName = msg.model
        console.log(`[Speech] Client ${socket.id} set model: ${msg.model}`)
        socket.emit('config_ok', { model: msg.model })
      } else {
        socket.emit('error', { message: `Invalid model: ${msg.model}. Available: ${Object.keys(MODELS).join(', ')}` })
      }
    })

    socket.on('audio', async (msg) => {
      const state = getClientState(socket.id)
      const newAudio = new Float32Array(msg.data)
      const oldBuffer = state.audioBuffer
      const merged = new Float32Array(oldBuffer.length + newAudio.length)
      merged.set(oldBuffer, 0)
      merged.set(newAudio, oldBuffer.length)
      state.audioBuffer = merged

      console.log(`[Speech] Audio: +${newAudio.length} total=${state.audioBuffer.length} processing=${state.isProcessing}`)

      if (!state.isProcessing && state.audioBuffer.length >= MIN_AUDIO_LENGTH) {
        if (state.processTimeout) {
          clearTimeout(state.processTimeout)
          state.processTimeout = null
        }
        await processBuffer(socket, 'audio')
      } else if (!state.isProcessing && !state.processTimeout && state.audioBuffer.length > 0) {
        state.processTimeout = setTimeout(async () => {
          state.processTimeout = null
          if (!state.isProcessing) {
            await processBuffer(socket, 'timeout')
          }
        }, PROCESS_INTERVAL_MS)
      }
    })

    socket.on('stop', async () => {
      const state = getClientState(socket.id)
      if (state.processTimeout) {
        clearTimeout(state.processTimeout)
        state.processTimeout = null
      }
      if (state.audioBuffer.length > 0) {
        await processBuffer(socket, 'stop')
      }
      state.audioBuffer = new Float32Array(0)
      state.lastResult = ''
      socket.emit('stopped')
    })
  },

  disconnect(socket) {
    const state = clientStates.get(socket.id)
    if (state) {
      if (state.processTimeout) {
        clearTimeout(state.processTimeout)
      }
      clientStates.delete(socket.id)
    }
    console.log(`[Speech] Client disconnected: ${socket.id}`)
  },
}
