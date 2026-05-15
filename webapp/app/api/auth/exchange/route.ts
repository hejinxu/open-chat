import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { v4 } from 'uuid'
import { getDatabaseProvider } from '@/lib/db'
import { comparePassword } from '@/lib/auth/password'
import { signJwtWithExpiry } from '@/lib/auth/jwt'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { app_id, app_secret, user_id, user_email, user_name } = body

    if (!app_id || !app_secret || !user_id) {
      return NextResponse.json({ error: 'app_id, app_secret, and user_id are required' }, { status: 400 })
    }

    const db = getDatabaseProvider()
    await db.ensureReady()

    // Find integration by app_id
    const integration = await db.getAppIntegrationByAppId(app_id)
    if (!integration) {
      return NextResponse.json({ error: 'Invalid app_id or app_secret' }, { status: 401 })
    }

    if (!integration.is_enabled) {
      return NextResponse.json({ error: 'Integration is disabled' }, { status: 403 })
    }

    // Verify app_secret
    if (!integration.app_secret) {
      return NextResponse.json({ error: 'This integration does not have app_secret configured' }, { status: 403 })
    }

    const validSecret = await comparePassword(app_secret, integration.app_secret)
    if (!validSecret) {
      return NextResponse.json({ error: 'Invalid app_id or app_secret' }, { status: 401 })
    }

    // Find or create user for this integration
    const loginIdentifier = `${app_id}:${user_id}`
    let user = null
    const existingAccount = await db.getUserAccountByIdentifier(loginIdentifier)

    if (existingAccount) {
      user = await db.getUserById(existingAccount.user_id)
    }

    if (!user) {
      const now = Math.floor(Date.now() / 1000)
      const userId = v4()

      await db.saveUser({
        id: userId,
        name: user_name || user_email || user_id,
        role: 'user',
        org_id: null,
        is_enabled: true,
        created_at: now,
        updated_at: now,
      })

      await db.saveUserAccount({
        id: v4(),
        user_id: userId,
        login_type: 'username',
        login_identifier: loginIdentifier,
        password_hash: '',
        is_primary: true,
        is_verified: true,
        created_at: now,
      })

      // Also create email account if provided
      if (user_email) {
        const emailExists = await db.getUserAccountByIdentifier(user_email)
        if (!emailExists) {
          await db.saveUserAccount({
            id: v4(),
            user_id: userId,
            login_type: 'email',
            login_identifier: user_email,
            password_hash: '',
            is_primary: false,
            is_verified: false,
            created_at: now,
          })
        }
      }

      user = await db.getUserById(userId)
    }

    if (!user || !user.is_enabled) {
      return NextResponse.json({ error: 'User creation failed or user is disabled' }, { status: 500 })
    }

    // Sign JWT with 8-hour expiry
    const token = await signJwtWithExpiry(
      {
        sub: user.id,
        type: 'user',
        role: user.role,
        app_id,
      },
      8 * 60 * 60, // 8 hours
    )

    return NextResponse.json({
      access_token: token,
      token_type: 'Bearer',
      expires_in: 8 * 60 * 60,
      user: { id: user.id, name: user.name, role: user.role },
    })
  }
  catch (error: any) {
    console.error('Exchange error:', error)
    return NextResponse.json({ error: error.message || 'Exchange failed' }, { status: 500 })
  }
}
