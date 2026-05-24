import { NextResponse } from 'next/server'
import { verifyJwt } from '@/lib/auth/jwt'
import { verifyApiKey } from '@/lib/auth/token'
import { getDatabaseProvider } from '@/lib/db'

interface VerifyTokenRequest {
  token: string
}

interface VerifyTokenResponse {
  success: boolean
  code: number
  msg: string
  data?: {
    id: string
    name: string
    role: string
  }
}

export async function POST(request: Request): Promise<NextResponse<VerifyTokenResponse>> {
  let body: VerifyTokenRequest

  try {
    body = await request.json()
  }
  catch {
    return NextResponse.json({
      success: false,
      code: 400,
      msg: 'Invalid request body',
    })
  }

  const { token } = body
  if (!token || typeof token !== 'string') {
    return NextResponse.json({
      success: false,
      code: 400,
      msg: 'Token is required',
    })
  }

  // 1. Try JWT verification
  const jwtPayload = await verifyJwt(token)
  if (jwtPayload) {
    try {
      const db = getDatabaseProvider()
      const user = await db.getUserById(jwtPayload.sub)

      if (user && user.is_enabled) {
        return NextResponse.json({
          success: true,
          code: 200,
          msg: 'ok',
          data: {
            id: user.id,
            name: user.name,
            role: user.role,
          },
        })
      }
    }
    catch {
      // DB not available — return JWT payload info
      return NextResponse.json({
        success: true,
        code: 200,
        msg: 'ok',
        data: {
          id: jwtPayload.sub,
          name: 'JWT User',
          role: jwtPayload.role || 'user',
        },
      })
    }

    return NextResponse.json({
      success: false,
      code: 401,
      msg: 'User not found or disabled',
    })
  }

  // 2. Try API Key verification
  if (token.startsWith('sk-')) {
    try {
      const db = getDatabaseProvider()
      const allIntegrations = await db.getAppIntegrations()

      for (const integration of allIntegrations) {
        const keys = await db.getApiKeysByIntegration(integration.id)
        for (const key of keys) {
          if (!key.is_enabled) {
            continue
          }
          const matches = await verifyApiKey(token, key.key_hash)
          if (matches) {
            // Check expiration
            if (key.expires_at && key.expires_at < Math.floor(Date.now() / 1000)) {
              return NextResponse.json({
                success: false,
                code: 401,
                msg: 'API key expired',
              })
            }

            // Update last_used_at (fire and forget)
            db.updateApiKeyLastUsed(key.id).catch(() => {})

            return NextResponse.json({
              success: true,
              code: 200,
              msg: 'ok',
              data: {
                id: integration.id,
                name: integration.name || 'API User',
                role: 'user',
              },
            })
          }
        }
      }
    }
    catch {
      // DB not available
    }

    return NextResponse.json({
      success: false,
      code: 401,
      msg: 'Invalid API key',
    })
  }

  // 3. Unknown token format
  return NextResponse.json({
    success: false,
    code: 401,
    msg: 'Invalid token',
  })
}
