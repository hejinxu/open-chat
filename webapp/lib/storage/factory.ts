import type { StorageProvider } from './types'

export type StorageBackend = 'sqlite' | 'postgres'

let _instance: StorageProvider | null = null

export function createStorageProvider(): StorageProvider {
  if (!_instance) {
    const isServer = typeof window === 'undefined'
    if (isServer) {
      // On server: use database directly
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getDatabaseProvider } = require('../db')
      const db = getDatabaseProvider()
      _instance = db as unknown as StorageProvider
    }
    else {
      // On client: use HTTP API
      const { RemoteStorageProvider: RSP } = require('./remote-storage')
      _instance = new RSP()
    }
  }
  return _instance!
}

export function getStorageBackend(): StorageBackend {
  return (process.env.NEXT_PUBLIC_STORAGE_BACKEND || 'sqlite') as StorageBackend
}
