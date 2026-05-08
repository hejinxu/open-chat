import { pipeline, env } from '@huggingface/transformers'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const MODEL_PATH = process.env.SPEECH_MODEL_PATH || resolve(__dirname, '..', 'models')

env.allowLocalModels = true
env.localModelPath = MODEL_PATH + '/'
env.allowRemoteModels = !process.env.SPEECH_OFFLINE

if (process.env.SPEECH_MIRROR) {
  env.remoteHost = process.env.SPEECH_MIRROR
}

export const MODELS = {
  'whisper-tiny': {
    name: 'whisper-tiny',
    type: 'whisper',
    hub: 'onnx-community/whisper-tiny',
    dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
    description: '最快，精度一般',
  },
  'whisper-base': {
    name: 'whisper-base',
    type: 'whisper',
    hub: 'onnx-community/whisper-base',
    dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
    description: '较快，精度良好',
  },
  'whisper-small': {
    name: 'whisper-small',
    type: 'whisper',
    hub: 'onnx-community/whisper-small',
    dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
    description: '较慢，精度最好',
  },
  'funasr-paraformer-zh': {
    name: 'funasr-paraformer-zh',
    type: 'funasr',
    funasrModel: 'paraformer-zh',
    description: 'FunASR Paraformer 中文，速度快精度高',
  },
  'funasr-sensevoice': {
    name: 'funasr-sensevoice',
    type: 'funasr',
    funasrModel: 'sensevoice',
    description: 'FunASR SenseVoice 多语言，支持中英日韩粤',
  },
}

const models = new Map()
const modelLoading = new Map()

export async function loadModel(modelName) {
  if (models.has(modelName)) return models.get(modelName)
  if (modelLoading.get(modelName)) {
    while (modelLoading.get(modelName)) {
      await new Promise(r => setTimeout(r, 500))
    }
    return models.get(modelName)
  }

  const modelConfig = MODELS[modelName]
  if (!modelConfig) {
    throw new Error(`Unknown model: ${modelName}. Available: ${Object.keys(MODELS).join(', ')}`)
  }

  modelLoading.set(modelName, true)
  const startTime = Date.now()
  console.log(`[ModelLoader] Loading model: ${modelName}...`)

  try {
    const transcriber = await pipeline(
      'automatic-speech-recognition',
      modelConfig.hub,
      {
        dtype: modelConfig.dtype,
        progress_callback: (progress) => {
          if (progress.status === 'progress' && progress.progress) {
            process.stdout.write(`\r[ModelLoader] Loading ${modelName}: ${Math.round(progress.progress)}%`)
          } else if (progress.status === 'done') {
            process.stdout.write(`\r[ModelLoader] Loading ${modelName}: 100%\n`)
          }
        },
      },
    )
    models.set(modelName, transcriber)
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[ModelLoader] Model ${modelName} loaded in ${elapsed}s`)
    return transcriber
  } catch (e) {
    console.error(`[ModelLoader] Failed to load model ${modelName}:`, e)
    throw e
  } finally {
    modelLoading.set(modelName, false)
  }
}

export function getWhisperModels() {
  return Object.keys(MODELS).filter(k => MODELS[k].type === 'whisper')
}
