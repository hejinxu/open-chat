import { ChatClient } from 'dify-client'
import type { ChatAdapter, SendMessageParams } from './types'

export class ConversationNotFoundError extends Error {
  constructor() {
    super('Conversation not found on backend')
    this.name = 'ConversationNotFoundError'
  }
}

export class DifyAdapter implements ChatAdapter {
  type = 'dify'
  private client: ChatClient

  constructor(apiKey: string, apiUrl?: string) {
    this.client = new ChatClient(apiKey, apiUrl || undefined)
  }

  async sendMessage(params: SendMessageParams) {
    const { inputs, query, user, conversation_id, files, response_mode } = params
    const isStreaming = (response_mode || 'streaming') === 'streaming'
    try {
      const res = await this.client.createChatMessage(inputs, query, user, isStreaming, conversation_id, files)
      // dify-client returns Axios response; for streaming, .data is a Node.js Readable stream
      if (isStreaming) {
        return new Response(res.data as any, {
          headers: { 'Content-Type': 'text/event-stream' },
        })
      }
      return res.data
    }
    catch (error: any) {
      // Dify returns 404 with code "not_found" when conversation_id does not exist on backend
      // Only retry when conversation_id was provided and the error is specifically about conversation not found
      const isConversationNotFound = error.response?.status === 404
        && conversation_id
        && error.response?.data?.code === 'not_found'
        && error.response?.data?.message?.includes('Conversation Not Exists')
      if (isConversationNotFound) {
        throw new ConversationNotFoundError()
      }
      throw error
    }
  }

  async stopMessage(taskId: string, user: string) {
    // eslint-disable-next-line dot-notation
    const res = await fetch(`${this.client['baseUrl']}/chat-messages/${taskId}/stop`, {
      method: 'POST',
      headers: {
        // eslint-disable-next-line dot-notation
        'Authorization': `Bearer ${this.client['apiKey']}`,
        'Content-Type': 'application/json',
      },
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
    // eslint-disable-next-line dot-notation
    const res = await fetch(`${this.client['baseUrl']}/conversations/${id}/name`, {
      method: 'POST',
      headers: {
        // eslint-disable-next-line dot-notation
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
