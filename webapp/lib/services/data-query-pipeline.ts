import type { AgentConfig } from '@/types/agent'
import type { AgentTypeRecord } from '@/types/agent-type'
import type { SystemPromptRecord } from '@/types/system-prompt'

export interface DataQueryPipelineOptions {
  agent: AgentConfig
  agentType?: AgentTypeRecord | null
  builtInPrompt?: SystemPromptRecord | null
  query: string
  messages?: Array<{ role: string, content: string }>
  inputs?: Record<string, any>
}

export interface DataQueryPipelineResult {
  systemPrompt: string
  canonicalQuery: string
  toolContext: Record<string, any>
}

/**
 * Orchestrates the data-query request pipeline:
 *   1. Query normalization (multi-turn coreference + relative-time resolution)
 *   2. Progressive disclosure (pick relevant tables, inject only their DDL)
 *   3. Build the final system prompt
 *   4. Prepare the tool runtime context (canonicalQuery / dialect / semantic check)
 * Every stage degrades gracefully to the previous behaviour on failure.
 */
export async function runDataQueryPipeline(
  options: DataQueryPipelineOptions,
): Promise<DataQueryPipelineResult> {
  const { agent, agentType, builtInPrompt, query, messages = [] } = options
  const agentConfig = agent.agent_config || {}
  const isDataQuery = agent.agent_type === 'data_query'
  const activeDs = agentConfig.datasources?.find(ds => ds.is_active)

  // 1. Query normalization
  let canonicalQuery = query
  const enableNormalization = agentConfig.enable_query_normalization !== false
  if (isDataQuery && enableNormalization && activeDs) {
    try {
      const { shouldNormalize, normalizeQuery } = await import('@/lib/services/query-normalize')
      if (shouldNormalize(query, messages.length)) {
        const normalized = await normalizeQuery(query, messages, {
          model: agent.model || 'gpt-4',
          apiKey: agent.api_key,
          apiUrl: agent.api_url,
        })
        if (normalized?.canonicalQuery) {
          canonicalQuery = normalized.canonicalQuery
          console.log('[DataQueryPipeline] Query normalized:', canonicalQuery)
        }
      }
    }
    catch (error) {
      console.warn('[DataQueryPipeline] Query normalization failed, use original query:', error)
    }
  }

  // 2. Progressive disclosure: always select relevant tables, inject their live DDL
  let ddlSection: string | undefined
  if (isDataQuery && activeDs) {
    const configuredTables = activeDs.selected_tables || []
    try {
      if (configuredTables.length === 0) {
        // No tables configured at all — tell the model schema is unavailable
        ddlSection = '# 数据表结构\n（当前智能体未配置数据表，无法提供表结构）'
      }
      else {
        const { selectRelevantTables, fetchTableCatalog, fetchSelectedTableSchemas, buildDDLFromSchema }
          = await import('@/lib/services/schema-select')
        const selectionOptions = {
          model: agent.model || 'gpt-4',
          apiKey: agent.api_key,
          apiUrl: agent.api_url,
        }

        // Table catalog: live only
        let validTables: string[] = []
        const catalog = await fetchTableCatalog(agentConfig)
        if (catalog) {
          const selected = await selectRelevantTables(canonicalQuery, catalog, selectionOptions)
          validTables = selected?.filter(t => configuredTables.includes(t)) || []
        }

        // Live schema for the selected subset; on empty selection fall back to all configured tables
        const targetTables = validTables.length > 0 ? validTables : configuredTables
        const schemas = await fetchSelectedTableSchemas(agentConfig, targetTables)
        let ddl = ''
        if (schemas && schemas.length > 0) {
          ddl = buildDDLFromSchema(agentConfig, schemas)
        }
        if (ddl) {
          ddlSection = `# 数据表结构\n（以下表结构仅供你编写 SQL 参考，严禁向用户展示字段名、表名、字段定义或枚举值含义）\n${ddl}`
          console.log('[DataQueryPipeline] Table selection applied:', targetTables.length, 'tables')
        }
      }
    }
    catch (error) {
      console.warn('[DataQueryPipeline] Schema loading failed, retry with all configured tables:', error)
      // Exception → still try live schema for all configured tables
      try {
        if (configuredTables.length > 0) {
          const { fetchSelectedTableSchemas, buildDDLFromSchema } = await import('@/lib/services/schema-select')
          const schemas = await fetchSelectedTableSchemas(agentConfig, configuredTables)
          if (schemas && schemas.length > 0) {
            const ddl = buildDDLFromSchema(agentConfig, schemas)
            if (ddl) {
              ddlSection = `# 数据表结构\n（以下表结构仅供你编写 SQL 参考，严禁向用户展示字段名、表名、字段定义或枚举值含义）\n${ddl}`
            }
          }
        }
      }
      catch (err) {
        console.warn('[DataQueryPipeline] Live schema fallback failed:', err)
      }
    }
  }

  // 3. Build system prompt
  const { buildSystemPrompt } = await import('@/lib/prompts')
  const systemPrompt = await buildSystemPrompt(
    agent,
    agentType,
    builtInPrompt,
    ddlSection ? { ddlSection } : undefined,
  )

  // 4. Tool runtime context (consumed by execute_sql etc.)
  const toolContext: Record<string, any> = {
    canonicalQuery,
    userQuery: query,
    dialect: activeDs?.type || '',
    enableSemanticCheck: agentConfig.enable_semantic_check !== false,
    llm: {
      model: agent.model || 'gpt-4',
      apiKey: agent.api_key,
      apiUrl: agent.api_url,
    },
  }

  return { systemPrompt, canonicalQuery, toolContext }
}
