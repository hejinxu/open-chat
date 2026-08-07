// In-memory captcha store with TTL expiration
// For production with multiple instances, use Redis or a shared store

interface CaptchaEntry {
  text: string
  expiresAt: number
}

// 挂载到 globalThis，避免 Next.js Turbopack HMR 模块重载时 store 被重置成空 Map，
// 导致验证码生成与校验落在不同模块实例而"验证码错误"（同 ToolRegistry pendingToolCalls 方案）
const g = globalThis as any
if (!g.__openchat_captchaStore) {
  g.__openchat_captchaStore = new Map<string, CaptchaEntry>()
}
const store: Map<string, CaptchaEntry> = g.__openchat_captchaStore

const CAPTCHA_TTL_MS = 5 * 60 * 1000 // 5 minutes

// Generate a unique captcha ID
export function generateCaptchaId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

// Save captcha text with expiration
export function saveCaptcha(captchaId: string, text: string): void {
  store.set(captchaId, {
    text: text.toLowerCase(),
    expiresAt: Date.now() + CAPTCHA_TTL_MS,
  })
  cleanup()
}

// Verify and consume captcha (one-time use)
export function verifyCaptcha(captchaId: string, input: string): boolean {
  const entry = store.get(captchaId)
  if (!entry) {
    return false
  }

  // Delete immediately (one-time use)
  store.delete(captchaId)

  // Check expiration
  if (Date.now() > entry.expiresAt) {
    return false
  }

  // Compare (case-insensitive)
  return entry.text === input.toLowerCase()
}

// Remove expired entries
function cleanup(): void {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (now > entry.expiresAt) {
      store.delete(key)
    }
  }
}
