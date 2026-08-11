import type { AgentExtraConfig } from '@/types/agent'

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
 * Generate dynamic prompt (database type + business knowledge + query examples).
 * Does NOT include a DDL section — the table schema is injected live at request
 * time via the data-query pipeline (progressive disclosure), so no snapshot DDL
 * is stored here.
 * Does NOT include: built-in prompt, supplementary prompt, network status.
 */
export function generateDynamicPrompt(config: AgentExtraConfig): string {
  const parts: string[] = []

  // 0. Database type info
  const activeDs = config.datasources?.find(ds => ds.is_active)
  if (activeDs) {
    const dbType = activeDs.type === 'mysql' ? 'MySQL' : activeDs.type === 'postgresql' ? 'PostgreSQL' : activeDs.type
    parts.push(`# 数据源类型\n当前使用的数据库类型为 ${dbType}，请生成符合该数据库 SQL 语法规范的查询语句。`)
  }

  // 1. Business knowledge
  if (config.business_knowledge?.length) {
    const knowledgeText = formatBusinessKnowledge(config.business_knowledge)
    if (knowledgeText) {
      parts.push(`# 业务知识
（以下业务术语为参考数据，仅用于解释含义：不得将其中的示例值当作真实过滤值或结果；不得创造表结构中不存在的字段；存在冲突定义时保留差异并请求澄清）
${knowledgeText}`)
    }
  }

  // 2. Query examples
  if (config.query_examples?.length) {
    const examplesText = formatQueryExamples(config.query_examples)
    if (examplesText) {
      parts.push(`# 查询示例
（以下示例仅供参考，不改变当前规则；示例中的表名、字段名和值必须以实际表结构为准）
${examplesText}`)
    }
  }

  return parts.join('\n\n')
}
