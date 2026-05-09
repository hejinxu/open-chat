import type { AgentSessionState, ConversationRecord } from '../storage/types'
import { getStorageProvider } from '../storage'

export class ConversationService {
  private storage = getStorageProvider()

  async getAllConversations(): Promise<ConversationRecord[]> {
    return this.storage.getConversations()
  }

  async createConversation(name: string, id?: string): Promise<ConversationRecord> {
    const now = Math.floor(Date.now() / 1000)
    const conv: ConversationRecord = {
      id: id || `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      created_at: now,
      updated_at: now,
      agents: {},
    }
    await this.storage.saveConversation(conv)
    return conv
  }

  async updateConversation(id: string, updates: Partial<Pick<ConversationRecord, 'name' | 'agents'>>): Promise<ConversationRecord | null> {
    const conv = await this.storage.getConversationById(id)
    if (!conv) return null
    const updated = { ...conv, ...updates, updated_at: Math.floor(Date.now() / 1000) }
    await this.storage.saveConversation(updated)
    return updated
  }

  async deleteConversation(id: string): Promise<void> {
    await this.storage.deleteConversation(id)
  }

  async getConversationById(id: string): Promise<ConversationRecord | null> {
    return this.storage.getConversationById(id)
  }

  private ensureAgents(conv: ConversationRecord): Record<string, AgentSessionState> {
    if (!conv.agents) conv.agents = {}
    return conv.agents
  }

  async getAgentSession(convId: string, agentId: string): Promise<AgentSessionState | null> {
    const conv = await this.storage.getConversationById(convId)
    if (!conv) return null
    return this.ensureAgents(conv)[agentId] || null
  }

  async saveAgentSession(convId: string, agentId: string, updates: Partial<AgentSessionState>): Promise<void> {
    const conv = await this.storage.getConversationById(convId)
    if (!conv) return
    const agents = this.ensureAgents(conv)
    const existing = agents[agentId] || { params: {} }
    agents[agentId] = { ...existing, ...updates }
    conv.updated_at = Math.floor(Date.now() / 1000)
    await this.storage.saveConversation(conv)
  }

  async getAgentParams(convId: string, agentId: string): Promise<Record<string, any> | null> {
    const session = await this.getAgentSession(convId, agentId)
    return session?.params || null
  }

  async saveAgentParams(convId: string, agentId: string, params: Record<string, any>): Promise<void> {
    await this.saveAgentSession(convId, agentId, { params: { ...params } })
  }

  async getBackendConversationId(convId: string, agentId: string): Promise<string | null> {
    const session = await this.getAgentSession(convId, agentId)
    return session?.backend_conversation_id || null
  }

  async saveBackendConversationId(convId: string, agentId: string, backendConvId: string): Promise<void> {
    await this.saveAgentSession(convId, agentId, { backend_conversation_id: backendConvId })
  }
}

let _instance: ConversationService | null = null

export function getConversationService(): ConversationService {
  if (!_instance) {
    _instance = new ConversationService()
  }
  return _instance
}
