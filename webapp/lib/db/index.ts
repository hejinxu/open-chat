import type { DatabaseProvider } from './types'
import { SqliteProvider } from './sqlite'

let _instance: DatabaseProvider | null = null

export function getDatabaseProvider(): DatabaseProvider {
  if (!_instance) {
    const backend = process.env.STORAGE_BACKEND || process.env.NEXT_PUBLIC_STORAGE_BACKEND || 'local'

    switch (backend) {
      case 'sqlite':
        _instance = new SqliteProvider()
        break
      case 'postgres':
        // TODO: Implement PostgreSQL provider
        throw new Error('PostgreSQL provider not implemented yet')
      default:
        throw new Error(`Unknown storage backend: ${backend}. Use 'sqlite' or 'postgres'.`)
    }
  }
  return _instance
}

export type { DatabaseProvider } from './types'
