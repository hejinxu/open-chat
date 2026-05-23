import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { v4 } from 'uuid'
import { getDatabaseProvider } from '@/lib/db'
import { hashPassword } from '@/lib/auth/password'
import { setHasUsers } from '@/lib/auth/setup-cache'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, identifier, password } = body

    if (!name || !identifier || !password) {
      return NextResponse.json({ error: 'Name, identifier, and password are required' }, { status: 400 })
    }

    const db = getDatabaseProvider()
    await db.ensureReady()

    // Check if any users exist — setup only works when users table is empty
    const users = await db.getUsers()
    if (users.length > 0) {
      return NextResponse.json({ error: 'Setup has already been completed' }, { status: 403 })
    }

    // Users table is empty — clean up all orphaned user_accounts records
    // (e.g. from manual DB edits where users were deleted but accounts weren't)
    const existingAccount = await db.getUserAccountByIdentifier(identifier)
    if (existingAccount) {
      await db.deleteUserAccount(existingAccount.id)
    }

    const now = Math.floor(Date.now() / 1000)
    const userId = v4()
    const accountId = v4()

    // Create user
    await db.saveUser({
      id: userId,
      name,
      role: 'admin',
      org_id: null,
      is_enabled: true,
      created_at: now,
      updated_at: now,
    })

    // Create user account
    const passwordHash = await hashPassword(password)
    await db.saveUserAccount({
      id: accountId,
      user_id: userId,
      login_type: 'username',
      login_identifier: identifier,
      password_hash: passwordHash,
      is_primary: true,
      is_verified: true,
      created_at: now,
    })

    // Update middleware cache — users now exist
    setHasUsers(true)

    return NextResponse.json({
      user: { id: userId, name, role: 'admin' },
    })
  }
  catch (error: any) {
    console.error('Setup error:', error)
    return NextResponse.json({ error: error.message || 'Setup failed' }, { status: 500 })
  }
}
