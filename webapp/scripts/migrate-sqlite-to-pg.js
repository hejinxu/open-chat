/**
 * SQLite to PostgreSQL migration script
 *
 * Usage:
 *   node scripts/migrate-sqlite-to-pg.js
 *
 * Environment variables:
 *   SQLITE_DB_PATH  - Path to SQLite database (default: data/openchat.db)
 *   POSTGRES_URL    - PostgreSQL connection string (default: postgresql://postgres:postgres123@127.0.0.1:5432/open-chat)
 */

const path = require('path')
const fs = require('fs')

// SQLite setup
const initSqlJs = require('sql.js')

// PostgreSQL setup
const { Pool } = require('pg')

const SQLITE_DB_PATH = process.env.SQLITE_DB_PATH || path.join(__dirname, '..', 'data', 'openchat.db')
const POSTGRES_URL = process.env.POSTGRES_URL || 'postgresql://postgres:postgres123@127.0.0.1:5432/open-chat'

// Tables in dependency order
const TABLES = [
  'users',
  'user_accounts',
  'app_integrations',
  'api_keys',
  'model_providers',
  'models',
  'agents',
  'tools',
  'tool_permissions',
  'agent_tools',
  'mcp_servers',
  'conversations',
  'messages',
]

// Column definitions for type conversion
const BOOLEAN_COLUMNS = {
  users: ['is_enabled'],
  user_accounts: ['is_primary', 'is_verified'],
  app_integrations: ['is_enabled'],
  api_keys: ['is_enabled'],
  model_providers: ['is_enabled'],
  models: ['is_enabled'],
  agents: ['is_default', 'is_enabled'],
  tools: ['is_builtin', 'is_enabled'],
  tool_permissions: ['is_allowed'],
  mcp_servers: ['is_enabled'],
}

const JSON_COLUMNS = {
  conversations: ['agents'],
  messages: ['feedback', 'message_files', 'agent_thoughts'],
  api_keys: ['allowed_agent_ids'],
  agents: ['extra_config', 'tools_config', 'mcp_servers'],
  models: ['capabilities', 'default_params'],
  tools: ['input_schema', 'output_schema', 'handler_config', 'permissions'],
  mcp_servers: ['config'],
  tool_permissions: [],
  agent_tools: ['config'],
}

async function ensureTables(pgPool) {
  const client = await pgPool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id VARCHAR(255) PRIMARY KEY,
        name TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        agents JSONB NOT NULL DEFAULT '{}'::jsonb
      )
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id VARCHAR(255) PRIMARY KEY,
        conversation_id VARCHAR(255) NOT NULL,
        agent_id VARCHAR(255),
        agent_name VARCHAR(255),
        role VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        is_answer BOOLEAN NOT NULL DEFAULT false,
        feedback JSONB,
        message_files JSONB NOT NULL DEFAULT '[]'::jsonb,
        agent_thoughts JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at BIGINT NOT NULL
      )
    `)

    await client.query('CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id)')
    await client.query('CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)')

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        role VARCHAR(50) NOT NULL DEFAULT 'user',
        org_id VARCHAR(255),
        is_enabled BOOLEAN NOT NULL DEFAULT true,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_accounts (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        login_type VARCHAR(50) NOT NULL,
        login_identifier VARCHAR(255) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL DEFAULT '',
        is_primary BOOLEAN NOT NULL DEFAULT false,
        is_verified BOOLEAN NOT NULL DEFAULT false,
        created_at BIGINT NOT NULL
      )
    `)
    await client.query('CREATE INDEX IF NOT EXISTS idx_user_accounts_user_id ON user_accounts(user_id)')

    await client.query(`
      CREATE TABLE IF NOT EXISTS app_integrations (
        id VARCHAR(255) PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        app_id VARCHAR(255) NOT NULL UNIQUE,
        app_secret TEXT NOT NULL DEFAULT '',
        is_enabled BOOLEAN NOT NULL DEFAULT true,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id VARCHAR(255) PRIMARY KEY,
        integration_id VARCHAR(255) NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        key_prefix VARCHAR(50) NOT NULL,
        key_hash TEXT NOT NULL,
        allowed_agent_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        expires_at BIGINT,
        last_used_at BIGINT,
        is_enabled BOOLEAN NOT NULL DEFAULT true,
        created_at BIGINT NOT NULL
      )
    `)
    await client.query('CREATE INDEX IF NOT EXISTS idx_api_keys_integration_id ON api_keys(integration_id)')

    await client.query(`
      CREATE TABLE IF NOT EXISTS agents (
        id VARCHAR(255) PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT DEFAULT '🤖',
        description TEXT DEFAULT '',
        backend_type VARCHAR(50) NOT NULL DEFAULT 'dify',
        api_key TEXT NOT NULL DEFAULT '',
        api_url TEXT NOT NULL DEFAULT '',
        model_id VARCHAR(255),
        extra_config JSONB DEFAULT '{}'::jsonb,
        execution_mode VARCHAR(50) DEFAULT 'chat',
        tools_config JSONB DEFAULT '{}'::jsonb,
        mcp_servers JSONB DEFAULT '[]'::jsonb,
        is_default BOOLEAN NOT NULL DEFAULT false,
        is_enabled BOOLEAN NOT NULL DEFAULT true,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS model_providers (
        id VARCHAR(255) PRIMARY KEY,
        name TEXT NOT NULL,
        provider_type VARCHAR(50) NOT NULL DEFAULT 'openai',
        api_key TEXT NOT NULL DEFAULT '',
        api_base_url TEXT NOT NULL DEFAULT '',
        is_enabled BOOLEAN NOT NULL DEFAULT true,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS models (
        id VARCHAR(255) PRIMARY KEY,
        provider_id VARCHAR(255) NOT NULL,
        model_name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT DEFAULT '',
        context_window INTEGER,
        max_output_tokens INTEGER,
        capabilities JSONB DEFAULT '[]'::jsonb,
        pricing_input NUMERIC,
        pricing_output NUMERIC,
        default_params JSONB DEFAULT '{}'::jsonb,
        is_enabled BOOLEAN NOT NULL DEFAULT true,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `)
    await client.query('CREATE INDEX IF NOT EXISTS idx_models_provider_id ON models(provider_id)')

    await client.query(`
      CREATE TABLE IF NOT EXISTS tools (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        description TEXT DEFAULT '',
        category VARCHAR(50) NOT NULL DEFAULT 'builtin',
        execution VARCHAR(50) NOT NULL DEFAULT 'server',
        input_schema JSONB DEFAULT '{}'::jsonb,
        output_schema JSONB DEFAULT '{}'::jsonb,
        handler_type VARCHAR(50) DEFAULT 'function',
        handler_config JSONB DEFAULT '{}'::jsonb,
        is_builtin BOOLEAN NOT NULL DEFAULT false,
        is_enabled BOOLEAN NOT NULL DEFAULT true,
        permissions JSONB DEFAULT '["all"]'::jsonb,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS mcp_servers (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        description TEXT DEFAULT '',
        transport VARCHAR(50) NOT NULL DEFAULT 'stdio',
        config JSONB NOT NULL DEFAULT '{}'::jsonb,
        is_enabled BOOLEAN NOT NULL DEFAULT true,
        last_connected_at BIGINT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS tool_permissions (
        id VARCHAR(255) PRIMARY KEY,
        tool_id VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        is_allowed BOOLEAN NOT NULL DEFAULT true,
        created_at BIGINT NOT NULL,
        UNIQUE(tool_id, role)
      )
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_tools (
        id VARCHAR(255) PRIMARY KEY,
        agent_id VARCHAR(255) NOT NULL,
        tool_id VARCHAR(255) NOT NULL,
        config JSONB DEFAULT '{}'::jsonb,
        created_at BIGINT NOT NULL,
        UNIQUE(agent_id, tool_id)
      )
    `)
  }
  finally {
    client.release()
  }
}

async function main() {
  console.log('=== SQLite to PostgreSQL Migration ===\n')

  // Check SQLite file exists
  if (!fs.existsSync(SQLITE_DB_PATH)) {
    console.error(`SQLite database not found: ${SQLITE_DB_PATH}`)
    process.exit(1)
  }

  // Initialize SQLite
  console.log(`Reading SQLite from: ${SQLITE_DB_PATH}`)
  const buffer = fs.readFileSync(SQLITE_DB_PATH)
  const SQL = await initSqlJs()
  const sqliteDb = new SQL.Database(buffer)

  // Connect to PostgreSQL
  console.log(`Connecting to PostgreSQL: ${POSTGRES_URL.replace(/:[^:@]+@/, ':***@')}`)
  const pgPool = new Pool({ connectionString: POSTGRES_URL })

  // Test connection
  try {
    const client = await pgPool.connect()
    const result = await client.query('SELECT current_database()')
    console.log(`Connected to database: ${result.rows[0].current_database}`)
    client.release()
  }
  catch (err) {
    console.error('Failed to connect to PostgreSQL:', err.message)
    process.exit(1)
  }

  // First, ensure tables exist
  console.log('\nEnsuring PostgreSQL tables exist...')
  await ensureTables(pgPool)
  console.log('Tables ready.\n')

  // Migrate each table
  const results = {}
  for (const table of TABLES) {
    results[table] = await migrateTable(sqliteDb, pgPool, table)
  }

  // Summary
  console.log('\n=== Migration Summary ===')
  let totalRows = 0
  for (const table of TABLES) {
    const count = results[table]
    console.log(`  ${table}: ${count} rows`)
    totalRows += count
  }
  console.log(`\nTotal: ${totalRows} rows migrated`)

  // Cleanup
  await pgPool.end()
  console.log('\nMigration complete!')
}

async function migrateTable(sqliteDb, pgPool, tableName) {
  // Read all rows from SQLite
  let rows
  try {
    const result = sqliteDb.exec(`SELECT * FROM [${tableName}]`)
    if (!result || result.length === 0) {
      return 0
    }

    const columns = result[0].columns
    rows = result[0].values.map(values => {
      const row = {}
      columns.forEach((col, i) => {
        row[col] = values[i]
      })
      return row
    })
  }
  catch (err) {
    // Table might not exist in SQLite
    if (err.message.includes('no such table')) {
      console.log(`  ${tableName}: table not found in SQLite, skipping`)
      return 0
    }
    throw err
  }

  if (rows.length === 0) {
    return 0
  }

  console.log(`  Migrating ${tableName}: ${rows.length} rows...`)

  const boolCols = BOOLEAN_COLUMNS[tableName] || []
  const jsonCols = JSON_COLUMNS[tableName] || []

  const client = await pgPool.connect()
  try {
    // Get column names from first row
    const columns = Object.keys(rows[0])
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ')
    const columnList = columns.map(c => `"${c}"`).join(', ')

    const sql = `INSERT INTO ${tableName} (${columnList}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`

    for (const row of rows) {
      const values = columns.map(col => {
        let val = row[col]

        // Convert boolean columns
        if (boolCols.includes(col)) {
          val = val === 1 || val === true
        }

        // Convert JSON columns - store as JSONB
        if (jsonCols.includes(col)) {
          if (val === null || val === undefined) {
            return null
          }
          // If it's already a string, keep it (will be cast to JSONB by pg)
          if (typeof val === 'object') {
            return JSON.stringify(val)
          }
          return val
        }

        return val
      })

      await client.query(sql, values)
    }

    return rows.length
  }
  finally {
    client.release()
  }
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
