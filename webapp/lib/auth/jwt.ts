import { SignJWT, jwtVerify, decodeJwt } from 'jose'
import type { JwtPayload } from '@/types/auth'

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'change-me-in-production')

/** 登录认证 token 有效期（秒），同时用于 JWT exp 与 cookie maxAge */
export const AUTH_TOKEN_TTL_SECONDS = 2 * 60 * 60 // 2 小时

/** 滑动续期阈值：剩余有效期低于此值时在 middleware 中重签（秒） */
export const AUTH_TOKEN_REFRESH_THRESHOLD_SECONDS = 60 * 60 // 1 小时

export async function signJwt(payload: Omit<JwtPayload, 'iat'>): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    // jose 的 setExpirationTime(number) 把 number 当作绝对 Unix 时间戳（秒）而非相对偏移，
    // 需手动加上当前时间戳；string 才会被解析为时间跨度（如 '8h'）
    .setExpirationTime(Math.floor(Date.now() / 1000) + AUTH_TOKEN_TTL_SECONDS)
    .sign(secret)
}

/** 统一的 auth_token cookie 配置，保证 login 与滑动续期写入一致 */
export function getAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: AUTH_TOKEN_TTL_SECONDS,
  }
}

export async function signJwtWithExpiry(payload: Omit<JwtPayload, 'iat'>, expiresInSeconds: number): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
    .sign(secret)
}

export async function verifyJwt(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret)
    return payload as unknown as JwtPayload
  }
  catch {
    return null
  }
}

/** 仅解码 JWT 检查是否过期（不验签；用于 verifyJwt 失败后区分"过期"与"其他无效"，安全性已由 verifyJwt 保证） */
export function isJwtExpired(token: string): boolean {
  try {
    const decoded = decodeJwt(token)
    return !!decoded.exp && decoded.exp * 1000 < Date.now()
  }
  catch {
    return false
  }
}
