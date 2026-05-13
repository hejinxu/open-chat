import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getInfo, setSession, getAdapterForRequest } from '@/app/api/utils/common'

export async function GET(request: NextRequest) {
  const { sessionId, user } = getInfo(request)
  try {
    const adapter = await getAdapterForRequest(request)
    const data = await adapter.getParameters(user)
    return NextResponse.json(data as object, {
      headers: setSession(sessionId),
    })
  }
  catch (error) {
    return NextResponse.json([])
  }
}
