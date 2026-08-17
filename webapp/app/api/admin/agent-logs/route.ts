import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/api/utils/auth-guard'
import { getRequestSummaries, getRequest, getLogs } from '@/lib/services/agent-logger'

export async function GET(request: NextRequest) {
  const authError = requireAdmin(request)
  if (authError) { return authError }

  try {
    const requestId = request.nextUrl.searchParams.get('requestId')

    if (requestId) {
      const summary = getRequest(requestId)
      const logs = getLogs(requestId)
      return NextResponse.json({ request: summary, logs })
    }

    const activeOnly = request.nextUrl.searchParams.get('active') === 'true'
    let summaries = getRequestSummaries()
    if (activeOnly) {
      summaries = summaries.filter(s => s.status === 'running')
    }

    return NextResponse.json({ requests: summaries })
  }
  catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
