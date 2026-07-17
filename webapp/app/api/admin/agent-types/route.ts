import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDatabaseProvider } from '@/lib/db'
import type { AgentTypeRecord } from '@/types/agent-type'
import { dbToAgentType } from '@/types/agent-type'
import { requireAdmin } from '@/app/api/utils/auth-guard'

export async function GET(request: NextRequest) {
  const authError = requireAdmin(request)
  if (authError) { return authError }

  try {
    const db = getDatabaseProvider()
    const agentTypes = await db.getAgentTypes()
    // Parse JSON fields before returning
    const parsed = agentTypes.map(dbToAgentType)
    return NextResponse.json({ agent_types: parsed })
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
    const { name, icon, description, system_prompt_id, backend_type_constraint, execution_mode_constraint, config_schema, is_enabled } = body

    if (!name) {
      return NextResponse.json({ error: 'Name is required', code: 'NAME_REQUIRED' }, { status: 400 })
    }

    const db = getDatabaseProvider()

    // Check name uniqueness
    const allTypes = await db.getAgentTypes()
    if (allTypes.some(t => t.name === name)) {
      return NextResponse.json({ error: 'Agent type name already exists', code: 'AGENT_TYPE_NAME_EXISTS' }, { status: 400 })
    }

    // Auto-generate ID
    const slug = name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 30)
      .replace(/-+$/, '')
    const rand = Math.random().toString(16).slice(2, 6)
    const id = `type-${slug}-${rand}`

    const now = Math.floor(Date.now() / 1000)
    const agentType: AgentTypeRecord = {
      id,
      name,
      icon: icon || '🤖',
      description: description || '',
      system_prompt_id: system_prompt_id || null,
      backend_type_constraint: backend_type_constraint ? JSON.stringify(backend_type_constraint) : null,
      execution_mode_constraint: execution_mode_constraint ? JSON.stringify(execution_mode_constraint) : null,
      config_schema: config_schema ? JSON.stringify(config_schema) : '{}',
      is_enabled: is_enabled !== false,
      created_at: now,
      updated_at: now,
    }

    await db.saveAgentType(agentType)
    return NextResponse.json({ agent_type: agentType })
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
    const { id, name, icon, description, system_prompt_id, backend_type_constraint, execution_mode_constraint, config_schema, is_enabled } = body

    if (!id) {
      return NextResponse.json({ error: 'Agent type ID is required', code: 'AGENT_TYPE_ID_REQUIRED' }, { status: 400 })
    }

    const db = getDatabaseProvider()
    const existing = await db.getAgentTypeById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Agent type not found', code: 'AGENT_TYPE_NOT_FOUND' }, { status: 404 })
    }

    // Check name uniqueness (exclude current)
    if (name && name !== existing.name) {
      const allTypes = await db.getAgentTypes()
      if (allTypes.some(t => t.name === name && t.id !== id)) {
        return NextResponse.json({ error: 'Agent type name already exists', code: 'AGENT_TYPE_NAME_EXISTS' }, { status: 400 })
      }
    }

    const now = Math.floor(Date.now() / 1000)
    const agentType: AgentTypeRecord = {
      ...existing,
      name: name ?? existing.name,
      icon: icon ?? existing.icon,
      description: description ?? existing.description,
      system_prompt_id: system_prompt_id !== undefined ? (system_prompt_id || null) : existing.system_prompt_id,
      backend_type_constraint: backend_type_constraint !== undefined
        ? (backend_type_constraint ? JSON.stringify(backend_type_constraint) : null)
        : existing.backend_type_constraint,
      execution_mode_constraint: execution_mode_constraint !== undefined
        ? (execution_mode_constraint ? JSON.stringify(execution_mode_constraint) : null)
        : existing.execution_mode_constraint,
      config_schema: config_schema !== undefined ? JSON.stringify(config_schema) : existing.config_schema,
      is_enabled: is_enabled !== undefined ? !!is_enabled : existing.is_enabled,
      updated_at: now,
    }

    await db.saveAgentType(agentType)
    return NextResponse.json({ agent_type: agentType })
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
      return NextResponse.json({ error: 'Agent type ID is required', code: 'AGENT_TYPE_ID_REQUIRED' }, { status: 400 })
    }

    const db = getDatabaseProvider()
    const existing = await db.getAgentTypeById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Agent type not found', code: 'AGENT_TYPE_NOT_FOUND' }, { status: 404 })
    }

    await db.deleteAgentType(id)
    return NextResponse.json({ success: true })
  }
  catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
