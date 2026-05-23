import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

let authConfig = null

/**
 * Load auth config from config/auth.json
 */
export function loadAuthConfig() {
  if (authConfig) return authConfig

  const configPath = resolve(__dirname, '..', 'config', 'auth.json')
  try {
    const raw = readFileSync(configPath, 'utf-8')
    authConfig = JSON.parse(raw)
    console.log(`[Auth] Loaded config: ${authConfig.tokens?.length || 0} tokens`)
  }
  catch (e) {
    if (e.code === 'ENOENT') {
      console.warn('[Auth] config/auth.json not found, no tokens configured')
      authConfig = { tokens: [] }
    }
    else {
      console.error('[Auth] Failed to load config/auth.json:', e.message)
      authConfig = { tokens: [] }
    }
  }

  return authConfig
}

/**
 * Reload auth config (call after file changes)
 */
export function reloadAuthConfig() {
  authConfig = null
  return loadAuthConfig()
}

/**
 * Self-verification: match token against local config
 * @param {string} token - The token to verify
 * @returns {{ success: boolean, code: number, msg: string, data?: object }}
 */
export function verifySelf(token) {
  const config = loadAuthConfig()
  const tokens = config.tokens || []

  const match = tokens.find(t => t.token === token)
  if (!match) {
    return { success: false, code: 401, msg: 'Invalid token' }
  }

  if (match.enabled === false) {
    return { success: false, code: 403, msg: 'Token is disabled' }
  }

  return {
    success: true,
    code: 200,
    msg: 'ok',
    data: {
      id: match.name || 'local-user',
      name: match.name || 'Local User',
      role: 'user',
    },
  }
}

/**
 * Remote verification: forward token to external verification endpoint
 * @param {string} token - The token to verify
 * @param {string} endpoint - The verification endpoint URL
 * @param {number} timeout - Request timeout in ms
 * @returns {Promise<{ success: boolean, code: number, msg: string, data?: object }>}
 */
export async function verifyRemote(token, endpoint, timeout = 5000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      signal: controller.signal,
    })

    const body = await resp.json()

    if (body.success && resp.ok) {
      return {
        success: true,
        code: body.code || 200,
        msg: body.msg || 'ok',
        data: body.data,
      }
    }

    return {
      success: false,
      code: body.code || resp.status || 401,
      msg: body.msg || 'Verification failed',
    }
  }
  catch (e) {
    if (e.name === 'AbortError') {
      return { success: false, code: 504, msg: 'Verification timeout' }
    }
    return { success: false, code: 502, msg: 'Verification service unavailable: ' + e.message }
  }
  finally {
    clearTimeout(timer)
  }
}
