export type DataSourceFamily = 'mysql' | 'postgresql'

/**
 * Database dialect abstraction.
 * PG-family databases (PostgreSQL / Vastbase / KingbaseES ...) share the
 * default PostgresDialect implementation; each database type gets its own
 * dialect instance so vendor-specific behaviour can be overridden without
 * touching scattered if/else dispatch points.
 */
export interface DatabaseDialect {
  type: string
  displayName: string
  family: DataSourceFamily
  dialectPrompt: () => string
  setupReadOnly: (client: any) => Promise<void>
}

/**
 * PostgreSQL-family base dialect. Vastbase / KingbaseES etc. inherit this and
 * only override what differs from upstream PostgreSQL.
 */
export class PostgresDialect implements DatabaseDialect {
  type = 'postgresql'
  displayName = 'PostgreSQL'
  family: DataSourceFamily = 'postgresql'

  dialectPrompt(): string {
    return `当前使用的数据库类型为 ${this.displayName}（兼容 PostgreSQL），请生成符合该数据库 SQL 语法规范的查询语句。`
  }

  async setupReadOnly(client: any): Promise<void> {
    await client.query('SET default_transaction_read_only = true')
  }
}

/**
 * Vastbase G100 — based on the PostgreSQL kernel, fully protocol / information_schema /
 * search_path compatible. Also supports Oracle-style compatibility features (ROWNUM etc.),
 * so the prompt explicitly forces PG-style pagination to keep generated SQL aligned with
 * the LIMIT/OFFSET-based pipeline. Override methods here if Vastbase-specific behaviour
 * is ever needed.
 */
export class VastbaseDialect extends PostgresDialect {
  type = 'vastbase'
  displayName = 'Vastbase'

  dialectPrompt(): string {
    return `当前使用的数据库类型为 ${this.displayName}（兼容 PostgreSQL 语法）。
分页必须使用 PG 风格的 LIMIT / OFFSET 子句，严禁使用 Oracle 的 ROWNUM 伪列进行分页。
请生成符合该数据库 SQL 语法规范的查询语句。`
  }
}

/**
 * KingbaseES (人大金仓) — based on the PostgreSQL kernel, fully protocol /
 * information_schema / search_path compatible. Also supports Oracle-style
 * compatibility features (ROWNUM etc.), so the prompt explicitly forces PG-style
 * pagination to keep generated SQL aligned with the LIMIT/OFFSET-based pipeline.
 * Override methods here if KingbaseES-specific behaviour is ever needed
 * (e.g. comment functions).
 */
export class KingbaseDialect extends PostgresDialect {
  type = 'kingbase'
  displayName = 'KingbaseES'

  dialectPrompt(): string {
    return `当前使用的数据库类型为 ${this.displayName}（兼容 PostgreSQL 语法）。
分页必须使用 PG 风格的 LIMIT / OFFSET 子句，严禁使用 Oracle 的 ROWNUM 伪列进行分页。
请生成符合该数据库 SQL 语法规范的查询语句。`
  }
}

export class MysqlDialect implements DatabaseDialect {
  type = 'mysql'
  displayName = 'MySQL'
  family: DataSourceFamily = 'mysql'

  dialectPrompt(): string {
    return `当前使用的数据库类型为 ${this.displayName}，请生成符合该数据库 SQL 语法规范的查询语句。`
  }

  async setupReadOnly(client: any): Promise<void> {
    await client.query('SET SESSION TRANSACTION READ ONLY')
  }
}

const dialects: DatabaseDialect[] = [
  new MysqlDialect(),
  new PostgresDialect(),
  new VastbaseDialect(),
  new KingbaseDialect(),
]

export function getDialect(type: string): DatabaseDialect | null {
  return dialects.find(d => d.type === type) || null
}

export function isPostgresFamily(type: string): boolean {
  return getDialect(type)?.family === 'postgresql'
}
