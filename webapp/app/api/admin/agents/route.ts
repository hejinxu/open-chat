import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDatabaseProvider } from '@/lib/db'
import type { AgentRecord } from '@/types/agent'
import { reloadConfig } from '@/app/api/utils/agents'
import { requireAdmin } from '@/app/api/utils/auth-guard'

export async function GET(request: NextRequest) {
  const authError = requireAdmin(request)
  if (authError) return authError

  try {
    const db = getDatabaseProvider()
    const agents = await db.getAgents()
    return NextResponse.json({ agents })
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
    const { id, name, icon, description, backend_type, api_key, api_url, model, extra_config, is_default, is_enabled } = body

    if (!id || !name) {
      return NextResponse.json({ error: 'ID and name are required' }, { status: 400 })
    }

    const db = getDatabaseProvider()

    // Check ID uniqueness
    const existing = await db.getAgentById(id)
    if (existing) {
      return NextResponse.json({ error: 'Agent ID already exists' }, { status: 409 })
    }

    const now = Math.floor(Date.now() / 1000)
    const agent: AgentRecord = {
      id,
      name,
      icon: icon || '🤖',
      description: description || '',
      backend_type: backend_type || 'dify',
      api_key: api_key || '',
      api_url: api_url || '',
      model: model || null,
      extra_config: extra_config ? JSON.stringify(extra_config) : '{}',
      is_default: !!is_default,
      is_enabled: is_enabled !== false,
      created_at: now,
      updated_at: now,
    }

    // If this agent is set as default, clear other defaults first
    if (agent.is_default) {
      await db.setDefaultAgent(agent.id)
    }

    await db.saveAgent(agent)
    reloadConfig()

    return NextResponse.json({ agent })
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
    const { id, name, icon, description, backend_type, api_key, api_url, model, extra_config, is_default, is_enabled } = body

    if (!id) {
      return NextResponse.json({ error: 'Agent ID is required' }, { status: 400 })
    }

    const db = getDatabaseProvider()
    const existing = await db.getAgentById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const now = Math.floor(Date.now() / 1000)
    const agent: AgentRecord = {
      ...existing,
      name: name ?? existing.name,
      icon: icon ?? existing.icon,
      description: description ?? existing.description,
      backend_type: backend_type ?? existing.backend_type,
      api_key: api_key ?? existing.api_key,
      api_url: api_url ?? existing.api_url,
      model: model !== undefined ? (model || null) : existing.model,
      extra_config: extra_config !== undefined ? JSON.stringify(extra_config) : existing.extra_config,
      is_default: is_default !== undefined ? !!is_default : existing.is_default,
      is_enabled: is_enabled !== undefined ? !!is_enabled : existing.is_enabled,
      updated_at: now,
    }

    // If this agent is set as default, clear other defaults first
    if (agent.is_default && !existing.is_default) {
      await db.setDefaultAgent(agent.id)
    }

    await db.saveAgent(agent)
    reloadConfig()

    return NextResponse.json({ agent })
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
      return NextResponse.json({ error: 'Agent ID is required' }, { status: 400 })
    }

    const db = getDatabaseProvider()
    const existing = await db.getAgentById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    if (existing.is_default) {
      return NextResponse.json({ error: 'Cannot delete the default agent' }, { status: 400 })
    }

    await db.deleteAgent(id)
    reloadConfig()

    return NextResponse.json({ success: true })
  }
  catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
