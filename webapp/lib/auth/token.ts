import { v4 } from 'uuid'
import bcryptjs from 'bcryptjs'

export function generateApiKey(): string {
  // Format: sk-<32 hex chars from uuid>
  const raw = v4().replace(/-/g, '')
  return `sk-${raw}`
}

export function hashApiKey(key: string): Promise<string> {
  return bcryptjs.hash(key, 10)
}

export async function verifyApiKey(plainKey: string, hash: string): Promise<boolean> {
  return bcryptjs.compare(plainKey, hash)
}

export function getKeyPrefix(key: string): string {
  return key.slice(0, 11)
}
