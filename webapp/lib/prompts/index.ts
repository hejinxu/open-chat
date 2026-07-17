import type { AgentConfig } from '@/types/agent'
import type { AgentTypeRecord } from '@/types/agent-type'
import type { SystemPromptRecord } from '@/types/system-prompt'

/**
 * Get network status prompt
 */
function getNetworkStatusPrompt(enableNetwork?: boolean): string {
  if (enableNetwork === true) {
    return '你可以使用联网搜索和网页抓取工具获取互联网上的最新信息。'
  }
  if (enableNetwork === false) {
    return '注意：当前环境不支持联网搜索，你无法访问互联网获取实时信息。请基于已有知识和数据库数据回答问题，不要尝试使用搜索或网页抓取工具。HTTP 请求工具可用于调用业务系统接口。'
  }
  return ''
}

/**
 * Build the complete system prompt for an agent
 * Uses stored dynamic_prompt instead of regenerating on every request
 */
export async function buildSystemPrompt(
  agent: AgentConfig,
  agentType?: AgentTypeRecord | null,
  builtInPrompt?: SystemPromptRecord | null,
): Promise<string> {
  const parts: string[] = []

  // 1. Built-in prompt (from agent type)
  if (builtInPrompt?.content) {
    parts.push(builtInPrompt.content)
  }

  // 2. Supplementary prompt (user-defined)
  const agentConfig = agent.agent_config || {}
  if (agentConfig.system_prompt) {
    parts.push(agentConfig.system_prompt)
  }

  // 3. Dynamic prompt (pre-generated, stored in agent_config)
  if (agentConfig.dynamic_prompt) {
    parts.push(agentConfig.dynamic_prompt)
  }

  // 4. Network status (dynamic, simple flag)
  const networkPrompt = getNetworkStatusPrompt(agentConfig.enable_network)
  if (networkPrompt) {
    parts.push(networkPrompt)
  }

  return parts.join('\n\n')
}
