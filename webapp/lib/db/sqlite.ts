import path from 'path'
import fs from 'fs'
import type { ConversationRecord, MessageRecord } from '../storage/types'
import type { DatabaseProvider } from './types'
import type { StorageProvider } from '../storage/types'
import type { EmbedTokenRecord } from '@/types/embed'
import type { UserRecord, UserAccountRecord, AppIntegrationRecord, ApiKeyRecord } from '@/types/auth'

export class SqliteProvider implements DatabaseProvider {
  private db: any = null
  private dbPath: string
  private initPromise: Promise<void>

  constructor(dbPath?: string) {
    this.dbPath = dbPath || process.env.SQLITE_DB_PATH || path.join(process.cwd(), 'data', 'openchat.db')
    this.initPromise = this.init()
  }

  private async init(): Promise<void> {
    // serverExternalPackages prevents Next.js from bundling sql.js
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const initSqlJs = require('sql.js')
    const SQL = await initSqlJs()

    // Ensure directory exists
    const dir = path.dirname(this.dbPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // Load existing database or create new one
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath)
      this.db = new SQL.Database(buffer)
    } else {
      this.db = new SQL.Database()
    }

    // Create tables
    this.db.run(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        agents TEXT NOT NULL DEFAULT '{}'
      )
    `)

    this.db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        agent_id TEXT,
        agent_name TEXT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        is_answer INTEGER NOT NULL DEFAULT 0,
        feedback TEXT,
        message_files TEXT NOT NULL DEFAULT '[]',
        agent_thoughts TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL
      )
    `)

    this.db.run('CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id)')
    this.db.run('CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)')

    this.db.run(`
      CREATE TABLE IF NOT EXISTS embed_tokens (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        token TEXT NOT NULL UNIQUE,
        allowed_agent_ids TEXT NOT NULL DEFAULT '[]',
        is_enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)
    this.db.run('CREATE INDEX IF NOT EXISTS idx_embed_tokens_token ON embed_tokens(token)')

    // Auth tables
    this.db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT 'user',
        org_id TEXT,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)

    this.db.run(`
      CREATE TABLE IF NOT EXISTS user_accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        login_type TEXT NOT NULL,
        login_identifier TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL DEFAULT '',
        is_primary INTEGER NOT NULL DEFAULT 0,
        is_verified INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `)
    this.db.run('CREATE INDEX IF NOT EXISTS idx_user_accounts_user_id ON user_accounts(user_id)')

    this.db.run(`
      CREATE TABLE IF NOT EXISTS app_integrations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        app_id TEXT NOT NULL UNIQUE,
        app_secret TEXT NOT NULL DEFAULT '',
        is_enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)

    this.db.run(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        integration_id TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        key_prefix TEXT NOT NULL,
        key_hash TEXT NOT NULL,
        allowed_agent_ids TEXT NOT NULL DEFAULT '[]',
        expires_at INTEGER,
        last_used_at INTEGER,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (integration_id) REFERENCES app_integrations(id) ON DELETE CASCADE
      )
    `)
    this.db.run('CREATE INDEX IF NOT EXISTS idx_api_keys_integration_id ON api_keys(integration_id)')

    // Migrate legacy embed_tokens to app_integrations + api_keys
    await this.migrateEmbedTokens()

    this.saveToFile()
  }

  private saveToFile(): void {
    if (!this.db) return
    const data = this.db.export()
    const buffer = Buffer.from(data)
    fs.writeFileSync(this.dbPath, buffer)
  }

  async ensureReady(): Promise<void> {
    await this.initPromise
    if (!this.db) {
      throw new Error('Database not initialized')
    }
  }

  async getConversations(): Promise<ConversationRecord[]> {
    await this.ensureReady()
    const stmt = this.db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC')
    const rows: any[] = []
    while (stmt.step()) {
      rows.push(stmt.getAsObject())
    }
    stmt.free()
    return rows.map(this.mapConversation)
  }

  async getConversationById(id: string): Promise<ConversationRecord | null> {
    await this.ensureReady()
    const stmt = this.db.prepare('SELECT * FROM conversations WHERE id = ?')
    stmt.bind([id])
    let row: any = null
    if (stmt.step()) {
      row = stmt.getAsObject()
    }
    stmt.free()
    return row ? this.mapConversation(row) : null
  }

  async saveConversation(conv: ConversationRecord): Promise<void> {
    await this.ensureReady()
    this.db.run(
      'INSERT OR REPLACE INTO conversations (id, name, created_at, updated_at, agents) VALUES (?, ?, ?, ?, ?)',
      [conv.id, conv.name, conv.created_at, conv.updated_at, JSON.stringify(conv.agents || {})]
    )
    this.saveToFile()
  }

  async deleteConversation(id: string): Promise<void> {
    await this.ensureReady()
    this.db.run('DELETE FROM messages WHERE conversation_id = ?', [id])
    this.db.run('DELETE FROM conversations WHERE id = ?', [id])
    this.saveToFile()
  }

  async getMessages(conversationId: string): Promise<MessageRecord[]> {
    await this.ensureReady()
    const stmt = this.db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
    stmt.bind([conversationId])
    const rows: any[] = []
    while (stmt.step()) {
      rows.push(stmt.getAsObject())
    }
    stmt.free()
    return rows.map(this.mapMessage)
  }

  async saveMessage(msg: MessageRecord): Promise<void> {
    await this.ensureReady()
    this.db.run(
      `INSERT OR REPLACE INTO messages (id, conversation_id, agent_id, agent_name, role, content, is_answer, feedback, message_files, agent_thoughts, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        msg.id,
        msg.conversation_id,
        msg.agent_id,
        msg.agent_name,
        msg.role,
        msg.content,
        msg.is_answer ? 1 : 0,
        msg.feedback ? JSON.stringify(msg.feedback) : null,
        JSON.stringify(msg.message_files || []),
        JSON.stringify(msg.agent_thoughts || []),
        msg.created_at,
      ]
    )
    // Also update conversation's updated_at
    this.db.run(
      'UPDATE conversations SET updated_at = ? WHERE id = ?',
      [Math.floor(Date.now() / 1000), msg.conversation_id]
    )
    this.saveToFile()
  }

  async deleteMessages(conversationId: string): Promise<void> {
    await this.ensureReady()
    this.db.run('DELETE FROM messages WHERE conversation_id = ?', [conversationId])
    this.saveToFile()
  }

  async deleteMessagesByIds(ids: string[]): Promise<void> {
    await this.ensureReady()
    if (ids.length === 0) return
    const placeholders = ids.map(() => '?').join(', ')
    this.db.run(`DELETE FROM messages WHERE id IN (${placeholders})`, ids)
    this.saveToFile()
  }

  private mapConversation(row: any): ConversationRecord {
    return {
      id: row.id as string,
      name: row.name as string,
      created_at: row.created_at as number,
      updated_at: row.updated_at as number,
      agents: typeof row.agents === 'string' ? JSON.parse(row.agents as string) : (row.agents as Record<string, any>) || {},
    }
  }

  private mapMessage(row: any): MessageRecord {
    return {
      id: row.id as string,
      conversation_id: row.conversation_id as string,
      agent_id: row.agent_id as string | null,
      agent_name: row.agent_name as string | null,
      role: row.role as 'user' | 'assistant',
      content: row.content as string,
      is_answer: (row.is_answer as number) === 1,
      feedback: row.feedback ? JSON.parse(row.feedback as string) : null,
      message_files: typeof row.message_files === 'string' ? JSON.parse(row.message_files as string) : (row.message_files as any[]) || [],
      agent_thoughts: typeof row.agent_thoughts === 'string' ? JSON.parse(row.agent_thoughts as string) : (row.agent_thoughts as any[]) || [],
      created_at: row.created_at as number,
    }
  }

  async getEmbedTokens(): Promise<EmbedTokenRecord[]> {
    await this.ensureReady()
    const stmt = this.db.prepare('SELECT * FROM embed_tokens ORDER BY created_at DESC')
    const rows: any[] = []
    while (stmt.step()) {
      rows.push(stmt.getAsObject())
    }
    stmt.free()
    return rows.map(this.mapEmbedToken)
  }

  async getEmbedTokenById(id: string): Promise<EmbedTokenRecord | null> {
    await this.ensureReady()
    const stmt = this.db.prepare('SELECT * FROM embed_tokens WHERE id = ?')
    stmt.bind([id])
    let row: any = null
    if (stmt.step()) {
      row = stmt.getAsObject()
    }
    stmt.free()
    return row ? this.mapEmbedToken(row) : null
  }

  async getEmbedTokenByValue(token: string): Promise<EmbedTokenRecord | null> {
    await this.ensureReady()
    const stmt = this.db.prepare('SELECT * FROM embed_tokens WHERE token = ?')
    stmt.bind([token])
    let row: any = null
    if (stmt.step()) {
      row = stmt.getAsObject()
    }
    stmt.free()
    return row ? this.mapEmbedToken(row) : null
  }

  async saveEmbedToken(tok: EmbedTokenRecord): Promise<void> {
    await this.ensureReady()
    this.db.run(
      `INSERT OR REPLACE INTO embed_tokens (id, name, description, token, allowed_agent_ids, is_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tok.id,
        tok.name,
        tok.description,
        tok.token,
        JSON.stringify(tok.allowed_agent_ids),
        tok.is_enabled ? 1 : 0,
        tok.created_at,
        tok.updated_at,
      ]
    )
    this.saveToFile()
  }

  async deleteEmbedToken(id: string): Promise<void> {
    await this.ensureReady()
    this.db.run('DELETE FROM embed_tokens WHERE id = ?', [id])
    this.saveToFile()
  }

  private mapEmbedToken(row: any): EmbedTokenRecord {
    return {
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string) || '',
      token: row.token as string,
      allowed_agent_ids: typeof row.allowed_agent_ids === 'string' ? JSON.parse(row.allowed_agent_ids as string) : (row.allowed_agent_ids as string[]) || [],
      is_enabled: (row.is_enabled as number) === 1,
      created_at: row.created_at as number,
      updated_at: row.updated_at as number,
    }
  }

  // ============ Migration ============

  private async migrateEmbedTokens(): Promise<void> {
    // Check if old embed_tokens table has data
    const result = this.db.exec("SELECT COUNT(*) as cnt FROM embed_tokens")
    const count = result.length > 0 ? result[0].values[0][0] as number : 0
    if (count === 0) return

    // For each embed_token, create an app_integration + api_key
    const stmt = this.db.prepare('SELECT * FROM embed_tokens')
    const tokens: any[] = []
    while (stmt.step()) {
      tokens.push(stmt.getAsObject())
    }
    stmt.free()

    for (const tok of tokens) {
      const integrationId = tok.id as string
      const now = Math.floor(Date.now() / 1000)

      // Create app integration
      this.db.run(
        `INSERT OR IGNORE INTO app_integrations (id, name, description, app_id, app_secret, is_enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, '', ?, ?, ?)`,
        [integrationId, tok.name, tok.description || '', `migrated-${integrationId}`, tok.is_enabled, now, now]
      )

      // Create api key (use the raw token as the key value for backward compat)
      const rawToken = tok.token as string
      const keyPrefix = rawToken.slice(0, 11)
      // Store the raw token as key_hash (not bcrypt hashed) for migration simplicity
      // New keys will use bcrypt
      this.db.run(
        `INSERT OR IGNORE INTO api_keys (id, integration_id, name, key_prefix, key_hash, allowed_agent_ids, expires_at, is_enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        [`key-${integrationId}`, integrationId, 'Migrated Token', keyPrefix, rawToken, tok.allowed_agent_ids, tok.is_enabled, now]
      )
    }

    // Drop old table
    this.db.run('DROP TABLE IF EXISTS embed_tokens')
    this.db.run('DROP INDEX IF EXISTS idx_embed_tokens_token')
  }

  // ============ Users ============

  async getUserById(id: string): Promise<UserRecord | null> {
    await this.ensureReady()
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?')
    stmt.bind([id])
    let row: any = null
    if (stmt.step()) {
      row = stmt.getAsObject()
    }
    stmt.free()
    return row ? this.mapUser(row) : null
  }

  async getUsers(): Promise<UserRecord[]> {
    await this.ensureReady()
    const stmt = this.db.prepare('SELECT * FROM users ORDER BY created_at DESC')
    const rows: any[] = []
    while (stmt.step()) {
      rows.push(stmt.getAsObject())
    }
    stmt.free()
    return rows.map(this.mapUser)
  }

  async saveUser(user: UserRecord): Promise<void> {
    await this.ensureReady()
    this.db.run(
      `INSERT OR REPLACE INTO users (id, name, role, org_id, is_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user.id, user.name, user.role, user.org_id, user.is_enabled ? 1 : 0, user.created_at, user.updated_at]
    )
    this.saveToFile()
  }

  async deleteUser(id: string): Promise<void> {
    await this.ensureReady()
    this.db.run('DELETE FROM user_accounts WHERE user_id = ?', [id])
    this.db.run('DELETE FROM users WHERE id = ?', [id])
    this.saveToFile()
  }

  private mapUser(row: any): UserRecord {
    return {
      id: row.id as string,
      name: row.name as string,
      role: row.role as 'admin' | 'user',
      org_id: row.org_id as string | null,
      is_enabled: (row.is_enabled as number) === 1,
      created_at: row.created_at as number,
      updated_at: row.updated_at as number,
    }
  }

  // ============ User Accounts ============

  async getUserAccountByIdentifier(identifier: string): Promise<UserAccountRecord | null> {
    await this.ensureReady()
    const stmt = this.db.prepare('SELECT * FROM user_accounts WHERE login_identifier = ?')
    stmt.bind([identifier])
    let row: any = null
    if (stmt.step()) {
      row = stmt.getAsObject()
    }
    stmt.free()
    return row ? this.mapUserAccount(row) : null
  }

  async getUserAccountsByUserId(userId: string): Promise<UserAccountRecord[]> {
    await this.ensureReady()
    const stmt = this.db.prepare('SELECT * FROM user_accounts WHERE user_id = ? ORDER BY created_at ASC')
    stmt.bind([userId])
    const rows: any[] = []
    while (stmt.step()) {
      rows.push(stmt.getAsObject())
    }
    stmt.free()
    return rows.map(this.mapUserAccount)
  }

  async saveUserAccount(account: UserAccountRecord): Promise<void> {
    await this.ensureReady()
    this.db.run(
      `INSERT OR REPLACE INTO user_accounts (id, user_id, login_type, login_identifier, password_hash, is_primary, is_verified, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [account.id, account.user_id, account.login_type, account.login_identifier, account.password_hash, account.is_primary ? 1 : 0, account.is_verified ? 1 : 0, account.created_at]
    )
    this.saveToFile()
  }

  async deleteUserAccount(id: string): Promise<void> {
    await this.ensureReady()
    this.db.run('DELETE FROM user_accounts WHERE id = ?', [id])
    this.saveToFile()
  }

  private mapUserAccount(row: any): UserAccountRecord {
    return {
      id: row.id as string,
      user_id: row.user_id as string,
      login_type: row.login_type as UserAccountRecord['login_type'],
      login_identifier: row.login_identifier as string,
      password_hash: row.password_hash as string,
      is_primary: (row.is_primary as number) === 1,
      is_verified: (row.is_verified as number) === 1,
      created_at: row.created_at as number,
    }
  }

  // ============ App Integrations ============

  async getAppIntegrations(): Promise<AppIntegrationRecord[]> {
    await this.ensureReady()
    const stmt = this.db.prepare('SELECT * FROM app_integrations ORDER BY created_at DESC')
    const rows: any[] = []
    while (stmt.step()) {
      rows.push(stmt.getAsObject())
    }
    stmt.free()
    return rows.map(this.mapAppIntegration)
  }

  async getAppIntegrationById(id: string): Promise<AppIntegrationRecord | null> {
    await this.ensureReady()
    const stmt = this.db.prepare('SELECT * FROM app_integrations WHERE id = ?')
    stmt.bind([id])
    let row: any = null
    if (stmt.step()) {
      row = stmt.getAsObject()
    }
    stmt.free()
    return row ? this.mapAppIntegration(row) : null
  }

  async getAppIntegrationByAppId(appId: string): Promise<AppIntegrationRecord | null> {
    await this.ensureReady()
    const stmt = this.db.prepare('SELECT * FROM app_integrations WHERE app_id = ?')
    stmt.bind([appId])
    let row: any = null
    if (stmt.step()) {
      row = stmt.getAsObject()
    }
    stmt.free()
    return row ? this.mapAppIntegration(row) : null
  }

  async saveAppIntegration(integration: AppIntegrationRecord): Promise<void> {
    await this.ensureReady()
    this.db.run(
      `INSERT OR REPLACE INTO app_integrations (id, name, description, app_id, app_secret, is_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [integration.id, integration.name, integration.description, integration.app_id, integration.app_secret, integration.is_enabled ? 1 : 0, integration.created_at, integration.updated_at]
    )
    this.saveToFile()
  }

  async deleteAppIntegration(id: string): Promise<void> {
    await this.ensureReady()
    this.db.run('DELETE FROM api_keys WHERE integration_id = ?', [id])
    this.db.run('DELETE FROM app_integrations WHERE id = ?', [id])
    this.saveToFile()
  }

  private mapAppIntegration(row: any): AppIntegrationRecord {
    return {
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string) || '',
      app_id: row.app_id as string,
      app_secret: row.app_secret as string,
      is_enabled: (row.is_enabled as number) === 1,
      created_at: row.created_at as number,
      updated_at: row.updated_at as number,
    }
  }

  // ============ API Keys ============

  async getApiKeysByIntegration(integrationId: string): Promise<ApiKeyRecord[]> {
    await this.ensureReady()
    const stmt = this.db.prepare('SELECT * FROM api_keys WHERE integration_id = ? ORDER BY created_at DESC')
    stmt.bind([integrationId])
    const rows: any[] = []
    while (stmt.step()) {
      rows.push(stmt.getAsObject())
    }
    stmt.free()
    return rows.map(this.mapApiKey)
  }

  async getApiKeyByKeyHash(keyHash: string): Promise<ApiKeyRecord | null> {
    await this.ensureReady()
    const stmt = this.db.prepare('SELECT * FROM api_keys WHERE key_hash = ?')
    stmt.bind([keyHash])
    let row: any = null
    if (stmt.step()) {
      row = stmt.getAsObject()
    }
    stmt.free()
    return row ? this.mapApiKey(row) : null
  }

  async saveApiKey(key: ApiKeyRecord): Promise<void> {
    await this.ensureReady()
    this.db.run(
      `INSERT OR REPLACE INTO api_keys (id, integration_id, name, key_prefix, key_hash, allowed_agent_ids, expires_at, last_used_at, is_enabled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        key.id,
        key.integration_id,
        key.name,
        key.key_prefix,
        key.key_hash,
        JSON.stringify(key.allowed_agent_ids),
        key.expires_at,
        key.last_used_at,
        key.is_enabled ? 1 : 0,
        key.created_at,
      ]
    )
    this.saveToFile()
  }

  async deleteApiKey(id: string): Promise<void> {
    await this.ensureReady()
    this.db.run('DELETE FROM api_keys WHERE id = ?', [id])
    this.saveToFile()
  }

  async updateApiKeyLastUsed(id: string): Promise<void> {
    await this.ensureReady()
    this.db.run('UPDATE api_keys SET last_used_at = ? WHERE id = ?', [Math.floor(Date.now() / 1000), id])
    this.saveToFile()
  }

  private mapApiKey(row: any): ApiKeyRecord {
    return {
      id: row.id as string,
      integration_id: row.integration_id as string,
      name: row.name as string,
      key_prefix: row.key_prefix as string,
      key_hash: row.key_hash as string,
      allowed_agent_ids: typeof row.allowed_agent_ids === 'string' ? JSON.parse(row.allowed_agent_ids as string) : (row.allowed_agent_ids as string[]) || [],
      expires_at: row.expires_at as number | null,
      last_used_at: row.last_used_at as number | null,
      is_enabled: (row.is_enabled as number) === 1,
      created_at: row.created_at as number,
    }
  }
}
