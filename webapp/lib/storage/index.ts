export type { ConversationRecord, MessageRecord, StorageProvider, AgentSessionState } from './types'
export { LocalStorageProvider } from './local-storage'
export { RemoteStorageProvider } from './remote-storage'
export { createStorageProvider, getStorageBackend, type StorageBackend } from './factory'
export { getTabLock, TabLock } from './tab-lock'

// 保持向后兼容的单例访问
import { createStorageProvider } from './factory'
import type { StorageProvider } from './types'

let _legacyInstance: StorageProvider | null = null

export function getStorageProvider(): StorageProvider {
  if (!_legacyInstance) {
    _legacyInstance = createStorageProvider()
  }
  return _legacyInstance
}
