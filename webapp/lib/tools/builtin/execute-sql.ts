import type { ToolDefinition, ToolContext, ToolResult } from '../types'

/**
 * Validate that SQL is a SELECT query only (no modifications allowed)
 */
function validateReadOnlySql(sql: string): { valid: boolean, error?: string } {
  // Remove comments and normalize whitespace
  const normalized = sql
    .replace(/--[^\n]*/g, '') // Remove line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
    .trim()
    .toUpperCase()

  // Remove string literals before checking keywords (avoid false positives)
  const withoutStrings = normalized
    .replace(/'[^']*'/g, '') // Remove single-quoted strings
    .replace(/"[^"]*"/g, '') // Remove double-quoted strings

  // Check for multi-statement (disallow semicolons separating multiple SQL)
  const withoutTrailingSemicolon = withoutStrings.replace(/;\s*$/, '')
  if (withoutTrailingSemicolon.includes(';')) {
    return {
      valid: false,
      error: '安全限制：不允许执行多条 SQL 语句。如需执行多个查询，请分别调用。',
    }
  }

  // Check for dangerous keywords
  const dangerousKeywords = [
    'INSERT',
    'UPDATE',
    'DELETE',
    'DROP',
    'ALTER',
    'TRUNCATE',
    'CREATE',
    'GRANT',
    'REVOKE',
    'EXEC',
    'EXECUTE',
    'INTO',
    'REPLACE',
    'MERGE',
    'UPSERT',
  ]

  for (const keyword of dangerousKeywords) {
    // Check if keyword appears as a standalone word (not part of another word)
    const regex = new RegExp(`\\b${keyword}\\b`, 'i')
    if (regex.test(withoutStrings)) {
      return {
        valid: false,
        error: `安全限制：不允许执行 ${keyword} 语句。此工具仅支持 SELECT 查询。`,
      }
    }
  }

  // Must start with SELECT or WITH (for CTEs)
  if (!normalized.startsWith('SELECT') && !normalized.startsWith('WITH')) {
    return {
      valid: false,
      error: '安全限制：仅允许 SELECT 查询语句。',
    }
  }

  return { valid: true }
}

/**
 * Execute SQL query on MySQL database
 */
async function executeMysqlQuery(
  host: string,
  port: number,
  database: string,
  username: string,
  password: string,
  sql: string,
): Promise<ToolResult> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mysql = require('mysql2/promise')
    const connection = await mysql.createConnection({
      host,
      port,
      database,
      user: username,
      password,
      connectTimeout: 5000,
    })

    // Set read-only transaction for additional safety
    await connection.query('SET SESSION TRANSACTION READ ONLY')

    // Execute query with query-level timeout (180 seconds)
    const [rows, fields] = await connection.query({
      sql,
      queryTimeout: 180000,
    })
    await connection.end()

    // Format results
    const columns = fields ? fields.map((f: any) => f.name) : []
    const data = Array.isArray(rows) ? rows : []

    return {
      success: true,
      data: {
        columns,
        rows: data,
        row_count: data.length,
      },
    }
  }
  catch (error: any) {
    return {
      success: false,
      error: `MySQL 查询失败: ${error.message}`,
    }
  }
}

/**
 * Execute SQL query on PostgreSQL database
 */
async function executePostgresQuery(
  host: string,
  port: number,
  database: string,
  username: string,
  password: string,
  sql: string,
): Promise<ToolResult> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Client } = require('pg')
    const client = new Client({
      host,
      port,
      database,
      user: username,
      password,
      connectionTimeoutMillis: 5000,
    })

    await client.connect()

    // Set read-only transaction for additional safety
    await client.query('SET default_transaction_read_only = true')

    // Execute query with timeout (180 seconds)
    const result = await client.query({ text: sql, query_timeout: 180000 })
    await client.end()

    // Format results
    const columns = result.fields ? result.fields.map((f: any) => f.name) : []
    const data = result.rows || []

    return {
      success: true,
      data: {
        columns,
        rows: data,
        row_count: data.length,
      },
    }
  }
  catch (error: any) {
    return {
      success: false,
      error: `PostgreSQL 查询失败: ${error.message}`,
    }
  }
}

/**
 * Main handler for execute_sql tool
 */
async function executeSqlHandler(
  input: Record<string, any>,
  context: ToolContext,
): Promise<ToolResult> {
  const { sql, limit = 100 } = input

  if (!sql) {
    return { success: false, error: 'SQL 查询语句是必需的' }
  }

  // Validate SQL is read-only
  const validation = validateReadOnlySql(sql)
  if (!validation.valid) {
    return { success: false, error: validation.error }
  }

  // Get active data source from agent config
  const agentConfig = context.agentConfig || {}
  const datasources = agentConfig.datasources || []
  const activeDs = datasources.find((ds: any) => ds.is_active)

  if (!activeDs) {
    return {
      success: false,
      error: '未配置数据源。请在智能体配置中添加并激活一个数据源。',
    }
  }

  // Add LIMIT if not present
  let finalSql = sql.trim()
  const upperSql = finalSql.toUpperCase()
  if (!upperSql.includes('LIMIT') && limit > 0) {
    // Remove trailing semicolon if present
    if (finalSql.endsWith(';')) {
      finalSql = finalSql.slice(0, -1)
    }
    finalSql = `${finalSql} LIMIT ${limit}`
  }

  console.log(`[execute_sql] Executing on ${activeDs.type} (${activeDs.host}:${activeDs.port}/${activeDs.database}): ${finalSql.substring(0, 200)}`)

  // Execute based on database type
  if (activeDs.type === 'mysql') {
    return executeMysqlQuery(
      activeDs.host,
      activeDs.port,
      activeDs.database,
      activeDs.username,
      activeDs.password,
      finalSql,
    )
  }
  else if (activeDs.type === 'postgresql') {
    return executePostgresQuery(
      activeDs.host,
      activeDs.port,
      activeDs.database,
      activeDs.username,
      activeDs.password,
      finalSql,
    )
  }
  else {
    return {
      success: false,
      error: `不支持的数据库类型: ${activeDs.type}`,
    }
  }
}

export const executeSqlTool: ToolDefinition = {
  name: 'execute_sql',
  displayName: '执行 SQL 查询',
  description: '在配置的数据源上执行 SQL 查询。仅支持 SELECT 查询，不允许修改或删除数据。查询结果以表格形式返回。',
  category: 'builtin',
  execution: 'server',
  inputSchema: {
    type: 'object',
    properties: {
      sql: {
        type: 'string',
        description: '要执行的 SQL 查询语句（仅支持 SELECT）',
      },
      limit: {
        type: 'number',
        default: 100,
        description: '返回结果的最大行数（默认 100）',
      },
    },
    required: ['sql'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      columns: { type: 'array', items: { type: 'string' }, description: '列名列表' },
      rows: { type: 'array', description: '查询结果行' },
      row_count: { type: 'number', description: '返回的行数' },
    },
  },
  handler: executeSqlHandler,
  isBuiltin: true,
  isEnabled: true,
  permissions: ['all'],
}

export const executeSqlTools = [executeSqlTool]
