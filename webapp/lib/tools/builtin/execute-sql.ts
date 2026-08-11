import type { ToolDefinition, ToolContext, ToolResult } from '../types'
import { pgClientConfig } from '@/lib/services/datasource'
import { getDialect, type DatabaseDialect } from '@/lib/services/dialects'

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
 * Extract table names referenced in a SQL query (FROM / JOIN clauses).
 */
function extractTableNames(sql: string): string[] {
  const cleaned = sql
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
  const matches = [...cleaned.matchAll(/\b(?:FROM|JOIN)\s+[`"]?([A-Za-z0-9_]+)(?:\.[`"]?([A-Za-z0-9_]+))?/gi)]
  const tables: string[] = []
  for (const m of matches) {
    const name = (m[2] || m[1]).toLowerCase()
    if (!tables.includes(name)) {
      tables.push(name)
    }
  }
  return tables
}

/**
 * Normalize a SQL string for same-request duplicate detection.
 */
function normalizeSqlForCache(sql: string): string {
  return sql
    .replace(/;\s*$/, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*=\s*/g, '=')
    .replace(/\s*,\s*/g, ',')
    .trim()
    .toLowerCase()
}

/**
 * Run a zero-LLM-cost structural check before executing the SQL:
 *  - referenced tables must exist in the live schema
 *  - aliased column references must exist in their tables
 * Returns an error message to abort execution, or null to proceed.
 */
const SQL_KEYWORDS = new Set([
  'where',
  'join',
  'on',
  'group',
  'order',
  'limit',
  'and',
  'or',
  'having',
  'union',
  'select',
  'from',
  'as',
  'distinct',
  'inner',
  'left',
  'right',
  'full',
  'cross',
  'using',
  'offset',
  'between',
  'like',
  'in',
  'is',
  'not',
  'null',
  'exists',
  'case',
  'when',
  'then',
  'else',
  'end',
  'by',
  'asc',
  'desc',
])

function extractTableRefs(sql: string): Array<{ table: string, alias?: string }> {
  const cleaned = sql
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
  const refs: Array<{ table: string, alias?: string }> = []
  const re = /\b(?:FROM|JOIN)\s+[`"]?([A-Za-z0-9_]+)(?:\.([A-Za-z0-9_]+))?[`"]?(?:\s+AS\s+[`"]?([A-Za-z_][A-Za-z0-9_]*)[`"]?|\s+[`"]?([A-Za-z_][A-Za-z0-9_]*)[`"]?)?/gi
  for (const m of cleaned.matchAll(re)) {
    const table = (m[2] || m[1]).toLowerCase()
    const aliasCandidate = (m[3] || m[4])?.toLowerCase()
    const alias = aliasCandidate && !SQL_KEYWORDS.has(aliasCandidate) ? aliasCandidate : undefined
    refs.push({ table, alias })
  }
  return refs
}

function extractColumnRefs(sql: string): Array<{ alias: string, column: string }> {
  const refs: Array<{ alias: string, column: string }> = []
  for (const m of sql.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    refs.push({ alias: m[1].toLowerCase(), column: m[2].toLowerCase() })
  }
  return refs
}

function findMissingColumn(
  sql: string,
  schemas: Array<{ name: string, columns: Array<{ name: string }> }>,
): string | null {
  const columnMap = new Map<string, Set<string>>()
  for (const s of schemas) {
    columnMap.set(s.name.toLowerCase(), new Set(s.columns.map(c => c.name.toLowerCase())))
  }

  const aliasToTable = new Map<string, string>()
  for (const ref of extractTableRefs(sql)) {
    if (ref.alias) {
      aliasToTable.set(ref.alias, ref.table)
    }
  }

  for (const ref of extractColumnRefs(sql)) {
    const table = aliasToTable.get(ref.alias)
    if (!table) {
      continue
    }
    const columns = columnMap.get(table)
    if (!columns || !columns.has(ref.column)) {
      return `表 ${table} 中不存在列 ${ref.column}。请使用表结构中真实存在的列名后重试。`
    }
  }
  return null
}

/**
 * Run the optional structural check before executing the SQL.
 * Returns an error message to abort execution, or null to proceed.
 */
async function runSemanticCheck(
  sql: string,
  _queryContext: Record<string, any>,
  _activeDs: any,
  agentConfig: Record<string, any>,
): Promise<string | null> {
  try {
    const { fetchSelectedTableSchemas } = await import('@/lib/services/schema-select')

    const tables = extractTableNames(sql)
    if (tables.length === 0) {
      return null
    }

    const schemas = await fetchSelectedTableSchemas(agentConfig, tables)
    if (!schemas || schemas.length === 0) {
      return null
    }

    return findMissingColumn(sql, schemas)
  }
  catch (error) {
    console.warn('[execute_sql] Semantic check error, skip:', error)
    return null
  }
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
  dialect: DatabaseDialect,
): Promise<ToolResult> {
  try {
    // eslint-disable-next-line ts/no-require-imports
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
    await dialect.setupReadOnly(connection)

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
  dialect: DatabaseDialect,
  schemas?: string,
): Promise<ToolResult> {
  try {
    // eslint-disable-next-line ts/no-require-imports
    const { Client } = require('pg')
    const client = new Client(pgClientConfig({ host, port, database, username, password, schemas }))

    await client.connect()

    // Set read-only transaction for additional safety
    await dialect.setupReadOnly(client)

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

  // Optional semantic consistency check (read-only validation already passed above)
  const queryContext = context.queryContext || {}
  if (queryContext.enableSemanticCheck !== false) {
    const checkError = await runSemanticCheck(sql, queryContext, activeDs, agentConfig)
    if (checkError) {
      return { success: false, error: checkError }
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

  // Same-request duplicate query guard: return cached result instead of re-executing
  const cacheKey = normalizeSqlForCache(finalSql)
  const sqlCache = queryContext.__sqlCache as Map<string, ToolResult> | undefined
  const cached = sqlCache?.get(cacheKey)
  if (cached && cached.success) {
    console.warn('[execute_sql] Duplicate query, returning cached result')
    return {
      ...cached,
      data: {
        ...cached.data,
        _note: '（该查询已执行过且结果一致，请直接基于结果回答，不要重复执行相似查询）',
      },
    }
  }

  console.log(`[execute_sql] Executing on ${activeDs.type} (${activeDs.host}:${activeDs.port}/${activeDs.database}): ${finalSql.substring(0, 200)}`)

  // Execute based on database type
  const dialect = getDialect(activeDs.type)
  if (!dialect) {
    return {
      success: false,
      error: `不支持的数据库类型: ${activeDs.type}`,
    }
  }

  let result: ToolResult
  if (dialect.family === 'mysql') {
    result = await executeMysqlQuery(
      activeDs.host,
      activeDs.port,
      activeDs.database,
      activeDs.username,
      activeDs.password,
      finalSql,
      dialect,
    )
  }
  else {
    result = await executePostgresQuery(
      activeDs.host,
      activeDs.port,
      activeDs.database,
      activeDs.username,
      activeDs.password,
      finalSql,
      dialect,
      activeDs.schemas,
    )
  }

  // Cache successful results within this request, and guide the model to stop re-querying
  if (result.success && result.data) {
    if (!queryContext.__sqlCache) {
      queryContext.__sqlCache = new Map()
    }
    queryContext.__sqlCache.set(cacheKey, result)
    result.data = {
      ...result.data,
      _note: '（以上为查询结果；若已能回答用户问题，请直接作答结束，不要重复执行相似查询）',
    }
  }
  return result
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
