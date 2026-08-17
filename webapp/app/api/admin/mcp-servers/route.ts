import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDatabaseProvider } from '@/lib/db'
import type { MCPServerRecord, MCPTransport } from '@/types/mcp'
import { requireAdmin } from '@/app/api/utils/auth-guard'

export async function GET(request: NextRequest) {
  const authError = requireAdmin(request)
  if (authError) { return authError }

  try {
    const db = getDatabaseProvider()
    const servers = await db.getMCPServers()
    return NextResponse.json({ servers })
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
    const { name, display_name, description, transport, config, is_enabled } = body

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (!display_name) {
      return NextResponse.json({ error: 'Display name is required' }, { status: 400 })
    }

    const slug = name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 20)
      .replace(/-+$/, '')
    const rand = Math.random().toString(16).slice(2, 6)
    const id = `mcp-${slug}-${rand}`

    const now = Math.floor(Date.now() / 1000)
    const server: MCPServerRecord = {
      id,
      name,
      display_name,
      description: description || '',
      transport: (transport || 'stdio') as MCPTransport,
      config: typeof config === 'string' ? config : JSON.stringify(config || {}),
      is_enabled: is_enabled !== false,
      last_connected_at: null,
      created_at: now,
      updated_at: now,
    }

    const db = getDatabaseProvider()
    await db.saveMCPServer(server)

    return NextResponse.json({ server })
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
    const { id, name, display_name, description, transport, config, is_enabled } = body

    if (!id) {
      return NextResponse.json({ error: 'Server ID is required' }, { status: 400 })
    }

    const db = getDatabaseProvider()
    const existing = await db.getMCPServerById(id)
    if (!existing) {
      return NextResponse.json({ error: 'MCP server not found' }, { status: 404 })
    }

    const now = Math.floor(Date.now() / 1000)
    const server: MCPServerRecord = {
      ...existing,
      name: name ?? existing.name,
      display_name: display_name ?? existing.display_name,
      description: description ?? existing.description,
      transport: (transport ?? existing.transport) as MCPTransport,
      config: config !== undefined
        ? (typeof config === 'string' ? config : JSON.stringify(config || {}))
        : existing.config,
      is_enabled: is_enabled !== undefined ? !!is_enabled : existing.is_enabled,
      updated_at: now,
    }

    await db.saveMCPServer(server)

    return NextResponse.json({ server })
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
      return NextResponse.json({ error: 'Server ID is required' }, { status: 400 })
    }

    const db = getDatabaseProvider()
    const existing = await db.getMCPServerById(id)
    if (!existing) {
      return NextResponse.json({ error: 'MCP server not found' }, { status: 404 })
    }

    await db.deleteMCPServer(id)

    return NextResponse.json({ success: true })
  }
  catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
