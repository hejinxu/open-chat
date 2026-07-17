import path from 'path'
import fs from 'fs'
import type { ConversationRecord, MessageRecord } from '../storage/types'
import type { DatabaseProvider } from './types'
import type { UserRecord, UserAccountRecord, AppIntegrationRecord, ApiKeyRecord } from '@/types/auth'
import type { AgentRecord } from '@/types/agent'
import type { ModelProvider, Model } from '@/types/model'

export class SqliteProvider implements DatabaseProvider {
  private db: any = null
  private dbPath: string
  private initPromise: Promise<void>
  private _dirty = false
  private _saveTimer: ReturnType<typeof setTimeout> | null = null

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

    // Agents table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT DEFAULT '🤖',
        description TEXT DEFAULT '',
        backend_type TEXT NOT NULL DEFAULT 'dify',
        api_key TEXT NOT NULL DEFAULT '',
        api_url TEXT NOT NULL DEFAULT '',
        model_id TEXT,
        extra_config TEXT DEFAULT '{}',
        is_default INTEGER NOT NULL DEFAULT 0,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        agent_type TEXT NOT NULL DEFAULT 'general',
        agent_config TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)

    // Model Providers table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS model_providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider_type TEXT NOT NULL DEFAULT 'openai',
        api_key TEXT NOT NULL DEFAULT '',
        api_base_url TEXT NOT NULL DEFAULT '',
        is_enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)

    // Models table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS models (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        model_name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT DEFAULT '',
        context_window INTEGER,
        max_output_tokens INTEGER,
        capabilities TEXT DEFAULT '[]',
        pricing_input REAL,
        pricing_output REAL,
        default_params TEXT DEFAULT '{}',
        is_enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (provider_id) REFERENCES model_providers(id) ON DELETE CASCADE
      )
    `)
    this.db.run('CREATE INDEX IF NOT EXISTS idx_models_provider_id ON models(provider_id)')

    // Tools table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS tools (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        description TEXT DEFAULT '',
        category TEXT NOT NULL DEFAULT 'builtin',
        execution TEXT NOT NULL DEFAULT 'server',
        input_schema TEXT DEFAULT '{}',
        output_schema TEXT DEFAULT '{}',
        handler_type TEXT DEFAULT 'function',
        handler_config TEXT DEFAULT '{}',
        is_builtin INTEGER NOT NULL DEFAULT 0,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        permissions TEXT DEFAULT '["all"]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)

    // MCP Servers table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS mcp_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        description TEXT DEFAULT '',
        transport TEXT NOT NULL DEFAULT 'stdio',
        config TEXT NOT NULL DEFAULT '{}',
        is_enabled INTEGER NOT NULL DEFAULT 1,
        last_connected_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)

    // Tool Permissions table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS tool_permissions (
        id TEXT PRIMARY KEY,
        tool_id TEXT NOT NULL,
        role TEXT NOT NULL,
        is_allowed INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (tool_id) REFERENCES tools(id) ON DELETE CASCADE,
        UNIQUE(tool_id, role)
      )
    `)

    // Agent Tools table (many-to-many relationship)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS agent_tools (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        tool_id TEXT NOT NULL,
        config TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
        FOREIGN KEY (tool_id) REFERENCES tools(id) ON DELETE CASCADE,
        UNIQUE(agent_id, tool_id)
      )
    `)

    // System Prompts table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS system_prompts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)

    // Agent Types table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS agent_types (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT DEFAULT '🤖',
        description TEXT DEFAULT '',
        system_prompt_id TEXT,
        backend_type_constraint TEXT,
        execution_mode_constraint TEXT,
        config_schema TEXT DEFAULT '{}',
        is_enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)

    // Seed default agent types and system prompts
    this.seedDefaultAgentTypes()

    // Migrate agents table: add execution_mode, tools_config, mcp_servers columns
    this.migrateAgentToolsColumns()

    // Seed default model providers and models if tables are empty (must run before migrateAgentModelId)
    this.seedDefaultModels()

    // Migrate agents table: add model_id column, migrate old model values, drop model column
    this.migrateAgentModelId()

    // Migrate agents table: add agent_type, agent_config columns
    this.migrateAgentTypeColumns()

    this.saveToFile()
  }

  private saveToFile(): void {
    if (!this.db) { return }
    const data = this.db.export()
    const buffer = Buffer.from(data)
    fs.writeFileSync(this.dbPath, buffer)
  }

  private scheduleSave(): void {
    this._dirty = true
    if (this._saveTimer) { return }
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null
      if (this._dirty) {
        this._dirty = false
        this.saveToFile()
      }
    }, 1000)
  }

  async flush(): Promise<void> {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer)
      this._saveTimer = null
    }
    if (this._dirty) {
      this._dirty = false
      this.saveToFile()
    }
  }

  async ensureReady(): Promise<void> {
    await this.initPromise
    if (!this.db) {
      throw new Error('Database not initialized')
    }
  }

  private async queryAll<T>(sql: string, params: any[], mapper: (row: any) => T): Promise<T[]> {
    await this.ensureReady()
    const stmt = this.db.prepare(sql)
    if (params?.length) {
      stmt.bind(params)
    }
    const rows: any[] = []
    while (stmt.step()) {
      rows.push(stmt.getAsObject())
    }
    stmt.free()
    return rows.map(mapper)
  }

  private async queryOne<T>(sql: string, params: any[], mapper: (row: any) => T): Promise<T | null> {
    await this.ensureReady()
    const stmt = this.db.prepare(sql)
    if (params?.length) {
      stmt.bind(params)
    }
    let row: any = null
    if (stmt.step()) {
      row = stmt.getAsObject()
    }
    stmt.free()
    return row ? mapper(row) : null
  }

  async getConversations(): Promise<ConversationRecord[]> {
    return this.queryAll('SELECT * FROM conversations ORDER BY updated_at DESC', [], this.mapConversation)
  }

  async getConversationById(id: string): Promise<ConversationRecord | null> {
    return this.queryOne('SELECT * FROM conversations WHERE id = ?', [id], this.mapConversation)
  }

  async saveConversation(conv: ConversationRecord): Promise<void> {
    await this.ensureReady()
    this.db.run(
      'INSERT OR REPLACE INTO conversations (id, name, created_at, updated_at, agents) VALUES (?, ?, ?, ?, ?)',
      [conv.id, conv.name, conv.created_at, conv.updated_at, JSON.stringify(conv.agents || {})],
    )
    this.scheduleSave()
  }

  async deleteConversation(id: string): Promise<void> {
    await this.ensureReady()
    this.db.run('DELETE FROM messages WHERE conversation_id = ?', [id])
    this.db.run('DELETE FROM conversations WHERE id = ?', [id])
    this.scheduleSave()
  }

  async getMessages(conversationId: string): Promise<MessageRecord[]> {
    return this.queryAll('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC', [conversationId], this.mapMessage)
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
      ],
    )
    // Also update conversation's updated_at
    this.db.run(
      'UPDATE conversations SET updated_at = ? WHERE id = ?',
      [Math.floor(Date.now() / 1000), msg.conversation_id],
    )
    this.scheduleSave()
  }

  async deleteMessages(conversationId: string): Promise<void> {
    await this.ensureReady()
    this.db.run('DELETE FROM messages WHERE conversation_id = ?', [conversationId])
    this.scheduleSave()
  }

  async deleteMessagesByIds(ids: string[]): Promise<void> {
    await this.ensureReady()
    if (ids.length === 0) { return }
    const placeholders = ids.map(() => '?').join(', ')
    this.db.run(`DELETE FROM messages WHERE id IN (${placeholders})`, ids)
    this.scheduleSave()
  }

  async updateMessageFeedback(id: string, feedback: string): Promise<void> {
    await this.ensureReady()
    this.db.run('UPDATE messages SET feedback = ? WHERE id = ?', [feedback, id])
    this.scheduleSave()
  }

  async updateConversationAgentParams(convId: string, agentId: string, paramsJson: string): Promise<void> {
    await this.ensureReady()
    this.db.run(
      `UPDATE conversations
       SET agents = json_set(COALESCE(agents, '{}'), '$.' || ? || '.params', json(?)),
           updated_at = ?
       WHERE id = ?`,
      [agentId, paramsJson, Math.floor(Date.now() / 1000), convId],
    )
    this.scheduleSave()
  }

  async updateConversationBackendConvId(convId: string, agentId: string, backendConvId: string): Promise<void> {
    await this.ensureReady()
    this.db.run(
      `UPDATE conversations
       SET agents = json_set(COALESCE(agents, '{}'), '$.' || ? || '.backend_conversation_id', ?),
           updated_at = ?
       WHERE id = ?`,
      [agentId, backendConvId, Math.floor(Date.now() / 1000), convId],
    )
    this.scheduleSave()
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

  // ============ Users ============

  async getUserById(id: string): Promise<UserRecord | null> {
    return this.queryOne('SELECT * FROM users WHERE id = ?', [id], this.mapUser)
  }

  async getUsers(): Promise<UserRecord[]> {
    return this.queryAll('SELECT * FROM users ORDER BY created_at DESC', [], this.mapUser)
  }

  async saveUser(user: UserRecord): Promise<void> {
    await this.ensureReady()
    this.db.run(
      `INSERT OR REPLACE INTO users (id, name, role, org_id, is_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user.id, user.name, user.role, user.org_id, user.is_enabled ? 1 : 0, user.created_at, user.updated_at],
    )
    this.scheduleSave()
  }

  async deleteUser(id: string): Promise<void> {
    await this.ensureReady()
    this.db.run('DELETE FROM user_accounts WHERE user_id = ?', [id])
    this.db.run('DELETE FROM users WHERE id = ?', [id])
    this.scheduleSave()
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
    return this.queryOne('SELECT * FROM user_accounts WHERE login_identifier = ?', [identifier], this.mapUserAccount)
  }

  async getUserAccountsByUserId(userId: string): Promise<UserAccountRecord[]> {
    return this.queryAll('SELECT * FROM user_accounts WHERE user_id = ? ORDER BY created_at ASC', [userId], this.mapUserAccount)
  }

  async saveUserAccount(account: UserAccountRecord): Promise<void> {
    await this.ensureReady()
    this.db.run(
      `INSERT OR REPLACE INTO user_accounts (id, user_id, login_type, login_identifier, password_hash, is_primary, is_verified, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [account.id, account.user_id, account.login_type, account.login_identifier, account.password_hash, account.is_primary ? 1 : 0, account.is_verified ? 1 : 0, account.created_at],
    )
    this.scheduleSave()
  }

  async deleteUserAccount(id: string): Promise<void> {
    await this.ensureReady()
    this.db.run('DELETE FROM user_accounts WHERE id = ?', [id])
    this.scheduleSave()
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
    return this.queryAll('SELECT * FROM app_integrations ORDER BY created_at DESC', [], this.mapAppIntegration)
  }

  async getAppIntegrationById(id: string): Promise<AppIntegrationRecord | null> {
    return this.queryOne('SELECT * FROM app_integrations WHERE id = ?', [id], this.mapAppIntegration)
  }

  async getAppIntegrationByAppId(appId: string): Promise<AppIntegrationRecord | null> {
    return this.queryOne('SELECT * FROM app_integrations WHERE app_id = ?', [appId], this.mapAppIntegration)
  }

  async saveAppIntegration(integration: AppIntegrationRecord): Promise<void> {
    await this.ensureReady()
    this.db.run(
      `INSERT OR REPLACE INTO app_integrations (id, name, description, app_id, app_secret, is_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [integration.id, integration.name, integration.description, integration.app_id, integration.app_secret, integration.is_enabled ? 1 : 0, integration.created_at, integration.updated_at],
    )
    this.scheduleSave()
  }

  async deleteAppIntegration(id: string): Promise<void> {
    await this.ensureReady()
    this.db.run('DELETE FROM api_keys WHERE integration_id = ?', [id])
    this.db.run('DELETE FROM app_integrations WHERE id = ?', [id])
    this.scheduleSave()
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
    return this.queryAll('SELECT * FROM api_keys WHERE integration_id = ? ORDER BY created_at DESC', [integrationId], this.mapApiKey)
  }

  async getApiKeyByKeyHash(keyHash: string): Promise<ApiKeyRecord | null> {
    return this.queryOne('SELECT * FROM api_keys WHERE key_hash = ?', [keyHash], this.mapApiKey)
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
      ],
    )
    this.scheduleSave()
  }

  async deleteApiKey(id: string): Promise<void> {
    await this.ensureReady()
    this.db.run('DELETE FROM api_keys WHERE id = ?', [id])
    this.scheduleSave()
  }

  async updateApiKeyLastUsed(id: string): Promise<void> {
    await this.ensureReady()
    this.db.run('UPDATE api_keys SET last_used_at = ? WHERE id = ?', [Math.floor(Date.now() / 1000), id])
    this.scheduleSave()
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

  // ============ Agents ============

  async getAgents(): Promise<AgentRecord[]> {
    return this.queryAll('SELECT * FROM agents ORDER BY created_at DESC', [], this.mapAgent)
  }

  async getAgentById(id: string): Promise<AgentRecord | null> {
    return this.queryOne('SELECT * FROM agents WHERE id = ?', [id], this.mapAgent)
  }

  async getDefaultAgent(): Promise<AgentRecord | null> {
    return this.queryOne('SELECT * FROM agents WHERE is_default = 1 LIMIT 1', [], this.mapAgent)
  }

  async saveAgent(agent: AgentRecord): Promise<void> {
    await this.ensureReady()
    this.db.run(
      `INSERT OR REPLACE INTO agents (id, name, icon, description, backend_type, api_key, api_url, model_id, extra_config, execution_mode, tools_config, mcp_servers, is_default, is_enabled, agent_type, agent_config, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agent.id,
        agent.name,
        agent.icon,
        agent.description,
        agent.backend_type,
        agent.api_key,
        agent.api_url,
        agent.model_id || null,
        agent.extra_config,
        agent.execution_mode || 'chat',
        agent.tools_config || '{}',
        agent.mcp_servers || '[]',
        agent.is_default ? 1 : 0,
        agent.is_enabled ? 1 : 0,
        agent.agent_type || 'general',
        agent.agent_config || '{}',
        agent.created_at,
        agent.updated_at,
      ],
    )
    this.scheduleSave()
  }

  async deleteAgent(id: string): Promise<void> {
    await this.ensureReady()
    this.db.run('DELETE FROM agents WHERE id = ?', [id])
    this.scheduleSave()
  }

  async setDefaultAgent(id: string): Promise<void> {
    await this.ensureReady()
    this.db.run('UPDATE agents SET is_default = 0')
    this.db.run('UPDATE agents SET is_default = 1 WHERE id = ?', [id])
    this.scheduleSave()
  }

  private mapAgent(row: any): AgentRecord {
    return {
      id: row.id as string,
      name: row.name as string,
      icon: (row.icon as string) || '🤖',
      description: (row.description as string) || '',
      backend_type: row.backend_type as AgentRecord['backend_type'],
      api_key: (row.api_key as string) || '',
      api_url: (row.api_url as string) || '',
      model_id: row.model_id as string | null,
      extra_config: (row.extra_config as string) || '{}',
      execution_mode: (row.execution_mode as string) || 'chat',
      tools_config: (row.tools_config as string) || '{}',
      mcp_servers: (row.mcp_servers as string) || '[]',
      is_default: (row.is_default as number) === 1,
      is_enabled: (row.is_enabled as number) === 1,
      agent_type: (row.agent_type as string) || 'general',
      agent_config: (row.agent_config as string) || '{}',
      created_at: row.created_at as number,
      updated_at: row.updated_at as number,
    }
  }

  private migrateAgentToolsColumns(): void {
    const columns = this.db.exec('PRAGMA table_info(agents)')
    if (columns.length === 0) { return }
    const colNames = columns[0].values.map((row: any[]) => row[1] as string)

    if (!colNames.includes('execution_mode')) {
      this.db.run('ALTER TABLE agents ADD COLUMN execution_mode TEXT DEFAULT "chat"')
    }
    if (!colNames.includes('tools_config')) {
      this.db.run('ALTER TABLE agents ADD COLUMN tools_config TEXT DEFAULT "{}"')
    }
    if (!colNames.includes('mcp_servers')) {
      this.db.run('ALTER TABLE agents ADD COLUMN mcp_servers TEXT DEFAULT "[]"')
    }
  }

  private migrateAgentTypeColumns(): void {
    const columns = this.db.exec('PRAGMA table_info(agents)')
    if (columns.length === 0) { return }
    const colNames = columns[0].values.map((row: any[]) => row[1] as string)

    if (!colNames.includes('agent_type')) {
      this.db.run('ALTER TABLE agents ADD COLUMN agent_type TEXT NOT NULL DEFAULT "general"')
      console.log('[DB] Added agent_type column to agents table')
    }
    if (!colNames.includes('agent_config')) {
      this.db.run('ALTER TABLE agents ADD COLUMN agent_config TEXT DEFAULT "{}"')
      console.log('[DB] Added agent_config column to agents table')
    }
  }

  private migrateAgentModelId(): void {
    const columns = this.db.exec('PRAGMA table_info(agents)')
    if (columns.length === 0) { return }
    const colNames = columns[0].values.map((row: any[]) => row[1] as string)

    if (!colNames.includes('model_id')) {
      this.db.run('ALTER TABLE agents ADD COLUMN model_id TEXT')
      console.log('[DB] Added model_id column to agents table')
    }

    // Migrate existing model values to model_id before dropping the column
    if (colNames.includes('model')) {
      const agentsWithModel = this.db.exec('SELECT id, model FROM agents WHERE model IS NOT NULL AND model != ""')
      if (agentsWithModel.length > 0 && agentsWithModel[0].values.length > 0) {
        // Build model_name → model_id lookup from models table
        const modelsResult = this.db.exec('SELECT id, model_name FROM models')
        const modelLookup = new Map<string, string>()
        if (modelsResult.length > 0) {
          for (const row of modelsResult[0].values) {
            modelLookup.set(row[1] as string, row[0] as string)
          }
        }
        for (const row of agentsWithModel[0].values) {
          const agentId = row[0] as string
          const modelName = row[1] as string
          const modelId = modelLookup.get(modelName)
          if (modelId) {
            this.db.run('UPDATE agents SET model_id = ? WHERE id = ?', [modelId, agentId])
            console.log(`[DB] Migrated agent ${agentId}: model "${modelName}" → model_id "${modelId}"`)
          }
        }
      }

      // Drop model column (requires SQLite 3.35+)
      try {
        this.db.run('ALTER TABLE agents DROP COLUMN model')
        console.log('[DB] Dropped model column from agents table')
      }
      catch (e) {
        console.warn('[DB] Could not drop model column (older SQLite):', (e as Error).message)
      }
    }
  }

  private seedDefaultAgentTypes(): void {
    // Only seed if agent_types table is empty
    const result = this.db.exec('SELECT COUNT(*) as cnt FROM agent_types')
    const count = result.length > 0 ? result[0].values[0][0] as number : 0
    if (count > 0) { return }

    const now = Math.floor(Date.now() / 1000)

    // Create built-in system prompt for data query agent
    const dataQueryPromptId = 'prompt-data-query-default'
    const dataQueryPrompt = `# 角色定义
你是一个专业的数据分析助手，能够通过查询数据库回答用户的数据问题。

# 工作流程
1. **理解问题**：分析用户的数据查询需求，明确要查询的指标和维度
2. **分析数据结构**：查看可用的表和字段，理解数据模型
3. **编写查询**：使用 SQL 查询工具获取数据
4. **解读结果**：将查询结果转化为易懂的回答

# 数据安全规范（最高优先级）
- **只允许生成 SELECT 查询语句**
- **严格禁止生成以下类型的 SQL**：UPDATE、DELETE、INSERT、ALTER、DROP、TRUNCATE、CREATE、GRANT、REVOKE 等任何可修改或删除数据的语句
- **即使用户明确要求修改或删除数据，也必须拒绝执行**
- **如果用户间接要求（如"帮我清理数据"、"更新一下记录"、"删除这条数据"），必须明确拒绝并说明原因**
- **拒绝话术示例**："抱歉，我是一个只读的数据查询助手，无法执行任何修改或删除数据的操作。如果您需要修改数据，请联系数据库管理员。"

# SQL 编写规范
- 使用标准 SQL 语法
- 优先使用已提供的业务术语定义
- 注意处理 NULL 值
- 对于聚合查询，使用合适的 GROUP BY
- 限制结果集大小，避免返回过多数据
- 使用中文别名，方便用户理解

# 回答规范
- 先确认用户想查的指标
- 用表格或图表展示结果
- 提供简要的数据解读
- 如果查询失败，说明原因并提供替代方案

# 业务知识使用
- 参考已配置的业务术语理解指标含义
- 使用已配置的查询示例作为参考
- 遵循已配置的业务规则`

    this.db.run(
      'INSERT OR IGNORE INTO system_prompts (id, name, description, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [dataQueryPromptId, '问数智能体默认提示词', '数据查询场景的基础提示词，包含SQL编写规范、回答规范等', dataQueryPrompt, now, now],
    )

    // Seed agent types
    this.db.run(
      'INSERT OR IGNORE INTO agent_types (id, name, icon, description, system_prompt_id, backend_type_constraint, execution_mode_constraint, is_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['type-general', '通用智能体', '🤖', '标准对话智能体，支持多种后端', null, null, null, 1, now, now],
    )

    this.db.run(
      'INSERT OR IGNORE INTO agent_types (id, name, icon, description, system_prompt_id, backend_type_constraint, execution_mode_constraint, is_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['type-data-query', '问数智能体', '📊', '专用于数据查询，可配置数据源和业务知识', dataQueryPromptId, '["direct_llm"]', '["react"]', 1, now, now],
    )

    console.log('[DB] Seeded default agent types and system prompts')
  }

  private seedDefaultModels(): void {
    // Only seed if model_providers table is empty
    const result = this.db.exec('SELECT COUNT(*) as cnt FROM model_providers')
    const count = result.length > 0 ? result[0].values[0][0] as number : 0
    if (count > 0) { return }

    const now = Math.floor(Date.now() / 1000)

    // Provider type definitions with API base URLs
    const providers: { id: string, name: string, provider_type: string, api_base_url: string }[] = [
      { id: 'provider-openai', name: 'OpenAI', provider_type: 'openai', api_base_url: 'https://api.openai.com/v1' },
      { id: 'provider-anthropic', name: 'Anthropic', provider_type: 'anthropic', api_base_url: 'https://api.anthropic.com' },
      { id: 'provider-deepseek', name: 'DeepSeek', provider_type: 'openai', api_base_url: 'https://api.deepseek.com' },
      { id: 'provider-siliconflow', name: '硅基流动 (SiliconFlow)', provider_type: 'openai', api_base_url: 'https://api.siliconflow.cn/v1' },
      { id: 'provider-google', name: 'Google', provider_type: 'openai', api_base_url: 'https://generativelanguage.googleapis.com/v1beta' },
      { id: 'provider-dashscope', name: '阿里云百炼 (DashScope)', provider_type: 'openai', api_base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
      { id: 'provider-zhipu', name: '智谱 AI (Zhipu)', provider_type: 'openai', api_base_url: 'https://open.bigmodel.cn/api/paas/v4' },
      { id: 'provider-moonshot', name: 'Kimi / Moonshot AI', provider_type: 'openai', api_base_url: 'https://api.moonshot.cn/v1' },
      { id: 'provider-minimax', name: 'MiniMax', provider_type: 'openai', api_base_url: 'https://api.minimax.chat/v1' },
      { id: 'provider-yi', name: '零一万物 (01.AI)', provider_type: 'openai', api_base_url: 'https://api.lingyiwanwu.com/v1' },
      { id: 'provider-baichuan', name: '百川智能 (Baichuan)', provider_type: 'openai', api_base_url: 'https://api.baichuan-ai.com/v1' },
      { id: 'provider-xiaomi', name: '小米 MiMo (Xiaomi)', provider_type: 'openai', api_base_url: 'https://api.xiaomimimo.com/v1' },
      { id: 'provider-hunyuan', name: '腾讯混元 (Hunyuan)', provider_type: 'openai', api_base_url: 'https://api.hunyuan.cloud.tencent.com/v1' },
    ]

    // Model definitions grouped by provider
    const models: {
      id: string
      provider_id: string
      model_name: string
      display_name: string
      description: string
      context_window: number
      max_output_tokens: number
      capabilities: string[]
      pricing_input: number | null
      pricing_output: number | null
    }[] = [
      // OpenAI
      { id: 'model-gpt-4o', provider_id: 'provider-openai', model_name: 'gpt-4o', display_name: 'GPT-4o', description: 'OpenAI 旗舰多模态模型，支持文本和图像输入', context_window: 128000, max_output_tokens: 16384, capabilities: ['vision', 'function_calling', 'streaming'], pricing_input: 2.50, pricing_output: 10.00 },
      { id: 'model-gpt-4o-mini', provider_id: 'provider-openai', model_name: 'gpt-4o-mini', display_name: 'GPT-4o Mini', description: '轻量级多模态模型，性价比高', context_window: 128000, max_output_tokens: 16384, capabilities: ['vision', 'function_calling', 'streaming'], pricing_input: 0.15, pricing_output: 0.60 },
      { id: 'model-gpt-4-turbo', provider_id: 'provider-openai', model_name: 'gpt-4-turbo', display_name: 'GPT-4 Turbo', description: 'GPT-4 改进版，128K 上下文', context_window: 128000, max_output_tokens: 4096, capabilities: ['vision', 'function_calling', 'streaming'], pricing_input: 10.00, pricing_output: 30.00 },
      { id: 'model-gpt-35-turbo', provider_id: 'provider-openai', model_name: 'gpt-3.5-turbo', display_name: 'GPT-3.5 Turbo', description: '快速且经济的模型', context_window: 16385, max_output_tokens: 4096, capabilities: ['function_calling', 'streaming'], pricing_input: 0.50, pricing_output: 1.50 },
      { id: 'model-o1', provider_id: 'provider-openai', model_name: 'o1', display_name: 'o1', description: '推理模型，擅长复杂逻辑和数学', context_window: 200000, max_output_tokens: 100000, capabilities: ['streaming'], pricing_input: 15.00, pricing_output: 60.00 },
      { id: 'model-o1-mini', provider_id: 'provider-openai', model_name: 'o1-mini', display_name: 'o1-mini', description: '轻量级推理模型', context_window: 128000, max_output_tokens: 65536, capabilities: ['streaming'], pricing_input: 3.00, pricing_output: 12.00 },
      { id: 'model-o3-mini', provider_id: 'provider-openai', model_name: 'o3-mini', display_name: 'o3-mini', description: '新一代轻量级推理模型', context_window: 200000, max_output_tokens: 100000, capabilities: ['streaming'], pricing_input: 1.10, pricing_output: 4.40 },
      // Anthropic
      { id: 'model-claude-35-sonnet', provider_id: 'provider-anthropic', model_name: 'claude-3-5-sonnet-20241022', display_name: 'Claude 3.5 Sonnet', description: 'Anthropic 旗舰模型，综合能力最强', context_window: 200000, max_output_tokens: 8192, capabilities: ['vision', 'function_calling', 'streaming'], pricing_input: 3.00, pricing_output: 15.00 },
      { id: 'model-claude-35-haiku', provider_id: 'provider-anthropic', model_name: 'claude-3-5-haiku-20241022', display_name: 'Claude 3.5 Haiku', description: '快速轻量模型，响应速度极快', context_window: 200000, max_output_tokens: 8192, capabilities: ['vision', 'function_calling', 'streaming'], pricing_input: 1.00, pricing_output: 5.00 },
      { id: 'model-claude-3-opus', provider_id: 'provider-anthropic', model_name: 'claude-3-opus-20240229', display_name: 'Claude 3 Opus', description: '最强大的推理能力', context_window: 200000, max_output_tokens: 4096, capabilities: ['vision', 'function_calling', 'streaming'], pricing_input: 15.00, pricing_output: 75.00 },
      // DeepSeek
      { id: 'model-deepseek-v3', provider_id: 'provider-deepseek', model_name: 'deepseek-chat', display_name: 'DeepSeek V3', description: 'DeepSeek 旗舰对话模型，中英文能力优秀', context_window: 64000, max_output_tokens: 8192, capabilities: ['function_calling', 'streaming'], pricing_input: 0.27, pricing_output: 1.10 },
      { id: 'model-deepseek-r1', provider_id: 'provider-deepseek', model_name: 'deepseek-reasoner', display_name: 'DeepSeek R1', description: 'DeepSeek 推理模型，擅长数学和代码', context_window: 64000, max_output_tokens: 8192, capabilities: ['streaming'], pricing_input: 0.55, pricing_output: 2.19 },
      // SiliconFlow
      { id: 'model-sf-deepseek-v3', provider_id: 'provider-siliconflow', model_name: 'deepseek-ai/DeepSeek-V3', display_name: 'DeepSeek V3 (硅基流动)', description: '硅基流动托管的 DeepSeek V3', context_window: 64000, max_output_tokens: 8192, capabilities: ['function_calling', 'streaming'], pricing_input: 1.00, pricing_output: 2.00 },
      { id: 'model-sf-deepseek-r1', provider_id: 'provider-siliconflow', model_name: 'deepseek-ai/DeepSeek-R1', display_name: 'DeepSeek R1 (硅基流动)', description: '硅基流动托管的 DeepSeek R1', context_window: 64000, max_output_tokens: 8192, capabilities: ['streaming'], pricing_input: 4.00, pricing_output: 16.00 },
      { id: 'model-sf-deepseek-v4-flash', provider_id: 'provider-siliconflow', model_name: 'deepseek-ai/DeepSeek-V4-Flash', display_name: 'DeepSeek V4 Flash (硅基流动)', description: 'DeepSeek-V4 预览版 MoE 模型，284B 参数/13B 激活，1M 上下文', context_window: 1048576, max_output_tokens: 65536, capabilities: ['function_calling', 'streaming'], pricing_input: 1.00, pricing_output: 2.00 },
      { id: 'model-sf-deepseek-v4-pro', provider_id: 'provider-siliconflow', model_name: 'deepseek-ai/DeepSeek-V4-Pro', display_name: 'DeepSeek V4 Pro (硅基流动)', description: 'DeepSeek-V4 旗舰 MoE 模型，1.6T 参数/49B 激活，1M 上下文', context_window: 1048576, max_output_tokens: 65536, capabilities: ['function_calling', 'streaming'], pricing_input: 12.00, pricing_output: 24.00 },
      { id: 'model-sf-qwen25-72b', provider_id: 'provider-siliconflow', model_name: 'Qwen/Qwen2.5-72B-Instruct', display_name: 'Qwen2.5 72B (硅基流动)', description: '通义千问 72B，中文能力优秀', context_window: 32768, max_output_tokens: 8192, capabilities: ['function_calling', 'streaming'], pricing_input: 1.26, pricing_output: 1.26 },
      { id: 'model-sf-glm4-9b', provider_id: 'provider-siliconflow', model_name: 'THUDM/glm-4-9b-chat', display_name: 'GLM-4 9B (硅基流动)', description: '智谱 GLM-4 轻量版', context_window: 131072, max_output_tokens: 8192, capabilities: ['streaming'], pricing_input: 0.0, pricing_output: 0.0 },
      // Google Gemini
      { id: 'model-gemini-2-flash', provider_id: 'provider-google', model_name: 'gemini-2.0-flash', display_name: 'Gemini 2.0 Flash', description: 'Google 最新快速模型，原生多模态', context_window: 1048576, max_output_tokens: 8192, capabilities: ['vision', 'function_calling', 'streaming'], pricing_input: 0.10, pricing_output: 0.40 },
      { id: 'model-gemini-15-pro', provider_id: 'provider-google', model_name: 'gemini-1.5-pro', display_name: 'Gemini 1.5 Pro', description: 'Google 高性能模型，超长上下文', context_window: 2097152, max_output_tokens: 8192, capabilities: ['vision', 'function_calling', 'streaming'], pricing_input: 1.25, pricing_output: 5.00 },
      { id: 'model-gemini-15-flash', provider_id: 'provider-google', model_name: 'gemini-1.5-flash', display_name: 'Gemini 1.5 Flash', description: 'Google 快速模型，性价比高', context_window: 1048576, max_output_tokens: 8192, capabilities: ['vision', 'function_calling', 'streaming'], pricing_input: 0.075, pricing_output: 0.30 },
      // 阿里云百炼
      { id: 'model-qwen-max', provider_id: 'provider-dashscope', model_name: 'qwen-max', display_name: '通义千问 Max', description: '阿里最强模型，复杂任务能力优秀', context_window: 32768, max_output_tokens: 8192, capabilities: ['function_calling', 'streaming'], pricing_input: 2.40, pricing_output: 9.60 },
      { id: 'model-qwen-plus', provider_id: 'provider-dashscope', model_name: 'qwen-plus', display_name: '通义千问 Plus', description: '均衡性能和成本', context_window: 131072, max_output_tokens: 8192, capabilities: ['function_calling', 'streaming'], pricing_input: 0.80, pricing_output: 2.00 },
      { id: 'model-qwen-turbo', provider_id: 'provider-dashscope', model_name: 'qwen-turbo', display_name: '通义千问 Turbo', description: '快速轻量，适合简单任务', context_window: 131072, max_output_tokens: 8192, capabilities: ['function_calling', 'streaming'], pricing_input: 0.30, pricing_output: 0.60 },
      // 智谱 AI (Zhipu)
      { id: 'model-glm-4', provider_id: 'provider-zhipu', model_name: 'glm-4', display_name: 'GLM-4', description: '智谱旗舰模型，综合能力优秀', context_window: 128000, max_output_tokens: 8192, capabilities: ['function_calling', 'streaming'], pricing_input: 10.00, pricing_output: 10.00 },
      { id: 'model-glm-4-flash', provider_id: 'provider-zhipu', model_name: 'glm-4-flash', display_name: 'GLM-4 Flash', description: '智谱轻量模型，响应速度快', context_window: 128000, max_output_tokens: 8192, capabilities: ['streaming'], pricing_input: 0.0, pricing_output: 0.0 },
      { id: 'model-glm-4-air', provider_id: 'provider-zhipu', model_name: 'glm-4-air', display_name: 'GLM-4 Air', description: '智谱高性价比模型', context_window: 128000, max_output_tokens: 8192, capabilities: ['function_calling', 'streaming'], pricing_input: 1.00, pricing_output: 1.00 },
      { id: 'model-glm-4-long', provider_id: 'provider-zhipu', model_name: 'glm-4-long', display_name: 'GLM-4 Long', description: '智谱超长文本模型，支持 1M tokens', context_window: 1000000, max_output_tokens: 8192, capabilities: ['streaming'], pricing_input: 1.00, pricing_output: 1.00 },
      // Kimi / Moonshot AI
      { id: 'model-moonshot-v1-8k', provider_id: 'provider-moonshot', model_name: 'moonshot-v1-8k', display_name: 'Moonshot V1 8K', description: 'Kimi 基础模型，8K 上下文', context_window: 8192, max_output_tokens: 4096, capabilities: ['function_calling', 'streaming'], pricing_input: 1.00, pricing_output: 1.00 },
      { id: 'model-moonshot-v1-32k', provider_id: 'provider-moonshot', model_name: 'moonshot-v1-32k', display_name: 'Moonshot V1 32K', description: 'Kimi 中等上下文模型', context_window: 32768, max_output_tokens: 4096, capabilities: ['function_calling', 'streaming'], pricing_input: 2.00, pricing_output: 2.00 },
      { id: 'model-moonshot-v1-128k', provider_id: 'provider-moonshot', model_name: 'moonshot-v1-128k', display_name: 'Moonshot V1 128K', description: 'Kimi 超长上下文模型，擅长长文档分析', context_window: 131072, max_output_tokens: 4096, capabilities: ['function_calling', 'streaming'], pricing_input: 6.00, pricing_output: 6.00 },
      // MiniMax
      { id: 'model-abab65s', provider_id: 'provider-minimax', model_name: 'abab6.5s-chat', display_name: 'ABAB 6.5s', description: 'MiniMax 轻量快速模型', context_window: 245760, max_output_tokens: 4096, capabilities: ['function_calling', 'streaming'], pricing_input: 0.50, pricing_output: 0.50 },
      { id: 'model-abab65', provider_id: 'provider-minimax', model_name: 'abab6.5-chat', display_name: 'ABAB 6.5', description: 'MiniMax 旗舰模型，综合能力优秀', context_window: 245760, max_output_tokens: 4096, capabilities: ['function_calling', 'streaming'], pricing_input: 5.00, pricing_output: 5.00 },
      { id: 'model-abab55', provider_id: 'provider-minimax', model_name: 'abab5.5-chat', display_name: 'ABAB 5.5', description: 'MiniMax 中端模型', context_window: 16384, max_output_tokens: 4096, capabilities: ['streaming'], pricing_input: 0.50, pricing_output: 0.50 },
      // 零一万物 (01.AI / Yi)
      { id: 'model-yi-large', provider_id: 'provider-yi', model_name: 'yi-large', display_name: 'Yi Large', description: '零一旗舰模型，综合能力优秀', context_window: 32768, max_output_tokens: 4096, capabilities: ['function_calling', 'streaming'], pricing_input: 3.00, pricing_output: 3.00 },
      { id: 'model-yi-medium', provider_id: 'provider-yi', model_name: 'yi-medium', display_name: 'Yi Medium', description: '零一均衡模型', context_window: 16384, max_output_tokens: 4096, capabilities: ['function_calling', 'streaming'], pricing_input: 0.60, pricing_output: 0.60 },
      { id: 'model-yi-spark', provider_id: 'provider-yi', model_name: 'yi-spark', display_name: 'Yi Spark', description: '零一轻量模型，响应速度快', context_window: 16384, max_output_tokens: 4096, capabilities: ['streaming'], pricing_input: 0.10, pricing_output: 0.10 },
      // 百川智能 (Baichuan)
      { id: 'model-baichuan4', provider_id: 'provider-baichuan', model_name: 'Baichuan4', display_name: '百川 4', description: '百川旗舰模型，中文能力优秀', context_window: 32768, max_output_tokens: 4096, capabilities: ['function_calling', 'streaming'], pricing_input: 3.00, pricing_output: 3.00 },
      { id: 'model-baichuan3-turbo', provider_id: 'provider-baichuan', model_name: 'Baichuan3-Turbo', display_name: '百川 3 Turbo', description: '百川轻量模型', context_window: 32768, max_output_tokens: 4096, capabilities: ['streaming'], pricing_input: 1.00, pricing_output: 1.00 },
      // 小米 MiMo (Xiaomi)
      { id: 'model-mimo-v25-pro', provider_id: 'provider-xiaomi', model_name: 'mimo-v2.5-pro', display_name: 'MiMo V2.5 Pro', description: '小米旗舰模型，复杂推理、深度分析、长文档处理', context_window: 1000000, max_output_tokens: 131072, capabilities: ['function_calling', 'streaming'], pricing_input: 3.00, pricing_output: 6.00 },
      { id: 'model-mimo-v25', provider_id: 'provider-xiaomi', model_name: 'mimo-v2.5', display_name: 'MiMo V2.5', description: '小米全模态模型，支持文本/图片/音频/视频理解 + 深度思考', context_window: 1000000, max_output_tokens: 131072, capabilities: ['vision', 'function_calling', 'streaming'], pricing_input: 1.00, pricing_output: 2.00 },
      { id: 'model-mimo-v2-flash', provider_id: 'provider-xiaomi', model_name: 'mimo-v2-flash', display_name: 'MiMo V2 Flash', description: '小米轻量模型，低成本快速响应', context_window: 256000, max_output_tokens: 65536, capabilities: ['function_calling', 'streaming'], pricing_input: 0.70, pricing_output: 2.10 },
      // 腾讯混元 (Hunyuan)
      { id: 'model-hunyuan-pro', provider_id: 'provider-hunyuan', model_name: 'hunyuan-pro', display_name: '混元 Pro', description: '腾讯旗舰模型，长文本能力优秀', context_window: 32768, max_output_tokens: 4096, capabilities: ['function_calling', 'streaming'], pricing_input: 3.00, pricing_output: 3.00 },
      { id: 'model-hunyuan-standard', provider_id: 'provider-hunyuan', model_name: 'hunyuan-standard', display_name: '混元 Standard', description: '腾讯均衡模型', context_window: 32768, max_output_tokens: 4096, capabilities: ['streaming'], pricing_input: 0.45, pricing_output: 0.45 },
      { id: 'model-hunyuan-lite', provider_id: 'provider-hunyuan', model_name: 'hunyuan-lite', display_name: '混元 Lite', description: '腾讯轻量模型', context_window: 256000, max_output_tokens: 4096, capabilities: ['streaming'], pricing_input: 0.0, pricing_output: 0.0 },
    ]

    // Insert providers
    for (const p of providers) {
      this.db.run(
        'INSERT OR IGNORE INTO model_providers (id, name, provider_type, api_key, api_base_url, is_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [p.id, p.name, p.provider_type, '', p.api_base_url, 1, now, now],
      )
    }

    // Insert models
    for (const m of models) {
      this.db.run(
        'INSERT OR IGNORE INTO models (id, provider_id, model_name, display_name, description, context_window, max_output_tokens, capabilities, pricing_input, pricing_output, default_params, is_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [m.id, m.provider_id, m.model_name, m.display_name, m.description, m.context_window, m.max_output_tokens, JSON.stringify(m.capabilities), m.pricing_input, m.pricing_output, '{}', 1, now, now],
      )
    }

    console.log(`[DB] Seeded ${providers.length} model providers and ${models.length} models`)
  }

  // ============ Model Providers ============

  async getModelProviders(): Promise<ModelProvider[]> {
    return this.queryAll('SELECT * FROM model_providers ORDER BY created_at DESC', [], this.mapModelProvider)
  }

  async getModelProviderById(id: string): Promise<ModelProvider | null> {
    return this.queryOne('SELECT * FROM model_providers WHERE id = ?', [id], this.mapModelProvider)
  }

  async saveModelProvider(provider: ModelProvider): Promise<void> {
    await this.ensureReady()
    this.db.run(
      `INSERT OR REPLACE INTO model_providers (id, name, provider_type, api_key, api_base_url, is_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        provider.id,
        provider.name,
        provider.provider_type,
        provider.api_key,
        provider.api_base_url,
        provider.is_enabled ? 1 : 0,
        provider.created_at,
        provider.updated_at,
      ],
    )
    this.scheduleSave()
  }

  async deleteModelProvider(id: string): Promise<void> {
    await this.ensureReady()
    // 清理引用该 provider 下 model 的 agent
    this.db.run(
      'UPDATE agents SET model_id = NULL WHERE model_id IN (SELECT id FROM models WHERE provider_id = ?)',
      [id],
    )
    this.db.run('DELETE FROM models WHERE provider_id = ?', [id])
    this.db.run('DELETE FROM model_providers WHERE id = ?', [id])
    this.scheduleSave()
  }

  private mapModelProvider(row: any): ModelProvider {
    return {
      id: row.id as string,
      name: row.name as string,
      provider_type: row.provider_type as ModelProvider['provider_type'],
      api_key: (row.api_key as string) || '',
      api_base_url: (row.api_base_url as string) || '',
      is_enabled: (row.is_enabled as number) === 1,
      created_at: row.created_at as number,
      updated_at: row.updated_at as number,
    }
  }

  // ============ Models ============

  async getModels(): Promise<Model[]> {
    return this.queryAll('SELECT * FROM models ORDER BY provider_id, display_name', [], this.mapModel)
  }

  async getModelsByProvider(providerId: string): Promise<Model[]> {
    return this.queryAll('SELECT * FROM models WHERE provider_id = ? ORDER BY display_name', [providerId], this.mapModel)
  }

  async getModelById(id: string): Promise<Model | null> {
    return this.queryOne('SELECT * FROM models WHERE id = ?', [id], this.mapModel)
  }

  async saveModel(model: Model): Promise<void> {
    await this.ensureReady()
    this.db.run(
      `INSERT OR REPLACE INTO models (id, provider_id, model_name, display_name, description, context_window, max_output_tokens, capabilities, pricing_input, pricing_output, default_params, is_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        model.id,
        model.provider_id,
        model.model_name,
        model.display_name,
        model.description || '',
        model.context_window,
        model.max_output_tokens,
        JSON.stringify(model.capabilities || []),
        model.pricing_input,
        model.pricing_output,
        JSON.stringify(model.default_params || {}),
        model.is_enabled ? 1 : 0,
        model.created_at,
        model.updated_at,
      ],
    )
    this.scheduleSave()
  }

  async deleteModel(id: string): Promise<void> {
    await this.ensureReady()
    // 清理引用该 model 的 agent
    this.db.run('UPDATE agents SET model_id = NULL WHERE model_id = ?', [id])
    this.db.run('DELETE FROM models WHERE id = ?', [id])
    this.scheduleSave()
  }

  private mapModel(row: any): Model {
    return {
      id: row.id as string,
      provider_id: row.provider_id as string,
      model_name: row.model_name as string,
      display_name: row.display_name as string,
      description: (row.description as string) || '',
      context_window: row.context_window as number | null,
      max_output_tokens: row.max_output_tokens as number | null,
      capabilities: typeof row.capabilities === 'string' ? JSON.parse(row.capabilities) : (row.capabilities as string[]) || [],
      pricing_input: row.pricing_input as number | null,
      pricing_output: row.pricing_output as number | null,
      default_params: typeof row.default_params === 'string' ? JSON.parse(row.default_params) : (row.default_params as Record<string, any>) || {},
      is_enabled: (row.is_enabled as number) === 1,
      created_at: row.created_at as number,
      updated_at: row.updated_at as number,
    }
  }

  // ============ Agent Types ============

  async getAgentTypes(): Promise<import('@/types/agent-type').AgentTypeRecord[]> {
    return this.queryAll('SELECT * FROM agent_types ORDER BY created_at DESC', [], this.mapAgentType)
  }

  async getAgentTypeById(id: string): Promise<import('@/types/agent-type').AgentTypeRecord | null> {
    return this.queryOne('SELECT * FROM agent_types WHERE id = ?', [id], this.mapAgentType)
  }

  async saveAgentType(agentType: import('@/types/agent-type').AgentTypeRecord): Promise<void> {
    await this.ensureReady()
    this.db.run(
      `INSERT OR REPLACE INTO agent_types (id, name, icon, description, system_prompt_id, backend_type_constraint, execution_mode_constraint, config_schema, is_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agentType.id,
        agentType.name,
        agentType.icon,
        agentType.description,
        agentType.system_prompt_id,
        agentType.backend_type_constraint,
        agentType.execution_mode_constraint,
        agentType.config_schema,
        agentType.is_enabled ? 1 : 0,
        agentType.created_at,
        agentType.updated_at,
      ],
    )
    this.scheduleSave()
  }

  async deleteAgentType(id: string): Promise<void> {
    await this.ensureReady()
    this.db.run('DELETE FROM agent_types WHERE id = ?', [id])
    this.scheduleSave()
  }

  private mapAgentType(row: any): import('@/types/agent-type').AgentTypeRecord {
    return {
      id: row.id as string,
      name: row.name as string,
      icon: (row.icon as string) || '🤖',
      description: (row.description as string) || '',
      system_prompt_id: row.system_prompt_id as string | null,
      backend_type_constraint: row.backend_type_constraint as string | null,
      execution_mode_constraint: row.execution_mode_constraint as string | null,
      config_schema: (row.config_schema as string) || '{}',
      is_enabled: (row.is_enabled as number) === 1,
      created_at: row.created_at as number,
      updated_at: row.updated_at as number,
    }
  }

  // ============ System Prompts ============

  async getSystemPrompts(): Promise<import('@/types/system-prompt').SystemPromptRecord[]> {
    return this.queryAll('SELECT * FROM system_prompts ORDER BY created_at DESC', [], this.mapSystemPrompt)
  }

  async getSystemPromptById(id: string): Promise<import('@/types/system-prompt').SystemPromptRecord | null> {
    return this.queryOne('SELECT * FROM system_prompts WHERE id = ?', [id], this.mapSystemPrompt)
  }

  async saveSystemPrompt(prompt: import('@/types/system-prompt').SystemPromptRecord): Promise<void> {
    await this.ensureReady()
    this.db.run(
      `INSERT OR REPLACE INTO system_prompts (id, name, description, content, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [prompt.id, prompt.name, prompt.description, prompt.content, prompt.created_at, prompt.updated_at],
    )
    this.scheduleSave()
  }

  async deleteSystemPrompt(id: string): Promise<void> {
    await this.ensureReady()
    // 清理引用该提示词的智能体类型
    this.db.run('UPDATE agent_types SET system_prompt_id = NULL WHERE system_prompt_id = ?', [id])
    this.db.run('DELETE FROM system_prompts WHERE id = ?', [id])
    this.scheduleSave()
  }

  private mapSystemPrompt(row: any): import('@/types/system-prompt').SystemPromptRecord {
    return {
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string) || '',
      content: row.content as string,
      created_at: row.created_at as number,
      updated_at: row.updated_at as number,
    }
  }
}
