import { NextResponse, type NextRequest } from 'next/server'
import { verifyJwt } from '@/lib/auth/jwt'
import { verifyApiKey } from '@/lib/auth/token'
import { getDatabaseProvider } from '@/lib/db'
import { ensureHasUsers } from '@/lib/auth/setup-cache'

export const config = {
  runtime: 'nodejs',
}

const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/setup',
  '/api/auth/exchange',
  '/login',
  '/embed',
  '/_next',
  '/favicon',
  '/images',
]

function getBasePath(): string {
  return process.env.NEXT_PUBLIC_BASE_PATH || ''
}

function stripBasePath(pathname: string): string {
  const basePath = getBasePath()
  if (basePath && pathname.startsWith(basePath)) {
    return pathname.slice(basePath.length) || '/'
  }
  return pathname
}

function isPublicPath(pathname: string): boolean {
  const path = stripBasePath(pathname)
  return PUBLIC_PATHS.some(p => path.startsWith(p))
}

function getLoginUrl(request: NextRequest): string {
  const basePath = getBasePath()
  return new URL(`${basePath}/login`, request.url).toString()
}

function getSetupUrl(request: NextRequest): string {
  const basePath = getBasePath()
  return new URL(`${basePath}/setup`, request.url).toString()
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  // Auth disabled — pass through
  if (process.env.AUTH_ENABLED !== 'true') {
    return NextResponse.next()
  }

  const headers = new Headers(request.headers)

  // 1. Try JWT from cookie
  const tokenCookie = request.cookies.get('auth_token')?.value
  if (tokenCookie) {
    const payload = await verifyJwt(tokenCookie)
    if (payload) {
      headers.set('x-auth-user-id', payload.sub)
      headers.set('x-auth-user-type', payload.type)
      if (payload.role) headers.set('x-auth-user-role', payload.role)
      return NextResponse.next({ request: { headers } })
    }
    // Invalid JWT — clear cookie
    const response = NextResponse.redirect(getLoginUrl(request))
    response.cookies.delete('auth_token')
    return response
  }

  // 2. Try API key from header
  const apiKey = request.headers.get('x-api-key')
    || request.headers.get('authorization')?.replace('Bearer ', '')
  if (apiKey && apiKey.startsWith('sk-')) {
    try {
      const db = getDatabaseProvider()

      const allIntegrations = await db.getAppIntegrations()
      let matchedKey: { keyHash: string, integrationId: string, keyId: string, allowedAgentIds: string[], expiresAt: number | null, isEnabled: boolean } | null = null

      for (const integration of allIntegrations) {
        const keys = await db.getApiKeysByIntegration(integration.id)
        for (const key of keys) {
          if (!key.is_enabled) continue
          const matches = await verifyApiKey(apiKey, key.key_hash)
          if (matches) {
            matchedKey = {
              keyHash: key.key_hash,
              integrationId: key.integration_id,
              keyId: key.id,
              allowedAgentIds: key.allowed_agent_ids,
              expiresAt: key.expires_at,
              isEnabled: key.is_enabled,
            }
            break
          }
        }
        if (matchedKey) break
      }

      if (matchedKey) {
        // Check expiration
        if (matchedKey.expiresAt && matchedKey.expiresAt < Math.floor(Date.now() / 1000)) {
          return NextResponse.json({ error: 'API key expired' }, { status: 401 })
        }

        // Check agent access
        const agentId = request.headers.get('x-agent-id')
        if (agentId && !matchedKey.allowedAgentIds.includes('*')
          && !matchedKey.allowedAgentIds.includes(agentId)) {
          return NextResponse.json({ error: 'Agent not allowed for this API key' }, { status: 403 })
        }

        // Update last_used_at (fire and forget)
        db.updateApiKeyLastUsed(matchedKey.keyId).catch(() => {})

        headers.set('x-auth-integration-id', matchedKey.integrationId)
        headers.set('x-auth-key-id', matchedKey.keyId)
        return NextResponse.next({ request: { headers } })
      }
    }
    catch {
      // DB not ready or error — fall through
    }

    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  // 3. No credentials — redirect to login/setup for page requests, 401 for API
  const path = stripBasePath(pathname)
  if (path.startsWith('/api/')) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const db = getDatabaseProvider()
  const usersExist = await ensureHasUsers(db)

  // /setup: allow only when no users exist, otherwise redirect to login
  if (path === '/setup') {
    if (usersExist) {
      return NextResponse.redirect(getLoginUrl(request))
    }
    return NextResponse.next()
  }

  // Other pages: redirect to setup if no users, login if users exist
  if (!usersExist) {
    return NextResponse.redirect(getSetupUrl(request))
  }
  return NextResponse.redirect(getLoginUrl(request))
}
