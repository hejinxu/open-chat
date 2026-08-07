import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDatabaseProvider } from '@/lib/db'
import { requireAdmin } from '@/app/api/utils/auth-guard'

export async function GET(request: NextRequest) {
  const authError = requireAdmin(request)
  if (authError) { return authError }

  try {
    const db = getDatabaseProvider()
    const configs = await db.getSystemConfig()
    return NextResponse.json({ configs })
  }
  catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const authError = requireAdmin(request)
  if (authError) { return authError }

  try {
    const body = await request.json()
    const { key, value } = body

    if (!key) {
      return NextResponse.json({ error: 'key is required' }, { status: 400 })
    }

    const db = getDatabaseProvider()
    const existing = await db.getSystemConfigByKey(key)
    if (!existing) {
      return NextResponse.json({ error: 'Config key not found' }, { status: 404 })
    }

    await db.saveSystemConfig({
      key,
      value: String(value ?? ''),
      description: existing.description,
      updated_at: Math.floor(Date.now() / 1000),
    })

    return NextResponse.json({ success: true })
  }
  catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
