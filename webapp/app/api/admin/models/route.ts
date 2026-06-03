import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDatabaseProvider } from '@/lib/db'
import type { Model } from '@/types/model'
import { requireAdmin } from '@/app/api/utils/auth-guard'
import { reloadConfig } from '@/app/api/utils/agents'

export async function GET(request: NextRequest) {
  const authError = requireAdmin(request)
  if (authError) { return authError }

  try {
    const db = getDatabaseProvider()
    const { searchParams } = new URL(request.url)
    const providerId = searchParams.get('provider_id')

    let models: Model[]
    if (providerId) {
      models = await db.getModelsByProvider(providerId)
    }
    else {
      models = await db.getModels()
    }

    return NextResponse.json({ models })
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
    const { provider_id, model_name, display_name, description, context_window, max_output_tokens, capabilities, pricing_input, pricing_output, default_params, is_enabled } = body

    if (!provider_id) {
      return NextResponse.json({ error: 'Provider is required' }, { status: 400 })
    }
    if (!model_name) {
      return NextResponse.json({ error: 'Model name is required' }, { status: 400 })
    }
    if (!display_name) {
      return NextResponse.json({ error: 'Display name is required' }, { status: 400 })
    }

    const db = getDatabaseProvider()
    const provider = await db.getModelProviderById(provider_id)
    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
    }

    const slug = model_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 20)
    const rand = Math.random().toString(16).slice(2, 6)
    const id = `model-${slug}-${rand}`

    const now = Math.floor(Date.now() / 1000)
    const model: Model = {
      id,
      provider_id,
      model_name,
      display_name,
      description: description || '',
      context_window: context_window || null,
      max_output_tokens: max_output_tokens || null,
      capabilities: capabilities || [],
      pricing_input: pricing_input || null,
      pricing_output: pricing_output || null,
      default_params: default_params || {},
      is_enabled: is_enabled !== false,
      created_at: now,
      updated_at: now,
    }

    await db.saveModel(model)
    reloadConfig()

    return NextResponse.json({ model })
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
    const { id, provider_id, model_name, display_name, description, context_window, max_output_tokens, capabilities, pricing_input, pricing_output, default_params, is_enabled } = body

    if (!id) {
      return NextResponse.json({ error: 'Model ID is required' }, { status: 400 })
    }

    const db = getDatabaseProvider()
    const existing = await db.getModelById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 })
    }

    if (provider_id && provider_id !== existing.provider_id) {
      const provider = await db.getModelProviderById(provider_id)
      if (!provider) {
        return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
      }
    }

    const now = Math.floor(Date.now() / 1000)
    const model: Model = {
      ...existing,
      provider_id: provider_id ?? existing.provider_id,
      model_name: model_name ?? existing.model_name,
      display_name: display_name ?? existing.display_name,
      description: description !== undefined ? description : existing.description,
      context_window: context_window !== undefined ? (context_window || null) : existing.context_window,
      max_output_tokens: max_output_tokens !== undefined ? (max_output_tokens || null) : existing.max_output_tokens,
      capabilities: capabilities !== undefined ? capabilities : existing.capabilities,
      pricing_input: pricing_input !== undefined ? (pricing_input || null) : existing.pricing_input,
      pricing_output: pricing_output !== undefined ? (pricing_output || null) : existing.pricing_output,
      default_params: default_params !== undefined ? default_params : existing.default_params,
      is_enabled: is_enabled !== undefined ? !!is_enabled : existing.is_enabled,
      updated_at: now,
    }

    await db.saveModel(model)
    reloadConfig()

    return NextResponse.json({ model })
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
      return NextResponse.json({ error: 'Model ID is required' }, { status: 400 })
    }

    const db = getDatabaseProvider()
    const existing = await db.getModelById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 })
    }

    await db.deleteModel(id)
    reloadConfig()

    return NextResponse.json({ success: true })
  }
  catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
