import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDatabaseProvider } from '@/lib/db'
import type { ModelProvider } from '@/types/model'
import { requireAdmin } from '@/app/api/utils/auth-guard'
import { reloadConfig } from '@/app/api/utils/agents'

export async function GET(request: NextRequest) {
  const authError = requireAdmin(request)
  if (authError) { return authError }

  try {
    const db = getDatabaseProvider()
    const providers = await db.getModelProviders()
    return NextResponse.json({ providers })
  }
  catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authError = requireAdmin(request)
  if (authError) { return authError }

  try {
    const body = await request.json()
    const { name, provider_type, api_key, api_base_url, is_enabled } = body

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (!provider_type) {
      return NextResponse.json({ error: 'Provider type is required' }, { status: 400 })
    }
    if (!api_base_url) {
      return NextResponse.json({ error: 'API base URL is required' }, { status: 400 })
    }

    const slug = name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 20)
      .replace(/-+$/, '')
    const rand = Math.random().toString(16).slice(2, 6)
    const id = `provider-${slug}-${rand}`

    const now = Math.floor(Date.now() / 1000)
    const provider: ModelProvider = {
      id,
      name,
      provider_type,
      api_key: api_key || '',
      api_base_url,
      is_enabled: is_enabled !== false,
      created_at: now,
      updated_at: now,
    }

    const db = getDatabaseProvider()
    await db.saveModelProvider(provider)
    reloadConfig()

    return NextResponse.json({ provider })
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
    const { id, name, provider_type, api_key, api_base_url, is_enabled } = body

    if (!id) {
      return NextResponse.json({ error: 'Provider ID is required' }, { status: 400 })
    }

    const db = getDatabaseProvider()
    const existing = await db.getModelProviderById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
    }

    const now = Math.floor(Date.now() / 1000)
    const provider: ModelProvider = {
      ...existing,
      name: name ?? existing.name,
      provider_type: provider_type ?? existing.provider_type,
      api_key: api_key !== undefined ? api_key : existing.api_key,
      api_base_url: api_base_url ?? existing.api_base_url,
      is_enabled: is_enabled !== undefined ? !!is_enabled : existing.is_enabled,
      updated_at: now,
    }

    await db.saveModelProvider(provider)
    reloadConfig()

    return NextResponse.json({ provider })
  }
  catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const authError = requireAdmin(request)
  if (authError) { return authError }

  try {
    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ error: 'Provider ID is required' }, { status: 400 })
    }

    const db = getDatabaseProvider()
    const existing = await db.getModelProviderById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
    }

    await db.deleteModelProvider(id)
    reloadConfig()

    return NextResponse.json({ success: true })
  }
  catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
