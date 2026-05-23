import { NextResponse } from 'next/server'
import { getAgentInfoList } from '@/app/api/utils/agents'

export async function GET() {
  try {
    const agents = await getAgentInfoList()
    return NextResponse.json({ agents })
  }
  catch (e: any) {
    return NextResponse.json({ agents: [], error: e.message }, { status: 500 })
  }
}
