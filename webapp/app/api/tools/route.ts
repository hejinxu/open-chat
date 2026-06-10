import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { allBuiltinTools } from '@/lib/tools/builtin'

export async function GET(_request: NextRequest) {
  try {
    const tools = allBuiltinTools.map(tool => ({
      name: tool.name,
      displayName: tool.displayName,
      description: tool.description,
      category: tool.category,
      execution: tool.execution,
      isBuiltin: tool.isBuiltin,
      isEnabled: tool.isEnabled,
      permissions: tool.permissions,
      metadata: tool.metadata,
    }))

    return NextResponse.json({ tools })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 },
    )
  }
}
