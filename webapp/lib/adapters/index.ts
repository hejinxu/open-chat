import type { ChatAdapter } from './types'
import type { AgentConfig } from '@/types/agent'
import { DifyAdapter } from './dify'
import { LLMAdapter } from './llm'

export function createAdapter(agent: AgentConfig): ChatAdapter {
  switch (agent.backend_type) {
    case 'dify':
      return new DifyAdapter(agent.api_key, agent.api_url)
    case 'direct_llm':
      return new LLMAdapter(agent.api_key, agent.api_url, agent.model)
    default:
      return new DifyAdapter(agent.api_key, agent.api_url)
  }
}

export type { ChatAdapter } from './types'
