import type { ChatAdapter, SendMessageParams } from './types'

export class LLMAdapter implements ChatAdapter {
  type = 'direct_llm'
  private apiKey: string
  private apiUrl: string
  private model: string

  constructor(apiKey: string, apiUrl: string, model?: string) {
    this.apiKey = apiKey
    this.apiUrl = apiUrl.replace(/\/+$/, '')
    this.model = model || 'gpt-3.5-turbo'
  }

  private getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    }
  }

  async sendMessage(params: SendMessageParams) {
    const { query, conversation_id, user, inputs, response_mode } = params
    const isStreaming = (response_mode || 'streaming') === 'streaming'

    const messages: any[] = []
    if (inputs?.system_prompt) {
      messages.push({ role: 'system', content: inputs.system_prompt })
    }
    messages.push({ role: 'user', content: query })

    const body = {
      model: this.model,
      messages,
      stream: isStreaming,
      temperature: inputs?.temperature || 0.7,
      max_tokens: inputs?.max_tokens || 4096,
    }

    const res = await fetch(`${this.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    })

    if (!isStreaming) {
      const data = await res.json()
      const answer = data.choices?.[0]?.message?.content || ''
      const fakeId = `llm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      return new Response(JSON.stringify({
        event: 'message',
        message_id: fakeId,
        conversation_id: conversation_id || '',
        answer,
        created_at: Math.floor(Date.now() / 1000),
      }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const reader = res.body?.getReader()
        if (!reader) { controller.close(); return }
        const decoder = new TextDecoder('utf-8')
        let buffer = ''
        const fakeId = `llm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        let sentStart = false

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              const data = line.slice(6).trim()
              if (data === '[DONE]') {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: 'message_end', id: fakeId })}\n\n`))
                break
              }
              try {
                const parsed = JSON.parse(data)
                const content = parsed.choices?.[0]?.delta?.content
                if (content) {
                  if (!sentStart) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: 'message', message_id: fakeId, answer: '', conversation_id: conversation_id || '', created_at: Math.floor(Date.now() / 1000) })}\n\n`))
                    sentStart = true
                  }
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: 'message', message_id: fakeId, answer: content, conversation_id: conversation_id || '' })}\n\n`))
                }
              } catch { /* ignore parse errors */ }
            }
          }
        } catch (e) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: 'message_end', id: fakeId, status: 'failed' })}\n\n`))
        }
        controller.close()
      },
    })

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }

  async stopMessage(_taskId: string, _user: string) {
    // OpenAI compatible APIs don't have a standard stop endpoint
  }

  async getConversations(_user: string) {
    return { data: [], has_more: false }
  }

  async getMessages(_conversationId: string, _user: string) {
    return { data: [], has_more: false }
  }

  async getParameters(_user: string) {
    return { prompt_templates: [], prompt_variables: [] }
  }

  async renameConversation(_id: string, _name: string, _user: string) {
    return { data: {} }
  }

  async messageFeedback(_messageId: string, _rating: string, _user: string) {
    return { data: {} }
  }

  async fileUpload(_formData: FormData) {
    return { data: { id: '' } }
  }
}
