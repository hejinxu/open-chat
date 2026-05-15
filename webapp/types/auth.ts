export type LoginType = 'username' | 'email' | 'phone' | 'wechat'
export type TokenType = 'user' | 'app_key'
export type UserRole = 'admin' | 'user'

export interface UserRecord {
  id: string
  name: string
  role: UserRole
  org_id: string | null
  is_enabled: boolean
  created_at: number
  updated_at: number
}

export interface UserAccountRecord {
  id: string
  user_id: string
  login_type: LoginType
  login_identifier: string
  password_hash: string
  is_primary: boolean
  is_verified: boolean
  created_at: number
}

export interface AppIntegrationRecord {
  id: string
  name: string
  description: string
  app_id: string
  app_secret: string
  is_enabled: boolean
  created_at: number
  updated_at: number
}

export interface ApiKeyRecord {
  id: string
  integration_id: string
  name: string
  key_prefix: string
  key_hash: string
  allowed_agent_ids: string[]
  expires_at: number | null
  last_used_at: number | null
  is_enabled: boolean
  created_at: number
}

export interface JwtPayload {
  sub: string
  type: TokenType
  role?: UserRole
  app_id?: string
  exp?: number
  iat: number
}
