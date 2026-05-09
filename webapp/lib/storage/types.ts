export interface AgentSessionState {
  params: Record<string, any>
  backend_conversation_id?: string
}

export interface ConversationRecord {
  id: string
  name: string
  created_at: number
  updated_at: number
  agents: Record<string, AgentSessionState>
}

export interface MessageRecord {
  id: string
  conversation_id: string
  agent_id: string | null
  agent_name: string | null
  role: 'user' | 'assistant'
  content: string
  is_answer: boolean
  feedback: { rating: string } | null
  message_files: any[]
  agent_thoughts: any[]
  created_at: number
}

export interface StorageProvider {
  getConversations(): Promise<ConversationRecord[]>
  getConversationById(id: string): Promise<ConversationRecord | null>
  saveConversation(conv: ConversationRecord): Promise<void>
  deleteConversation(id: string): Promise<void>

  getMessages(conversationId: string): Promise<MessageRecord[]>
  saveMessage(msg: MessageRecord): Promise<void>
  deleteMessages(conversationId: string): Promise<void>
}
