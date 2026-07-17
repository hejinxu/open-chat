import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDatabaseProvider } from '@/lib/db'
import type { SystemPromptRecord } from '@/types/system-prompt'
import { requireAdmin } from '@/app/api/utils/auth-guard'

export async function GET(request: NextRequest) {
  const authError = requireAdmin(request)
  if (authError) { return authError }

  try {
    const db = getDatabaseProvider()
    const prompts = await db.getSystemPrompts()
    return NextResponse.json({ system_prompts: prompts })
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
    const { name, description, content } = body

    if (!name) {
      return NextResponse.json({ error: 'Name is required', code: 'NAME_REQUIRED' }, { status: 400 })
    }
    if (!content) {
      return NextResponse.json({ error: 'Content is required', code: 'CONTENT_REQUIRED' }, { status: 400 })
    }

    const db = getDatabaseProvider()

    // Check name uniqueness
    const allPrompts = await db.getSystemPrompts()
    if (allPrompts.some(p => p.name === name)) {
      return NextResponse.json({ error: 'System prompt name already exists', code: 'SYSTEM_PROMPT_NAME_EXISTS' }, { status: 400 })
    }

    // Auto-generate ID
    const slug = name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 30)
      .replace(/-+$/, '')
    const rand = Math.random().toString(16).slice(2, 6)
    const id = `prompt-${slug}-${rand}`

    const now = Math.floor(Date.now() / 1000)
    const prompt: SystemPromptRecord = {
      id,
      name,
      description: description || '',
      content,
      created_at: now,
      updated_at: now,
    }

    await db.saveSystemPrompt(prompt)
    return NextResponse.json({ system_prompt: prompt })
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
    const { id, name, description, content } = body

    if (!id) {
      return NextResponse.json({ error: 'System prompt ID is required', code: 'SYSTEM_PROMPT_ID_REQUIRED' }, { status: 400 })
    }

    const db = getDatabaseProvider()
    const existing = await db.getSystemPromptById(id)
    if (!existing) {
      return NextResponse.json({ error: 'System prompt not found', code: 'SYSTEM_PROMPT_NOT_FOUND' }, { status: 404 })
    }

    // Check name uniqueness (exclude current)
    if (name && name !== existing.name) {
      const allPrompts = await db.getSystemPrompts()
      if (allPrompts.some(p => p.name === name && p.id !== id)) {
        return NextResponse.json({ error: 'System prompt name already exists', code: 'SYSTEM_PROMPT_NAME_EXISTS' }, { status: 400 })
      }
    }

    const now = Math.floor(Date.now() / 1000)
    const prompt: SystemPromptRecord = {
      ...existing,
      name: name ?? existing.name,
      description: description ?? existing.description,
      content: content ?? existing.content,
      updated_at: now,
    }

    await db.saveSystemPrompt(prompt)
    return NextResponse.json({ system_prompt: prompt })
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
      return NextResponse.json({ error: 'System prompt ID is required', code: 'SYSTEM_PROMPT_ID_REQUIRED' }, { status: 400 })
    }

    const db = getDatabaseProvider()
    const existing = await db.getSystemPromptById(id)
    if (!existing) {
      return NextResponse.json({ error: 'System prompt not found', code: 'SYSTEM_PROMPT_NOT_FOUND' }, { status: 404 })
    }

    await db.deleteSystemPrompt(id)
    return NextResponse.json({ success: true })
  }
  catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
