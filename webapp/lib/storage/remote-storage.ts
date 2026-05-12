import type { ConversationRecord, MessageRecord, StorageProvider } from './types'
import { LocalStorageProvider } from './local-storage'
import { getTabLock } from './tab-lock'

const TIMEOUT_MS = 10000  // 10 秒超时

let notifyWarning: (msg: string) => void = (msg) => console.warn(msg)
let notifyError: (msg: string) => void = (msg) => console.error(msg)

export function setStorageNotifyCallbacks(opts: { warn?: (msg: string) => void; error?: (msg: string) => void }) {
  if (opts.warn) notifyWarning = opts.warn
  if (opts.error) notifyError = opts.error
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Request timeout')), ms)),
  ])
}

export class RemoteStorageProvider implements StorageProvider {
  private localStorageProvider = new LocalStorageProvider()
  private baseUrl = '/api/storage'

  // 读操作：优先远程，失败降级本地
  async getConversations(): Promise<ConversationRecord[]> {
    try {
      const res = await withTimeout(
        fetch(`${this.baseUrl}/conversations`),
        TIMEOUT_MS
      )
      if (!res.ok) throw new Error('API failed')
      const data = await res.json()
      if (!data.success) throw new Error(data.error)

      // 更新 localStorage 缓存
      for (const conv of data.data) {
        await this.localStorageProvider.saveConversation(conv)
      }

      return data.data
    } catch (error) {
      console.warn('Remote storage failed, falling back to localStorage:', error)
      notifyWarning('远程存储不可用，使用本地数据')
      return this.localStorageProvider.getConversations()
    }
  }

  async getConversationById(id: string): Promise<ConversationRecord | null> {
    try {
      const res = await withTimeout(
        fetch(`${this.baseUrl}/conversations?id=${encodeURIComponent(id)}`),
        TIMEOUT_MS
      )
      if (!res.ok) throw new Error('API failed')
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      return data.data
    } catch (error) {
      console.warn('Remote storage failed, falling back to localStorage:', error)
      return this.localStorageProvider.getConversationById(id)
    }
  }

  // 写操作：优先远程，成功后写本地
  async saveConversation(conv: ConversationRecord): Promise<void> {
    const lock = getTabLock()
    const hasLock = await lock.acquireLock()
    if (!hasLock) {
      throw new Error('获取写锁超时')
    }

    try {
      const res = await withTimeout(
        fetch(`${this.baseUrl}/conversations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(conv),
        }),
        TIMEOUT_MS
      )
      if (!res.ok) throw new Error('API failed')

      // 成功后写本地缓存
      await this.localStorageProvider.saveConversation(conv)
    } catch (error) {
      console.error('Failed to save to remote:', error)
      notifyError('保存到远程失败，已降级到本地存储')
      // 降级到本地
      await this.localStorageProvider.saveConversation(conv)
      throw error
    } finally {
      lock.releaseLock()
    }
  }

  // 删除操作：优先删远程，成功后删本地
  async deleteConversation(id: string): Promise<void> {
    const lock = getTabLock()
    const hasLock = await lock.acquireLock()
    if (!hasLock) {
      throw new Error('获取写锁超时')
    }

    try {
      const res = await withTimeout(
        fetch(`${this.baseUrl}/conversations`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        }),
        TIMEOUT_MS
      )
      if (!res.ok) throw new Error('API failed')

      // 成功后删本地
      await this.localStorageProvider.deleteConversation(id)
    } catch (error) {
      console.error('Failed to delete from remote:', error)
      notifyError('删除远程数据失败，本地数据已保留')
      throw error
    } finally {
      lock.releaseLock()
    }
  }

  async getMessages(conversationId: string): Promise<MessageRecord[]> {
    try {
      const res = await withTimeout(
        fetch(`${this.baseUrl}/messages?conversation_id=${encodeURIComponent(conversationId)}`),
        TIMEOUT_MS
      )
      if (!res.ok) throw new Error('API failed')
      const data = await res.json()
      if (!data.success) throw new Error(data.error)

      // 更新 localStorage 缓存
      for (const msg of data.data) {
        await this.localStorageProvider.saveMessage(msg)
      }

      return data.data
    } catch (error) {
      console.warn('Remote storage failed, falling back to localStorage:', error)
      notifyWarning('远程存储不可用，使用本地数据')
      return this.localStorageProvider.getMessages(conversationId)
    }
  }

  async saveMessage(msg: MessageRecord): Promise<void> {
    const lock = getTabLock()
    const hasLock = await lock.acquireLock()
    if (!hasLock) {
      throw new Error('获取写锁超时')
    }

    try {
      const res = await withTimeout(
        fetch(`${this.baseUrl}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(msg),
        }),
        TIMEOUT_MS
      )
      if (!res.ok) throw new Error('API failed')

      // 成功后写本地缓存
      await this.localStorageProvider.saveMessage(msg)
    } catch (error) {
      console.error('Failed to save to remote:', error)
      notifyError('保存到远程失败，已降级到本地存储')
      // 降级到本地
      await this.localStorageProvider.saveMessage(msg)
      throw error
    } finally {
      lock.releaseLock()
    }
  }

  async deleteMessages(conversationId: string): Promise<void> {
    const lock = getTabLock()
    const hasLock = await lock.acquireLock()
    if (!hasLock) {
      throw new Error('获取写锁超时')
    }

    try {
      const res = await withTimeout(
        fetch(`${this.baseUrl}/messages`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation_id: conversationId }),
        }),
        TIMEOUT_MS
      )
      if (!res.ok) throw new Error('API failed')

      // 成功后删本地
      await this.localStorageProvider.deleteMessages(conversationId)
    } catch (error) {
      console.error('Failed to delete from remote:', error)
      notifyError('删除远程数据失败，本地数据已保留')
      throw error
    } finally {
      lock.releaseLock()
    }
  }

  async deleteMessagesByIds(ids: string[]): Promise<void> {
    const lock = getTabLock()
    const hasLock = await lock.acquireLock()
    if (!hasLock) {
      throw new Error('获取写锁超时')
    }

    try {
      const res = await withTimeout(
        fetch(`${this.baseUrl}/messages`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids }),
        }),
        TIMEOUT_MS
      )
      if (!res.ok) throw new Error('API failed')

      // 成功后删本地
      await this.localStorageProvider.deleteMessagesByIds(ids)
    } catch (error) {
      console.error('Failed to delete from remote:', error)
      notifyError('删除远程数据失败，本地数据已保留')
      throw error
    } finally {
      lock.releaseLock()
    }
  }
}
