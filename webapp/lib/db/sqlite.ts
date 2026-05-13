import path from 'path'
import fs from 'fs'
import type { ConversationRecord, MessageRecord } from '../storage/types'
import type { DatabaseProvider } from './types'
import type { StorageProvider } from '../storage/types'
import type { EmbedTokenRecord } from '@/types/embed'

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
}
