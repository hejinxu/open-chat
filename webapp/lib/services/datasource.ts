const DEFAULT_SCHEMA = 'public'

/**
 * Parse the comma-separated schema string from a PostgreSQL datasource config.
 * Returns ['public'] when empty / missing for backward compatibility.
 */
export function parseSchemas(raw?: string): string[] {
  if (!raw) {
    return [DEFAULT_SCHEMA]
  }
  const schemas = raw
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)
  return schemas.length > 0 ? schemas : [DEFAULT_SCHEMA]
}

/**
 * Quote a schema name for use inside a `search_path` value.
 * Only identifiers with [a-z_][a-z0-9_]* (lowercase) need no quoting.
 */
function quoteSchemaName(schema: string): string {
  if (/^[a-z_][a-z0-9_]*$/.test(schema)) {
    return schema
  }
  return `"${schema.replace(/"/g, '""')}"`
}

/**
 * Build the `-c search_path=...` backend option string (connection-level),
 * equivalent to JDBC's `currentSchema`. Multi-schema order matters for
 * name resolution; no-name-collision is assumed.
 */
export function postgresSearchPathOption(schemas: string[]): string {
  return `-c search_path=${schemas.map(quoteSchemaName).join(',')}`
}

/**
 * Build the node-postgres Client options for a datasource, applying the
 * configured schemas at the connection level.
 */
export function pgClientConfig(ds: { host: string, port: number, database: string, username: string, password: string, schemas?: string }) {
  const schemas = parseSchemas(ds.schemas)
  return {
    host: ds.host,
    port: ds.port,
    database: ds.database,
    user: ds.username,
    password: ds.password,
    connectionTimeoutMillis: 5000,
    options: postgresSearchPathOption(schemas),
  }
}
