import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { v4 } from 'uuid'
import { getDatabaseProvider } from '@/lib/db'
import { generateApiKey, hashApiKey, getKeyPrefix } from '@/lib/auth/token'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ integrationId: string }> },
) {
  const userId = request.headers.get('x-auth-user-id')
  const role = request.headers.get('x-auth-user-role')

  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const { integrationId } = await params
    const db = getDatabaseProvider()
    const keys = await db.getApiKeysByIntegration(integrationId)
    // Never return key_hash to client
    const sanitized = keys.map(k => ({
      id: k.id,
      integration_id: k.integration_id,
      name: k.name,
      key_prefix: k.key_prefix,
      allowed_agent_ids: k.allowed_agent_ids,
      expires_at: k.expires_at,
      last_used_at: k.last_used_at,
      is_enabled: k.is_enabled,
      created_at: k.created_at,
    }))
    return NextResponse.json({ keys: sanitized })
  }
  catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ integrationId: string }> },
) {
  const userId = request.headers.get('x-auth-user-id')
  const role = request.headers.get('x-auth-user-role')

  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const { integrationId } = await params
    const body = await request.json()
    const { name, allowed_agent_ids, expires_at } = body

    const db = getDatabaseProvider()

    // Verify integration exists
    const integration = await db.getAppIntegrationById(integrationId)
    if (!integration) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 })
    }

    const rawKey = generateApiKey()
    const keyPrefix = getKeyPrefix(rawKey)
    const keyHash = await hashApiKey(rawKey)
    const now = Math.floor(Date.now() / 1000)

    const keyId = v4()
    await db.saveApiKey({
      id: keyId,
      integration_id: integrationId,
      name: name || 'API Key',
      key_prefix: keyPrefix,
      key_hash: keyHash,
      allowed_agent_ids: allowed_agent_ids || ['*'],
      expires_at: expires_at || null,
      last_used_at: null,
      is_enabled: true,
      created_at: now,
    })

    // Return the full key ONCE — client must save it
    return NextResponse.json({
      key: {
        id: keyId,
        name: name || 'API Key',
        key: rawKey, // Full key, shown only once
        key_prefix: keyPrefix,
      },
    })
  }
  catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params: _params }: { params: Promise<{ integrationId: string }> },
) {
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
      return NextResponse.json({ error: 'Key ID is required' }, { status: 400 })
    }

    const db = getDatabaseProvider()
    await db.deleteApiKey(id)

    return NextResponse.json({ success: true })
  }
  catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
