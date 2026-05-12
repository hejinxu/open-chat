import type { StorageProvider } from './types'
import { LocalStorageProvider } from './local-storage'
import type { RemoteStorageProvider } from './remote-storage'

export type StorageBackend = 'local' | 'sqlite' | 'postgres'

let _instance: StorageProvider | null = null

export function createStorageProvider(): StorageProvider {
  if (!_instance) {
    const backend = (process.env.NEXT_PUBLIC_STORAGE_BACKEND || 'local') as StorageBackend

    if (backend === 'local') {
      _instance = new LocalStorageProvider()
    } else if (backend === 'sqlite' || backend === 'postgres') {
      const isServer = typeof window === 'undefined'
      if (isServer) {
        // On server: use database directly
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { getDatabaseProvider } = require('../db')
        const db = getDatabaseProvider()
        _instance = db as unknown as StorageProvider
      } else {
        // On client: use HTTP API
        const { RemoteStorageProvider: RSP } = require('./remote-storage')
        _instance = new RSP()
      }
    } else {
      _instance = new LocalStorageProvider()
    }
  }
  return _instance
}

export function getStorageBackend(): StorageBackend {
  return (process.env.NEXT_PUBLIC_STORAGE_BACKEND || 'local') as StorageBackend
}
