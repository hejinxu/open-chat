import type { AgentExtraConfig } from '@/types/agent'

/**
 * Generate DDL from datasource config
 * Includes: table comments, field types, field comments, primary keys, foreign keys
 */
function generateDDL(config: AgentExtraConfig): string {
  const activeDs = config.datasources?.find(ds => ds.is_active)
  if (!activeDs || !activeDs.selected_tables?.length) {
    return ''
  }

  const { selected_tables, selected_columns, schema_overrides } = activeDs
  let ddl = ''

  for (const table of selected_tables) {
    const columns = selected_columns?.[table] || []
    if (columns.length === 0) { continue }

    const tableOverride = schema_overrides?.[table]
    // Use custom comment if available, otherwise use original comment
    const tableComment = tableOverride?.comment || tableOverride?.original_comment || ''

    ddl += `CREATE TABLE ${table}`
    if (tableComment) { ddl += ` -- ${tableComment}` }
    ddl += '\n'

    const columnDefs: string[] = []
    const tableForeignKeys: string[] = []

    for (const col of columns) {
      const colMeta = tableOverride?.columns?.[col]
      const colType = colMeta?.type || 'TEXT'
      // Use custom comment if available, otherwise use original comment
      const colComment = colMeta?.comment || colMeta?.original_comment || ''
      const isPrimaryKey = colMeta?.is_primary_key || false
      const foreignKey = colMeta?.foreign_key

      let colDef = `  ${col} ${colType}`
      if (isPrimaryKey) { colDef += ' PRIMARY KEY' }
      if (colComment) { colDef += ` -- ${colComment}` }

      columnDefs.push(colDef)

      // Collect foreign keys for this table
      if (foreignKey) {
        tableForeignKeys.push(`  FOREIGN KEY (${col}) REFERENCES ${foreignKey.table}(${foreignKey.column})`)
      }
    }

    // Add foreign keys at the end of the table definition
    if (tableForeignKeys.length > 0) {
      columnDefs.push(...tableForeignKeys)
    }

    ddl += `${columnDefs.join(',\n')}\n`
    ddl += ');\n\n'
  }

  return ddl
}

/**
 * Format business knowledge for prompt
 */
function formatBusinessKnowledge(knowledge: AgentExtraConfig['business_knowledge']): string {
  if (!knowledge?.length) { return '' }

  return knowledge
    .map((k) => {
      let line = `- ${k.term}: ${k.definition}`
      if (k.field_mapping) { line += ` (字段: ${k.field_mapping})` }
      if (k.sql_expression) { line += ` (SQL: ${k.sql_expression})` }
      return line
    })
    .join('\n')
}

/**
 * Format query examples for prompt
 */
function formatQueryExamples(examples: AgentExtraConfig['query_examples']): string {
  if (!examples?.length) { return '' }

  return examples
    .map((e) => {
      let text = `问: ${e.question}\nSQL: ${e.sql}`
      if (e.explanation) { text += `\n说明: ${e.explanation}` }
      return text
    })
    .join('\n\n')
}

/**
 * Generate dynamic prompt (DDL + business knowledge + query examples)
 * Does NOT include: built-in prompt, supplementary prompt, network status
 */
export function generateDynamicPrompt(config: AgentExtraConfig): string {
  const parts: string[] = []

  // 0. Database type info
  const activeDs = config.datasources?.find(ds => ds.is_active)
  if (activeDs) {
    const dbType = activeDs.type === 'mysql' ? 'MySQL' : activeDs.type === 'postgresql' ? 'PostgreSQL' : activeDs.type
    parts.push(`# 数据源类型\n当前使用的数据库类型为 ${dbType}，请生成符合该数据库 SQL 语法规范的查询语句。`)
  }

  // 1. DDL
  const ddl = generateDDL(config)
  if (ddl) {
    parts.push(`# 数据表结构\n${ddl}`)
  }

  // 2. Business knowledge
  if (config.business_knowledge?.length) {
    const knowledgeText = formatBusinessKnowledge(config.business_knowledge)
    if (knowledgeText) {
      parts.push(`# 业务知识\n${knowledgeText}`)
    }
  }

  // 3. Query examples
  if (config.query_examples?.length) {
    const examplesText = formatQueryExamples(config.query_examples)
    if (examplesText) {
      parts.push(`# 查询示例\n${examplesText}`)
    }
  }

  return parts.join('\n\n')
}
