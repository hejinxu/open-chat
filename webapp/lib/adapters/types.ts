export interface SendMessageParams {
  inputs?: Record<string, any>
  query: string
  user: string
  conversation_id?: string | null
  files?: any[] | null
  response_mode?: 'blocking' | 'streaming'
  messages?: Array<{ role: string, content: string }>
}

export interface ChatAdapter {
  type: string
  sendMessage(params: SendMessageParams): Promise<any>
  stopMessage(taskId: string, user: string): Promise<void>
  getConversations(user: string): Promise<any>
  getMessages(conversationId: string, user: string): Promise<any>
  getParameters(user: string): Promise<any>
  renameConversation(id: string, name: string, user: string, autoGenerate?: boolean): Promise<any>
  messageFeedback(messageId: string, rating: string, user: string): Promise<any>
  fileUpload(formData: FormData): Promise<any>
}
