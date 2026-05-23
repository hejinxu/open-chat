import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { v4 } from 'uuid'
import { getDatabaseProvider } from '@/lib/db'
import { hashPassword } from '@/lib/auth/password'

export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-auth-user-id')
  const role = request.headers.get('x-auth-user-role')

  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const db = getDatabaseProvider()
    const users = await db.getUsers()
    return NextResponse.json({ users })
  }
  catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-auth-user-id')
  const role = request.headers.get('x-auth-user-role')

  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { name, identifier, password, role: userRole } = body

    if (!name || !identifier || !password) {
      return NextResponse.json({ error: 'Name, identifier, and password are required' }, { status: 400 })
    }

    const db = getDatabaseProvider()

    // Check identifier uniqueness
    const existing = await db.getUserAccountByIdentifier(identifier)
    if (existing) {
      return NextResponse.json({ error: 'Identifier already taken' }, { status: 409 })
    }

    const now = Math.floor(Date.now() / 1000)
    const newUserId = v4()

    await db.saveUser({
      id: newUserId,
      name,
      role: userRole || 'user',
      org_id: null,
      is_enabled: true,
      created_at: now,
      updated_at: now,
    })

    const passwordHash = await hashPassword(password)
    await db.saveUserAccount({
      id: v4(),
      user_id: newUserId,
      login_type: 'username',
      login_identifier: identifier,
      password_hash: passwordHash,
      is_primary: true,
      is_verified: true,
      created_at: now,
    })

    return NextResponse.json({ user: { id: newUserId, name, role: userRole || 'user' } })
  }
  catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const userId = request.headers.get('x-auth-user-id')
  const role = request.headers.get('x-auth-user-role')

  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { id, name, role: userRole, is_enabled } = body

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    const db = getDatabaseProvider()
    const user = await db.getUserById(id)
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    await db.saveUser({
      ...user,
      name: name ?? user.name,
      role: userRole ?? user.role,
      is_enabled: is_enabled ?? user.is_enabled,
      updated_at: Math.floor(Date.now() / 1000),
    })

    return NextResponse.json({ success: true })
  }
  catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const userId = request.headers.get('x-auth-user-id')
  const role = request.headers.get('x-auth-user-role')

  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    if (id === userId) {
      return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 })
    }

    const db = getDatabaseProvider()
    await db.deleteUser(id)

    return NextResponse.json({ success: true })
  }
  catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
