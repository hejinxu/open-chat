#!/usr/bin/env node

/**
 * Download FunASR ONNX model files from ModelScope.
 *
 * Usage:
 *   node scripts/download-funasr-model.js
 *
 * Model files are saved to models/iic/
 */

const https = require('https')
const http = require('http')
const fs = require('fs')
const path = require('path')

const MODELS = {
  'speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-onnx': {
    files: [
      'model.onnx',
      'config.json',
      'tokenizer.json',
      'tokenizer_config.json',
    ],
  },
  'speech_fsmn_vad_zh-cn-16k-common-onnx': {
    files: [
      'model.onnx',
      'config.json',
    ],
  },
  'punc_ct-transformer_cn-en-common-vocab471067-large-onnx': {
    files: [
      'model.onnx',
      'config.json',
      'tokenizer.json',
      'tokenizer_config.json',
    ],
  },
}

const OUTPUT_BASE = path.join(__dirname, '..', 'models', 'iic')

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(dest)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const file = fs.createWriteStream(dest)

    function followRedirect(currentUrl, redirectCount = 0) {
      if (redirectCount > 10) {
        reject(new Error('Too many redirects'))
        return
      }

      const client = currentUrl.startsWith('https') ? https : http

      client.get(currentUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 60000,
      }, (response) => {
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

async function downloadFromModelScope(modelName, file, outputDir) {
  const dest = path.join(outputDir, file)

  if (fs.existsSync(dest)) {
    const stats = fs.statSync(dest)
    if (stats.size > 1024) {
      console.log(`  ✓ ${file} (already exists, ${(stats.size / 1024 / 1024).toFixed(1)}MB)`)
      return true
    }
  }

  const urls = [
    `https://modelscope.cn/models/iic/${modelName}/resolve/master/${file}`,
    `https://www.modelscope.cn/models/iic/${modelName}/resolve/master/${file}`,
  ]

  for (const url of urls) {
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

  return false
}

async function downloadModel(modelName) {
  const model = MODELS[modelName]
  const outputDir = path.join(OUTPUT_BASE, modelName)

  console.log(`\n=== Downloading ${modelName} ===\n`)

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  let failed = 0
  for (const file of model.files) {
    const ok = await downloadFromModelScope(modelName, file, outputDir)
    if (!ok) { failed++ }
  }

  if (failed > 0) {
    console.log(`\n⚠ ${failed} file(s) failed for ${modelName}.`)
  } else {
    console.log(`\n✓ ${modelName} downloaded successfully!`)
  }

  return failed
}

async function main() {
  console.log('FunASR Model Downloader')
  console.log('=======================')
  console.log('Downloading from ModelScope (modelscope.cn)...\n')

  let totalFailed = 0
  for (const modelName of Object.keys(MODELS)) {
    totalFailed += await downloadModel(modelName)
  }

  console.log('\n=======================')
  if (totalFailed > 0) {
    console.log(`⚠ ${totalFailed} file(s) failed in total.`)
  } else {
    console.log('✓ All FunASR models downloaded successfully!')
  }
  console.log('\nModel files location: models/iic/')
}

main().catch(console.error)
