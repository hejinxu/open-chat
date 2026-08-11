import type { AgentExtraConfig, DatasourceConfig } from '@/types/agent'
import { parseSchemas } from '@/lib/services/datasource'
import { isPostgresFamily } from '@/lib/services/dialects'

export interface TableSelectionOptions {
  model: string
  apiKey?: string
  apiUrl?: string
}

export interface ColumnSchema {
  name: string
  type: string
  comment: string
  isPrimaryKey: boolean
  foreignKey?: { table: string, column: string }
}

export interface TableSchema {
  name: string
  comment: string
  columns: ColumnSchema[]
}

interface CatalogRow {
  name: string
  comment: string
  col_count: number
}

/**
 * Lightweight in-memory TTL cache for live schema metadata.
 * Avoids re-querying information_schema on every request / tool call.
 * Note: single-instance only; short TTL keeps staleness low.
 */
const SCHEMA_CACHE_TTL_MS = 60_000
const MAX_CACHE_ENTRIES = 200

interface CacheEntry {
  value: unknown
  expiresAt: number
}

const schemaCache = new Map<string, CacheEntry>()

function cacheGet<T>(key: string): T | null {
  const entry = schemaCache.get(key)
  if (!entry) {
    return null
  }
  if (Date.now() > entry.expiresAt) {
    schemaCache.delete(key)
    return null
  }
  return entry.value as T
}

function cacheSet(key: string, value: unknown, ttlMs: number = SCHEMA_CACHE_TTL_MS): void {
  if (schemaCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = schemaCache.keys().next().value
    if (oldestKey) {
      schemaCache.delete(oldestKey)
    }
  }
  schemaCache.set(key, { value, expiresAt: Date.now() + ttlMs })
}

function cacheKeyFor(activeDs: DatasourceConfig, tables: string[]): string {
  const ds = `${activeDs.type}:${activeDs.host}:${activeDs.port}:${activeDs.database}:${activeDs.schemas || 'public'}`
  return tables.length > 0 ? `${ds}:${[...tables].sort().join(',')}` : ds
}

const TABLE_SELECTION_SYSTEM_PROMPT = `# 角色

你是数据库表选择器。根据用户问题，从下面的数据表清单中选择回答问题所必需的表。

# 选择规则

1. 只选择与问题直接相关的表（提供指标、维度或过滤字段的表）。
2. 当问题需要跨表关联时，选择连接两端所必需的桥接表和关系表。
3. 排除仅名称相似但字段和关系不能支持问题的表。
4. 尽量少选，只选必要的表；若无法判断，宁可少选也不要臆造。
5. 若清单中没有能支持问题的表，输出空数组 []。

# 输出格式

只输出 JSON 字符串数组，例如 ["orders","order_items"]。不要输出 Markdown、解释或其他内容。`

/**
 * Extract a JSON string array from model output, tolerating markdown fences.
 */
function extractJsonArray(text: string): string[] | null {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : trimmed
  try {
    const parsed = JSON.parse(candidate)
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0)
    }
    return null
  }
  catch {
    return null
  }
}

/**
 * Ask the LLM to pick relevant tables from a compact catalog.
 * Returns a list of table names (not yet validated against config), or null on failure.
 * Callers should intersect the result with the configured selected_tables.
 */
export async function selectRelevantTables(
  query: string,
  catalog: string,
  options: TableSelectionOptions,
): Promise<string[] | null> {
  try {
    const { model, apiKey, apiUrl } = options
    if (!model || !apiKey || !apiUrl) {
      console.warn('[SchemaSelect] Missing model/apiKey/apiUrl, skip table selection')
      return null
    }

    const baseUrl = apiUrl.replace(/\/+$/, '')
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: TABLE_SELECTION_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `# 数据表清单\n${catalog}\n\n# 用户问题\n${query}\n\n请选择回答问题所需的表。`,
          },
        ],
        stream: false,
        temperature: 0,
        max_tokens: 800,
      }),
    })

    if (!res.ok) {
      const errorText = await res.text()
      console.error('[SchemaSelect] LLM API error:', res.status, errorText)
      return null
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) {
      return null
    }

    const tables = extractJsonArray(content)
    return tables && tables.length > 0 ? tables : null
  }
  catch (error) {
    console.error('[SchemaSelect] Error:', error)
    return null
  }
}

/**
 * Fetch table names + comments + column counts directly from the live database,
 * so the selection catalog never depends on a stale config snapshot.
 * Returns null on failure (caller falls back to the snapshot catalog).
 */
export async function fetchTableCatalog(config: AgentExtraConfig): Promise<string | null> {
  const activeDs = config.datasources?.find(ds => ds.is_active)
  if (!activeDs || !activeDs.selected_tables?.length) {
    return null
  }
  const cacheKey = `catalog:${cacheKeyFor(activeDs, [])}`
  const cached = cacheGet<string>(cacheKey)
  if (cached !== null) {
    return cached
  }
  try {
    const rows = activeDs.type === 'mysql'
      ? await queryMysqlCatalog(activeDs, activeDs.selected_tables)
      : isPostgresFamily(activeDs.type)
        ? await queryPostgresCatalog(activeDs, activeDs.selected_tables)
        : null
    if (!rows || rows.length === 0) {
      return null
    }
    const catalog = rows
      .map(r => `- ${r.name}${r.comment ? `, ${r.comment}` : ''} (列数: ${r.col_count ?? 0})`)
      .join('\n')
    cacheSet(cacheKey, catalog)
    return catalog
  }
  catch (error) {
    console.warn('[SchemaSelect] fetchTableCatalog failed, fallback to snapshot catalog:', error)
    return null
  }
}

/**
 * Fetch live column/type/comment/primary-key/foreign-key metadata for the given
 * tables directly from the database. Returns null on failure.
 */
export async function fetchSelectedTableSchemas(
  config: AgentExtraConfig,
  tables: string[],
): Promise<TableSchema[] | null> {
  const activeDs = config.datasources?.find(ds => ds.is_active)
  if (!activeDs || tables.length === 0) {
    return null
  }
  const cacheKey = `schema:${cacheKeyFor(activeDs, tables)}`
  const cached = cacheGet<TableSchema[]>(cacheKey)
  if (cached !== null) {
    return cached
  }
  try {
    const schemas = activeDs.type === 'mysql'
      ? await fetchMysqlTableSchemas(activeDs, tables)
      : isPostgresFamily(activeDs.type)
        ? await fetchPostgresTableSchemas(activeDs, tables)
        : null
    if (schemas) {
      cacheSet(cacheKey, schemas)
    }
    return schemas
  }
  catch (error) {
    console.warn('[SchemaSelect] fetchSelectedTableSchemas failed, fallback to snapshot DDL:', error)
    return null
  }
}

/**
 * Build DDL from live schema. Comment priority:
 *   1. user-custom comment in schema_overrides (always wins)
 *   2. live database comment
 *   3. stale snapshot original_comment
 * Column type / primary key / foreign key prefer live values.
 */
export function buildDDLFromSchema(config: AgentExtraConfig, schemas: TableSchema[]): string {
  const activeDs = config.datasources?.find(ds => ds.is_active)
  const overrides = activeDs?.schema_overrides || {}
  const blocks: string[] = []

  for (const table of schemas) {
    const tableOverride = overrides[table.name]
    const tableComment = tableOverride?.comment || table.comment || tableOverride?.original_comment || ''

    let ddl = `CREATE TABLE ${table.name}`
    if (tableComment) {
      ddl += ` -- ${tableComment}`
    }
    ddl += '\n'

    const columnDefs: string[] = []
    const foreignKeys: string[] = []

    for (const col of table.columns) {
      const colOverride = tableOverride?.columns?.[col.name]
      const colComment = colOverride?.comment || col.comment || colOverride?.original_comment || ''
      const colType = col.type || colOverride?.type || 'TEXT'
      const isPrimaryKey = col.isPrimaryKey || colOverride?.is_primary_key || false
      const foreignKey = col.foreignKey || colOverride?.foreign_key || undefined

      let colDef = `  ${col.name} ${colType}`
      if (isPrimaryKey) {
        colDef += ' PRIMARY KEY'
      }
      if (colComment) {
        colDef += ` -- ${colComment}`
      }
      columnDefs.push(colDef)

      if (foreignKey) {
        foreignKeys.push(`  FOREIGN KEY (${col.name}) REFERENCES ${foreignKey.table}(${foreignKey.column})`)
      }
    }

    if (foreignKeys.length > 0) {
      columnDefs.push(...foreignKeys)
    }
    ddl += `${columnDefs.join(',\n')}\n`
    ddl += ');'
    blocks.push(ddl)
  }

  return blocks.join('\n\n')
}

async function queryMysqlCatalog(ds: DatasourceConfig, tables: string[]): Promise<CatalogRow[]> {
  // eslint-disable-next-line ts/no-require-imports
  const mysql = require('mysql2/promise')
  const connection = await mysql.createConnection({
    host: ds.host,
    port: ds.port,
    database: ds.database,
    user: ds.username,
    password: ds.password,
    connectTimeout: 5000,
  })
  try {
    const [rows] = await connection.query(`
      SELECT t.TABLE_NAME AS name, t.TABLE_COMMENT AS comment,
             COUNT(c.COLUMN_NAME) AS col_count
      FROM information_schema.TABLES t
      LEFT JOIN information_schema.COLUMNS c
        ON c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME
      WHERE t.TABLE_SCHEMA = ? AND t.TABLE_NAME IN (?)
      GROUP BY t.TABLE_NAME, t.TABLE_COMMENT
      ORDER BY t.TABLE_NAME
    `, [ds.database, tables])
    return rows as CatalogRow[]
  }
  finally {
    await connection.end()
  }
}

async function queryPostgresCatalog(ds: DatasourceConfig, tables: string[]): Promise<CatalogRow[]> {
  // eslint-disable-next-line ts/no-require-imports
  const { Client } = require('pg')
  const schemas = parseSchemas(ds.schemas)
  const client = new Client({
    host: ds.host,
    port: ds.port,
    database: ds.database,
    user: ds.username,
    password: ds.password,
    connectionTimeoutMillis: 5000,
  })
  await client.connect()
  try {
    const res = await client.query(`
      SELECT c.relname AS name,
             COALESCE(obj_description(c.oid), '') AS comment,
             (SELECT COUNT(*) FROM information_schema.columns col
              WHERE col.table_schema = ANY($1) AND col.table_name = c.relname) AS col_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = ANY($1) AND c.relkind = 'r' AND c.relname = ANY($2)
      ORDER BY c.relname
    `, [schemas, tables])
    return res.rows
  }
  finally {
    await client.end()
  }
}

async function fetchMysqlTableSchemas(ds: DatasourceConfig, tables: string[]): Promise<TableSchema[]> {
  // eslint-disable-next-line ts/no-require-imports
  const mysql = require('mysql2/promise')
  const connection = await mysql.createConnection({
    host: ds.host,
    port: ds.port,
    database: ds.database,
    user: ds.username,
    password: ds.password,
    connectTimeout: 5000,
  })
  try {
    const [columns] = await connection.query(`
      SELECT TABLE_NAME AS table_name, COLUMN_NAME AS name, COLUMN_TYPE AS type,
             COLUMN_COMMENT AS comment, COLUMN_KEY AS column_key
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (?)
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `, [ds.database, tables])

    const [foreignKeys] = await connection.query(`
      SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name,
             REFERENCED_TABLE_NAME AS ref_table, REFERENCED_COLUMN_NAME AS ref_column
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (?) AND REFERENCED_TABLE_NAME IS NOT NULL
    `, [ds.database, tables])

    const [tableInfo] = await connection.query(`
      SELECT TABLE_NAME AS table_name, TABLE_COMMENT AS comment
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (?)
    `, [ds.database, tables])

    return buildTableSchemas(
      columns as Array<Record<string, any>>,
      foreignKeys as Array<Record<string, any>>,
      tableInfo as Array<Record<string, any>>,
    )
  }
  finally {
    await connection.end()
  }
}

async function fetchPostgresTableSchemas(ds: DatasourceConfig, tables: string[]): Promise<TableSchema[]> {
  // eslint-disable-next-line ts/no-require-imports
  const { Client } = require('pg')
  const schemas = parseSchemas(ds.schemas)
  const client = new Client({
    host: ds.host,
    port: ds.port,
    database: ds.database,
    user: ds.username,
    password: ds.password,
    connectionTimeoutMillis: 5000,
  })
  await client.connect()
  try {
    const columnsResult = await client.query(`
      SELECT c.table_name,
             c.column_name AS name,
             c.data_type AS type,
             COALESCE(col_description((c.table_schema || '.' || c.table_name)::regclass, c.ordinal_position), '') AS comment,
             CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_primary_key
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT ku.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name
        WHERE tc.table_schema = ANY($1) AND tc.table_name = ANY($2) AND tc.constraint_type = 'PRIMARY KEY'
      ) pk ON c.column_name = pk.column_name
      WHERE c.table_schema = ANY($1) AND c.table_name = ANY($2)
      ORDER BY c.table_name, c.ordinal_position
    `, [schemas, tables])

    const fkResult = await client.query(`
      SELECT ku.table_name,
             ku.column_name,
             ccu.table_name AS ref_table,
             ccu.column_name AS ref_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
      WHERE tc.table_schema = ANY($1) AND tc.table_name = ANY($2) AND tc.constraint_type = 'FOREIGN KEY'
    `, [schemas, tables])

    const tableInfoResult = await client.query(`
      SELECT c.relname AS table_name,
             COALESCE(obj_description(c.oid), '') AS comment
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = ANY($1) AND c.relkind = 'r' AND c.relname = ANY($2)
    `, [schemas, tables])

    return buildTableSchemas(columnsResult.rows, fkResult.rows, tableInfoResult.rows)
  }
  finally {
    await client.end()
  }
}

function buildTableSchemas(
  columns: Array<Record<string, any>>,
  foreignKeys: Array<Record<string, any>>,
  tableInfo: Array<Record<string, any>>,
): TableSchema[] {
  const fkMap = new Map<string, { table: string, column: string }>()
  for (const fk of foreignKeys) {
    fkMap.set(`${fk.table_name}.${fk.column_name}`, { table: fk.ref_table, column: fk.ref_column })
  }

  const commentMap = new Map<string, string>()
  for (const t of tableInfo) {
    commentMap.set(t.table_name, t.comment || '')
  }

  const tableMap = new Map<string, TableSchema>()
  for (const col of columns) {
    let table = tableMap.get(col.table_name)
    if (!table) {
      table = {
        name: col.table_name,
        comment: commentMap.get(col.table_name) || '',
        columns: [],
      }
      tableMap.set(col.table_name, table)
    }
    table.columns.push({
      name: col.name,
      type: col.type || col.data_type || 'TEXT',
      comment: col.comment || '',
      isPrimaryKey: !!col.is_primary_key || col.column_key === 'PRI',
      foreignKey: fkMap.get(`${col.table_name}.${col.name}`),
    })
  }

  return [...tableMap.values()]
}
