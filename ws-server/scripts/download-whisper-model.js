#!/usr/bin/env node

/**
 * Download Whisper ONNX model files from HuggingFace China mirror (hf-mirror.com).
 *
 * Usage:
 *   node scripts/download-whisper-model.js [model]
 *
 * Models: whisper-tiny, whisper-base, whisper-small (default: all)
 *
 * Model files are saved to models/onnx-community/<model>/
 */

const https = require('https')
const http = require('http')
const fs = require('fs')
const path = require('path')

const MIRROR_HOSTS = [
  'https://hf-mirror.com/',
  'https://huggingface.co/',
]
const PATH_TEMPLATE = '{model}/resolve/main/'

const MODELS = {
  'whisper-tiny': {
    id: 'onnx-community/whisper-tiny',
    files: [
      'config.json',
      'tokenizer.json',
      'tokenizer_config.json',
      'special_tokens_map.json',
      'preprocessor_config.json',
      'generation_config.json',
      'onnx/encoder_model.onnx',
      'onnx/decoder_model_merged_q4.onnx',
    ],
  },
  'whisper-base': {
    id: 'onnx-community/whisper-base',
    files: [
      'config.json',
      'tokenizer.json',
      'tokenizer_config.json',
      'special_tokens_map.json',
      'preprocessor_config.json',
      'generation_config.json',
      'onnx/encoder_model.onnx',
      'onnx/decoder_model_merged_q4.onnx',
    ],
  },
  'whisper-small': {
    id: 'onnx-community/whisper-small',
    files: [
      'config.json',
      'tokenizer.json',
      'tokenizer_config.json',
      'special_tokens_map.json',
      'preprocessor_config.json',
      'generation_config.json',
      'onnx/encoder_model.onnx',
      'onnx/decoder_model_merged_q4.onnx',
    ],
  },
}

const modelsToDownload = process.argv.slice(2)
const selectedModels = modelsToDownload.length > 0
  ? modelsToDownload.filter(m => MODELS[m])
  : Object.keys(MODELS)

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(dest)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const file = fs.createWriteStream(dest)

    function followRedirect(currentUrl, redirectCount = 0) {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'))
        return
      }

      const client = currentUrl.startsWith('https') ? https : http

      client.get(currentUrl, { headers: { 'User-Agent': 'transformers.js' } }, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          const redirectUrl = new URL(response.headers.location, currentUrl).href
          followRedirect(redirectUrl, redirectCount + 1)
          return
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`))
          return
        }

        const totalSize = parseInt(response.headers['content-length'], 10)
        let downloadedSize = 0

        response.on('data', (chunk) => {
          downloadedSize += chunk.length
          if (totalSize) {
            const pct = ((downloadedSize / totalSize) * 100).toFixed(1)
            const mb = (downloadedSize / 1024 / 1024).toFixed(1)
            const totalMb = (totalSize / 1024 / 1024).toFixed(1)
            process.stdout.write(`\r  ${path.basename(dest)}: ${pct}% (${mb}/${totalMb}MB)`)
          }
        })

        response.pipe(file)

        file.on('finish', () => {
          file.close()
          process.stdout.write('\n')
          resolve()
        })
      }).on('error', (err) => {
        try { fs.unlinkSync(dest) } catch {}
        reject(err)
      })
    }

    followRedirect(url)
  })
}

async function tryDownloadFromMirrors(modelId, file, outputDir) {
  const dest = path.join(outputDir, file)

  if (fs.existsSync(dest)) {
    const stats = fs.statSync(dest)
    if (stats.size > 1024) {
      console.log(`  ✓ ${file} (already exists, ${(stats.size / 1024 / 1024).toFixed(1)}MB)`)
      return true
    }
  }

  for (const mirror of MIRROR_HOSTS) {
    const url = mirror + PATH_TEMPLATE.replace('{model}', modelId) + file
    console.log(`  Downloading ${file} from ${new URL(url).hostname}...`)
    try {
      await downloadFile(url, dest)
      const stats = fs.statSync(dest)
      console.log(`  ✓ ${file} (${(stats.size / 1024 / 1024).toFixed(1)}MB)`)
      return true
    } catch (err) {
      console.log(`  ✗ ${new URL(url).hostname} failed: ${err.message}`)
      try { fs.unlinkSync(dest) } catch {}
    }
  }

  console.log(`  ✗ All mirrors failed for ${file}`)
  return false
}

async function downloadModel(modelName) {
  const model = MODELS[modelName]
  const outputDir = path.join(__dirname, '..', 'models', 'onnx-community', modelName)

  console.log(`\n=== Downloading ${modelName} (${model.id}) ===\n`)

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  let failed = 0
  for (const file of model.files) {
    const ok = await tryDownloadFromMirrors(model.id, file, outputDir)
    if (!ok) { failed++ }
  }

  if (failed > 0) {
    console.log(`\n⚠ ${failed} file(s) failed for ${modelName}. At runtime, these will be downloaded automatically.`)
  } else {
    console.log(`\n✓ ${modelName} downloaded successfully!`)
  }

  return failed
}

async function main() {
  console.log('Whisper Model Downloader')
  console.log('========================')
  console.log(`Models to download: ${selectedModels.join(', ')}`)

  let totalFailed = 0
  for (const modelName of selectedModels) {
    totalFailed += await downloadModel(modelName)
  }

  console.log('\n========================')
  if (totalFailed > 0) {
    console.log(`⚠ ${totalFailed} file(s) failed in total.`)
  } else {
    console.log('✓ All models downloaded successfully!')
  }
  console.log('\nModel files location: models/onnx-community/')
}

main().catch(console.error)
