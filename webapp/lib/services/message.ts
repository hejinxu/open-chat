import type { MessageRecord } from '../storage/types'
import { getStorageProvider } from '../storage'

export class MessageService {
  private storage = getStorageProvider()

  async getMessages(conversationId: string): Promise<MessageRecord[]> {
    return this.storage.getMessages(conversationId)
  }

  async saveMessage(msg: MessageRecord): Promise<void> {
    await this.storage.saveMessage(msg)
  }

  async saveUserMessage(params: {
    conversation_id: string
    content: string
    agent_id?: string | null
    agent_name?: string | null
    message_files?: any[]
  }): Promise<MessageRecord> {
    const now = Math.floor(Date.now() / 1000)
    const msg: MessageRecord = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      conversation_id: params.conversation_id,
      agent_id: params.agent_id || null,
      agent_name: params.agent_name || null,
      role: 'user',
      content: params.content,
      is_answer: false,
      feedback: null,
      message_files: params.message_files || [],
      agent_thoughts: [],
      created_at: now,
    }
    await this.storage.saveMessage(msg)
    return msg
  }

  async saveAssistantMessage(params: {
    conversation_id: string
    content: string
    agent_id?: string | null
    agent_name?: string | null
    message_files?: any[]
    agent_thoughts?: any[]
  }): Promise<MessageRecord> {
    const now = Math.floor(Date.now() / 1000)
    const msg: MessageRecord = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      conversation_id: params.conversation_id,
      agent_id: params.agent_id || null,
      agent_name: params.agent_name || null,
      role: 'assistant',
      content: params.content,
      is_answer: true,
      feedback: null,
      message_files: params.message_files || [],
      agent_thoughts: params.agent_thoughts || [],
      created_at: now,
    }
    await this.storage.saveMessage(msg)
    return msg
  }

  async deleteMessages(conversationId: string): Promise<void> {
    await this.storage.deleteMessages(conversationId)
  }

  async deleteMessagesByIds(ids: string[]): Promise<void> {
    await this.storage.deleteMessagesByIds(ids)
  }
}

let _instance: MessageService | null = null

export function getMessageService(): MessageService {
  if (!_instance) {
    _instance = new MessageService()
  }
  return _instance
}
