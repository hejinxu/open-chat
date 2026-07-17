import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDatabaseProvider } from '@/lib/db'
import type { AgentRecord } from '@/types/agent'
import { reloadConfig } from '@/app/api/utils/agents'
import { requireAdmin } from '@/app/api/utils/auth-guard'

export async function GET(request: NextRequest) {
  const authError = requireAdmin(request)
  if (authError) { return authError }

  try {
    const db = getDatabaseProvider()
    const agents = await db.getAgents()

    // Resolve model_id → model_name for display
    const modelIds = agents.map(a => a.model_id).filter(Boolean) as string[]
    if (modelIds.length > 0) {
      const allModels = await db.getModels()
      const modelMap = new Map(allModels.map(m => [m.id, m]))
      const resolved = agents.map((agent) => {
        if (!agent.model_id) { return { ...agent, model: null } }
        const model = modelMap.get(agent.model_id)
        return { ...agent, model: model?.model_name || null }
      })
      return NextResponse.json({ agents: resolved })
    }

    return NextResponse.json({ agents: agents.map(a => ({ ...a, model: null })) })
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
    const { name, icon, description, backend_type, api_key, api_url, model_id, extra_config, execution_mode, tools_config, mcp_servers, is_default, is_enabled, agent_type, agent_config } = body

    if (!name) {
      return NextResponse.json({ error: 'Name is required', code: 'NAME_REQUIRED' }, { status: 400 })
    }

    const db = getDatabaseProvider()

    // Check name uniqueness
    const allAgents = await db.getAgents()
    if (allAgents.some(a => a.name === name)) {
      return NextResponse.json({ error: 'Agent name already exists', code: 'AGENT_NAME_EXISTS' }, { status: 400 })
    }

    // Validate model_id if provided
    if (model_id) {
      const model = await db.getModelById(model_id)
      if (!model) {
        return NextResponse.json({ error: 'Model not found', code: 'MODEL_NOT_FOUND' }, { status: 400 })
      }
      if (!model.is_enabled) {
        return NextResponse.json({ error: 'Model is disabled', code: 'MODEL_DISABLED' }, { status: 400 })
      }
    }

    // Auto-generate ID: agent-{name_slug}-{random4}
    const slug = name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 30)
      .replace(/-+$/, '')
    const rand = Math.random().toString(16).slice(2, 6)
    const id = `agent-${slug}-${rand}`

    const now = Math.floor(Date.now() / 1000)
    const agent: AgentRecord = {
      id,
      name,
      icon: icon || '🤖',
      description: description || '',
      backend_type: backend_type || 'dify',
      api_key: api_key || '',
      api_url: api_url || '',
      model_id: model_id || null,
      extra_config: extra_config ? JSON.stringify(extra_config) : '{}',
      execution_mode: execution_mode || 'chat',
      tools_config: tools_config ? JSON.stringify(tools_config) : '{}',
      mcp_servers: mcp_servers ? JSON.stringify(mcp_servers) : '[]',
      is_default: !!is_default,
      is_enabled: is_enabled !== false,
      agent_type: agent_type || 'general',
      agent_config: agent_config ? JSON.stringify(agent_config) : '{}',
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
  if (authError) { return authError }

  try {
    const body = await request.json()
    const { id, name, icon, description, backend_type, api_key, api_url, model_id, extra_config, execution_mode, tools_config, mcp_servers, is_default, is_enabled, agent_type, agent_config } = body

    if (!id) {
      return NextResponse.json({ error: 'Agent ID is required', code: 'AGENT_ID_REQUIRED' }, { status: 400 })
    }

    const db = getDatabaseProvider()
    const existing = await db.getAgentById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Agent not found', code: 'AGENT_NOT_FOUND' }, { status: 404 })
    }

    // Check name uniqueness (exclude current agent)
    if (name && name !== existing.name) {
      const allAgents = await db.getAgents()
      if (allAgents.some(a => a.name === name && a.id !== id)) {
        return NextResponse.json({ error: 'Agent name already exists', code: 'AGENT_NAME_EXISTS' }, { status: 400 })
      }
    }

    // Validate model_id if provided
    if (model_id !== undefined && model_id !== null && model_id !== '') {
      const model = await db.getModelById(model_id)
      if (!model) {
        return NextResponse.json({ error: 'Model not found', code: 'MODEL_NOT_FOUND' }, { status: 400 })
      }
      if (!model.is_enabled) {
        return NextResponse.json({ error: 'Model is disabled', code: 'MODEL_DISABLED' }, { status: 400 })
      }
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
      model_id: model_id !== undefined ? (model_id || null) : existing.model_id,
      extra_config: extra_config !== undefined ? JSON.stringify(extra_config) : existing.extra_config,
      execution_mode: execution_mode ?? existing.execution_mode,
      tools_config: tools_config !== undefined ? JSON.stringify(tools_config) : existing.tools_config,
      mcp_servers: mcp_servers !== undefined ? JSON.stringify(mcp_servers) : existing.mcp_servers,
      is_default: is_default !== undefined ? !!is_default : existing.is_default,
      is_enabled: is_enabled !== undefined ? !!is_enabled : existing.is_enabled,
      agent_type: agent_type ?? existing.agent_type,
      agent_config: agent_config !== undefined ? JSON.stringify(agent_config) : existing.agent_config,
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
  if (authError) { return authError }

  try {
    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ error: 'Agent ID is required', code: 'AGENT_ID_REQUIRED' }, { status: 400 })
    }

    const db = getDatabaseProvider()
    const existing = await db.getAgentById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Agent not found', code: 'AGENT_NOT_FOUND' }, { status: 404 })
    }

    if (existing.is_default) {
      return NextResponse.json({ error: 'Cannot delete the default agent', code: 'CANNOT_DELETE_DEFAULT' }, { status: 400 })
    }

    await db.deleteAgent(id)
    reloadConfig()

    return NextResponse.json({ success: true })
  }
  catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
