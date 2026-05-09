import { NextResponse } from 'next/server'
import { getAgentInfoList, reloadConfig } from '@/app/api/utils/agents'

export async function GET() {
  try {
    reloadConfig()
    const agents = getAgentInfoList()
    return NextResponse.json({ agents })
  } catch (e: any) {
    return NextResponse.json({ agents: [], error: e.message }, { status: 500 })
  }
}
