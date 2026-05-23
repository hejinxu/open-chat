import type { DatabaseProvider } from '@/lib/db/types'

let _hasUsers: boolean | null = null

export function getHasUsers(): boolean | null {
  return _hasUsers
}

export function setHasUsers(value: boolean): void {
  _hasUsers = value
}

export async function ensureHasUsers(db: DatabaseProvider): Promise<boolean> {
  if (_hasUsers !== null) {
    return _hasUsers
  }
  try {
    const users = await db.getUsers()
    _hasUsers = users.length > 0
  }
  catch {
    _hasUsers = false
  }
  return _hasUsers
}
