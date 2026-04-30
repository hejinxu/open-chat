import { spawn } from 'child_process'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FUNASR_PYTHON = process.env.FUNASR_PYTHON || 'python3'

let funasrProcess = null
let funasrRequestId = 0
const funasrPending = new Map()
let funasrAvailable = null

export async function checkFunASRAvailable() {
  if (funasrAvailable !== null) return funasrAvailable
  try {
    const { execSync } = await import('child_process')
    execSync(`${FUNASR_PYTHON} -c "import funasr"`, { timeout: 5000, stdio: 'ignore' })
    funasrAvailable = true
    console.log('[FunASR] Python funasr package found')
  } catch {
    funasrAvailable = false
    console.log('[FunASR] Python funasr package not found. FunASR models disabled.')
    console.log('[FunASR] Install with: pip install funasr torch torchaudio')
  }
  return funasrAvailable
}

export function startFunASRSidecar() {
  if (funasrProcess && !funasrProcess.killed) return true

  const scriptPath = resolve(__dirname, '..', 'funasr_server.py')
  try {
    funasrProcess = spawn(FUNASR_PYTHON, [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch (err) {
    console.error(`[FunASR] Failed to start process:`, err.message)
    funasrProcess = null
    return false
  }

  funasrProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim())
    for (const line of lines) {
      try {
        const result = JSON.parse(line)
        const pending = funasrPending.get(result.id)
        if (pending) {
          funasrPending.delete(result.id)
          if (result.error) {
            pending.reject(new Error(result.error))
          } else {
            pending.resolve(result.text || '')
          }
        }
      } catch {}
    }
  })

  funasrProcess.stderr.on('data', (data) => {
    const msg = data.toString().trim()
    if (msg) console.log(`[FunASR] ${msg}`)
  })

  funasrProcess.on('close', (code) => {
    console.log(`[FunASR] Process exited with code ${code}`)
    funasrProcess = null
    for (const [, pending] of funasrPending) {
      pending.reject(new Error('FunASR process exited'))
    }
    funasrPending.clear()
  })

  funasrProcess.on('error', (err) => {
    console.error(`[FunASR] Process error:`, err.message)
    funasrProcess = null
  })

  return true
}

export function callFunASR(audioData, modelName, sampleRate = 16000) {
  return new Promise(async (resolve, reject) => {
    const available = await checkFunASRAvailable()
    if (!available) {
      return reject(new Error('FunASR not available. Install with: pip install funasr torch torchaudio'))
    }

    if (!funasrProcess || funasrProcess.killed) {
      if (!startFunASRSidecar()) {
        return reject(new Error('Failed to start FunASR process'))
      }
    }

    const id = ++funasrRequestId
    funasrPending.set(id, { resolve, reject })

    const request = JSON.stringify({
      id,
      audio: Array.from(audioData),
      model: modelName,
      sample_rate: sampleRate,
    })

    try {
      funasrProcess.stdin.write(request + '\n')
    } catch (err) {
      funasrPending.delete(id)
      return reject(new Error(`Failed to write to FunASR: ${err.message}`))
    }

    setTimeout(() => {
      if (funasrPending.has(id)) {
        funasrPending.delete(id)
        reject(new Error('FunASR timeout'))
      }
    }, 30000)
  })
}
