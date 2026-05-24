import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { v4 } from 'uuid'
import { getDatabaseProvider } from '@/lib/db'
import { requireAdmin } from '@/app/api/utils/auth-guard'

export async function GET(request: NextRequest) {
  const authError = requireAdmin(request)
  if (authError) return authError

  try {
    const db = getDatabaseProvider()
    const integrations = await db.getAppIntegrations()
    return NextResponse.json({ integrations })
  }
  catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authError = requireAdmin(request)
  if (authError) return authError

  try {
    const body = await request.json()
    const { name, description } = body

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const db = getDatabaseProvider()
    const now = Math.floor(Date.now() / 1000)
    const id = v4()
    const appId = `app-${v4().replace(/-/g, '').slice(0, 12)}`

    await db.saveAppIntegration({
      id,
      name,
      description: description || '',
      app_id: appId,
      app_secret: '',
      is_enabled: true,
      created_at: now,
      updated_at: now,
    })

    return NextResponse.json({ integration: { id, name, app_id: appId } })
  }
  catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const authError = requireAdmin(request)
  if (authError) return authError

  try {
    const body = await request.json()
    const { id, name, description, is_enabled } = body

    if (!id) {
      return NextResponse.json({ error: 'Integration ID is required' }, { status: 400 })
    }

    const db = getDatabaseProvider()
    const integration = await db.getAppIntegrationById(id)
    if (!integration) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 })
    }

    await db.saveAppIntegration({
      ...integration,
      name: name ?? integration.name,
      description: description ?? integration.description,
      is_enabled: is_enabled ?? integration.is_enabled,
      updated_at: Math.floor(Date.now() / 1000),
    })

    return NextResponse.json({ success: true })
  }
  catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const authError = requireAdmin(request)
  if (authError) return authError

  try {
    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ error: 'Integration ID is required' }, { status: 400 })
    }

    const db = getDatabaseProvider()
    await db.deleteAppIntegration(id)

    return NextResponse.json({ success: true })
  }
  catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
