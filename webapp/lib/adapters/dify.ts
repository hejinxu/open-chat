import { ChatClient } from 'dify-client'
import type { ChatAdapter, SendMessageParams } from './types'

export class DifyAdapter implements ChatAdapter {
  type = 'dify'
  private client: ChatClient

  constructor(apiKey: string, apiUrl?: string) {
    this.client = new ChatClient(apiKey, apiUrl || undefined)
  }

  async sendMessage(params: SendMessageParams) {
    const { inputs, query, user, conversation_id, files, response_mode } = params
    const isStreaming = (response_mode || 'streaming') === 'streaming'
    const res = await this.client.createChatMessage(inputs, query, user, isStreaming, conversation_id, files)
    // dify-client returns Axios response; for streaming, .data is a Node.js Readable stream
    if (isStreaming) {
      return new Response(res.data as any, {
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }
    return res.data
  }

  async stopMessage(taskId: string, user: string) {
    const res = await fetch(`/chat-messages/${taskId}/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user }),
    })
    return res.json()
  }

  async getConversations(user: string) {
    const res = await this.client.getConversations(user)
    return res.data
  }

  async getMessages(conversationId: string, user: string) {
    const res = await this.client.getConversationMessages(user, conversationId)
    return res.data
  }

  async getParameters(user: string) {
    const res = await this.client.getApplicationParameters(user)
    return res.data
  }

  async renameConversation(id: string, name: string, user: string, autoGenerate?: boolean) {
    const data: Record<string, any> = { user }
    if (autoGenerate) {
      data.auto_generate = true
    } else {
      data.name = name
    }
    const res = await fetch(`${this.client['baseUrl']}/conversations/${id}/name`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.client['apiKey']}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })
    return res.json()
  }

  async messageFeedback(messageId: string, rating: string, user: string) {
    const res = await this.client.messageFeedback(messageId, rating as any, user)
    return res.data
  }

  async fileUpload(formData: FormData) {
    const res = await this.client.fileUpload(formData)
    return res.data
  }
}
