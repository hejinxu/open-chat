const LOCK_KEY = 'open_chat_tab_lock'
const LOCK_TIMEOUT = 5000  // 5 秒超时
const MAX_WAIT_TIME = 10000  // 最大等待 10 秒
const RETRY_INTERVAL = 100  // 重试间隔 100ms

export class TabLock {
  private tabId: string
  private lockInterval: NodeJS.Timeout | null = null

  constructor() {
    this.tabId = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  /**
   * 尝试获取锁
   * @returns 是否成功获取锁
   */
  async acquireLock(): Promise<boolean> {
    const startTime = Date.now()

    while (true) {
      const lockData = this.getLock()

      // 无锁或锁已过期或自己持有锁
      if (!lockData || lockData.tabId === this.tabId || Date.now() - lockData.timestamp > LOCK_TIMEOUT) {
        this.setLock()

        // 定期续期
        this.lockInterval = setInterval(() => {
          this.setLock()
        }, LOCK_TIMEOUT / 2)

        return true
      }

      // 超过最大等待时间
      if (Date.now() - startTime > MAX_WAIT_TIME) {
        return false
      }

      // 等待后重试
      await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL))
    }
  }

  /**
   * 释放锁
   */
  releaseLock(): void {
    if (this.lockInterval) {
      clearInterval(this.lockInterval)
      this.lockInterval = null
    }
    // 只有自己持有时才释放
    const lockData = this.getLock()
    if (lockData && lockData.tabId === this.tabId) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(LOCK_KEY)
      }
    }
  }

  private getLock(): { tabId: string; timestamp: number } | null {
    if (typeof window === 'undefined') return null
    try {
      const data = localStorage.getItem(LOCK_KEY)
      return data ? JSON.parse(data) : null
    } catch {
      return null
    }
  }

  private setLock(): void {
    if (typeof window === 'undefined') return
    localStorage.setItem(LOCK_KEY, JSON.stringify({
      tabId: this.tabId,
      timestamp: Date.now(),
    }))
  }
}

// 全局单例
let _instance: TabLock | null = null

export function getTabLock(): TabLock {
  if (!_instance) {
    _instance = new TabLock()
  }
  return _instance
}
