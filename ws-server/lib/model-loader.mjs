import { pipeline, env } from '@huggingface/transformers'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { existsSync, readdirSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

const MODEL_PATH = process.env.SPEECH_MODEL_PATH || resolve(__dirname, '..', 'models')

env.allowLocalModels = true
env.localModelPath = MODEL_PATH + '/'
env.allowRemoteModels = process.env.AUTO_DOWNLOAD_MODELS === 'true'

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

function isLocalModelExists(modelName) {
  const modelDir = resolve(MODEL_PATH, modelName)
  if (!existsSync(modelDir)) return false
  const files = readdirSync(modelDir)
  return files.some(f => f.endsWith('.onnx'))
}

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
    throw new Error(`未知模型: ${modelName}。可用模型: ${Object.keys(MODELS).join(', ')}`)
  }

  // 检测本地模型是否存在，不存在则跳过加载
  if (!isLocalModelExists(modelName) && env.allowRemoteModels !== true) {
    console.log(`[ModelLoader] 模型 ${modelName} 本地不存在，已跳过加载。如需自动下载请设置 AUTO_DOWNLOAD_MODELS=true`)
    return null
  }

  modelLoading.set(modelName, true)
  const startTime = Date.now()
  console.log(`[ModelLoader] Loading model: ${modelName}...`)

  try {
    let logged = false
    const transcriber = await pipeline(
      'automatic-speech-recognition',
      modelConfig.hub,
      {
        dtype: modelConfig.dtype,
        progress_callback: (progress) => {
          // Only log once when model is fully loaded
          if (progress.status === 'done' && !logged) {
            logged = true
            console.log(`[ModelLoader] ${modelName} ready`)
          }
        },
      },
    )
    models.set(modelName, transcriber)
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[ModelLoader] Model ${modelName} loaded in ${elapsed}s`)
    return transcriber
  } catch (e) {
    console.log(`[ModelLoader] 模型 ${modelName} 加载失败: ${e.message}`)
    return null
  } finally {
    modelLoading.set(modelName, false)
  }
}

export function getWhisperModels() {
  return Object.keys(MODELS).filter(k => MODELS[k].type === 'whisper')
}
