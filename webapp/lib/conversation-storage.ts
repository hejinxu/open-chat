const CONVERSATIONS_KEY = 'open_chat_conversations'

export interface ConversationRecord {
  id: string
  name: string
  created_at: number
  updated_at: number
  agents?: Record<string, {
    params?: Record<string, any>
    backend_conversation_id?: string
  }>
}

export function getAllConversations(): ConversationRecord[] {
  if (typeof window === 'undefined') {
    return []
  }
  try {
    const d = localStorage.getItem(CONVERSATIONS_KEY)
    return d ? JSON.parse(d) : []
  }
  catch {
    return []
  }
}

export function saveAllConversations(convs: ConversationRecord[]): void {
  localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(convs))
}

export function getAgentParamsSync(convId: string, agentId: string): Record<string, any> | null {
  const convs = getAllConversations()
  const conv = convs.find(c => c.id === convId)
  return conv?.agents?.[agentId]?.params || null
}

export function saveAgentParamsSync(convId: string, agentId: string, params: Record<string, any>): void {
  const convs = getAllConversations()
  const conv = convs.find(c => c.id === convId)
  if (conv) {
    if (!conv.agents) {
      conv.agents = {}
    }
    if (!conv.agents[agentId]) {
      conv.agents[agentId] = {}
    }
    conv.agents[agentId].params = { ...params }
    conv.updated_at = Math.floor(Date.now() / 1000)
    saveAllConversations(convs)
  }
}

export function getBackendConvIdSync(convId: string, agentId: string): string | null {
  const convs = getAllConversations()
  const conv = convs.find(c => c.id === convId)
  return conv?.agents?.[agentId]?.backend_conversation_id || null
}

export function saveBackendConvIdSync(convId: string, agentId: string, backendId: string): void {
  const convs = getAllConversations()
  const conv = convs.find(c => c.id === convId)
  if (conv) {
    if (!conv.agents) {
      conv.agents = {}
    }
    if (!conv.agents[agentId]) {
      conv.agents[agentId] = { params: {} }
    }
    conv.agents[agentId].backend_conversation_id = backendId
    conv.updated_at = Math.floor(Date.now() / 1000)
    saveAllConversations(convs)
  }
}
