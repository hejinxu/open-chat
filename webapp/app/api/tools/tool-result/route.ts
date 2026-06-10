import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getToolRegistry } from '@/lib/tools/registry'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tool_call_id, result, error } = body

    if (!tool_call_id) {
      return NextResponse.json(
        { error: 'tool_call_id is required' },
        { status: 400 },
      )
    }

    const registry = getToolRegistry()
    const resolved = registry.resolveClientToolResult(tool_call_id, {
      success: !error,
      data: result,
      error,
    })

    if (!resolved) {
      return NextResponse.json(
        { error: 'Tool call not found or already resolved' },
        { status: 404 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 },
    )
  }
}
