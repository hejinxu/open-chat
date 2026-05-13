import type { NextRequest } from 'next/server'
import { getInfo, getAdapterForRequest } from '@/app/api/utils/common'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const { user } = getInfo(request)
    formData.append('user', user)
    const adapter = await getAdapterForRequest(request)
    const data = await adapter.fileUpload(formData)
    return new Response((data as any)?.id || '')
  }
  catch (e: any) {
    return new Response(e.message)
  }
}
