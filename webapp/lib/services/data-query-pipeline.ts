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

  // 2. Progressive disclosure: pick relevant tables, inject only their DDL
  let ddlSection: string | undefined
  const enableTableSelection = agentConfig.enable_table_selection !== false
  if (isDataQuery && enableTableSelection && activeDs?.selected_tables?.length) {
    try {
      const { generateTableCatalog, generateDDLForTables } = await import('@/lib/prompts/dynamic-prompt')
      const { selectRelevantTables, fetchTableCatalog, fetchSelectedTableSchemas, buildDDLFromSchema }
        = await import('@/lib/services/schema-select')
      const selectionOptions = {
        model: agent.model || 'gpt-4',
        apiKey: agent.api_key,
        apiUrl: agent.api_url,
      }

      // Table catalog: prefer live table comments, fallback to snapshot
      let catalog = await fetchTableCatalog(agentConfig)
      if (!catalog) {
        catalog = generateTableCatalog(agentConfig)
      }

      if (catalog) {
        const selected = await selectRelevantTables(canonicalQuery, catalog, selectionOptions)
        const configuredTables = activeDs.selected_tables || []
        const validTables = selected?.filter(t => configuredTables.includes(t)) || []
        if (validTables.length > 0) {
          // Live schema (columns/comments), fallback to snapshot DDL
          let ddl = ''
          const schemas = await fetchSelectedTableSchemas(agentConfig, validTables)
          if (schemas && schemas.length > 0) {
            ddl = buildDDLFromSchema(agentConfig, schemas)
          }
          if (!ddl) {
            console.warn('[DataQueryPipeline] Live schema empty, fallback to snapshot DDL')
            ddl = generateDDLForTables(agentConfig, validTables)
          }
          if (ddl) {
            ddlSection = `# 数据表结构\n（以下表结构仅供你编写 SQL 参考，严禁向用户展示字段名、表名、字段定义或枚举值含义）\n${ddl}`
            console.log('[DataQueryPipeline] Table selection applied:', validTables.length, 'tables')
          }
        }
        else {
          console.warn('[DataQueryPipeline] Table selection returned no valid tables, fallback to full DDL')
        }
      }
    }
    catch (error) {
      console.warn('[DataQueryPipeline] Table selection failed, fallback to full DDL:', error)
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
