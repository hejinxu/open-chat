import type { ConversationRecord, MessageRecord, StorageProvider } from './types'
import { BASE_PATH } from '@/config'

const TIMEOUT_MS = 10000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Request timeout')), ms)),
  ])
}

export class RemoteStorageProvider implements StorageProvider {
  private apiKey: string | null = null
  private get baseUrl() { return `${BASE_PATH}/api/storage` }

  setApiKey(key: string | null) {
    this.apiKey = key
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.apiKey)
    { headers['x-api-key'] = this.apiKey }
    return headers
  }

  async getConversations(): Promise<ConversationRecord[]> {
    const res = await withTimeout(
      fetch(`${this.baseUrl}/conversations`, { headers: this.getHeaders() }),
      TIMEOUT_MS,
    )
    if (!res.ok) { throw new Error('API failed') }
    const data = await res.json()
    if (!data.success) { throw new Error(data.error) }
    return data.data
  }

  async getConversationById(id: string): Promise<ConversationRecord | null> {
    const res = await withTimeout(
      fetch(`${this.baseUrl}/conversations?id=${encodeURIComponent(id)}`, { headers: this.getHeaders() }),
      TIMEOUT_MS,
    )
    if (!res.ok) { throw new Error('API failed') }
    const data = await res.json()
    if (!data.success) { throw new Error(data.error) }
    return data.data
  }

  async saveConversation(conv: ConversationRecord): Promise<void> {
    const res = await withTimeout(
      fetch(`${this.baseUrl}/conversations`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(conv),
      }),
      TIMEOUT_MS,
    )
    if (!res.ok) { throw new Error('API failed') }
  }

  async deleteConversation(id: string): Promise<void> {
    const res = await withTimeout(
      fetch(`${this.baseUrl}/conversations`, {
        method: 'DELETE',
        headers: this.getHeaders(),
        body: JSON.stringify({ id }),
      }),
      TIMEOUT_MS,
    )
    if (!res.ok) { throw new Error('API failed') }
  }

  async updateConversationAgentParams(convId: string, agentId: string, paramsJson: string): Promise<void> {
    const res = await withTimeout(
      fetch(`${this.baseUrl}/conversations/agent-params`, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify({ convId, agentId, paramsJson }),
      }),
      TIMEOUT_MS,
    )
    if (!res.ok) { throw new Error('API failed') }
  }

  async updateConversationBackendConvId(convId: string, agentId: string, backendConvId: string): Promise<void> {
    const res = await withTimeout(
      fetch(`${this.baseUrl}/conversations/backend-conv-id`, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify({ convId, agentId, backendConvId }),
      }),
      TIMEOUT_MS,
    )
    if (!res.ok) { throw new Error('API failed') }
  }

  async getMessages(conversationId: string): Promise<MessageRecord[]> {
    const res = await withTimeout(
      fetch(`${this.baseUrl}/messages?conversation_id=${encodeURIComponent(conversationId)}`, { headers: this.getHeaders() }),
      TIMEOUT_MS,
    )
    if (!res.ok) { throw new Error('API failed') }
    const data = await res.json()
    if (!data.success) { throw new Error(data.error) }
    return data.data
  }

  async saveMessage(msg: MessageRecord): Promise<void> {
    const res = await withTimeout(
      fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(msg),
      }),
      TIMEOUT_MS,
    )
    if (!res.ok) { throw new Error('API failed') }
  }

  async deleteMessages(conversationId: string): Promise<void> {
    const res = await withTimeout(
      fetch(`${this.baseUrl}/messages`, {
        method: 'DELETE',
        headers: this.getHeaders(),
        body: JSON.stringify({ conversation_id: conversationId }),
      }),
      TIMEOUT_MS,
    )
    if (!res.ok) { throw new Error('API failed') }
  }

  async deleteMessagesByIds(ids: string[]): Promise<void> {
    const res = await withTimeout(
      fetch(`${this.baseUrl}/messages`, {
        method: 'DELETE',
        headers: this.getHeaders(),
        body: JSON.stringify({ ids }),
      }),
      TIMEOUT_MS,
    )
    if (!res.ok) { throw new Error('API failed') }
  }

  async updateMessageFeedback(id: string, feedback: string): Promise<void> {
    const res = await withTimeout(
      fetch(`${this.baseUrl}/messages/feedback`, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify({ id, feedback }),
      }),
      TIMEOUT_MS,
    )
    if (!res.ok) { throw new Error('API failed') }
  }
}
