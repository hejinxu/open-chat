import { SignJWT, jwtVerify } from 'jose'
import type { JwtPayload } from '@/types/auth'

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'change-me-in-production')

export async function signJwt(payload: Omit<JwtPayload, 'iat'>): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('365d')
    .sign(secret)
}

export async function signJwtWithExpiry(payload: Omit<JwtPayload, 'iat'>, expiresInSeconds: number): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresInSeconds)
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
