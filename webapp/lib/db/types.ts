import type { ConversationRecord, MessageRecord } from '../storage/types'

export interface DatabaseProvider {
  getConversations(): Promise<ConversationRecord[]>
  getConversationById(id: string): Promise<ConversationRecord | null>
  saveConversation(conv: ConversationRecord): Promise<void>
  deleteConversation(id: string): Promise<void>
  getMessages(conversationId: string): Promise<MessageRecord[]>
  saveMessage(msg: MessageRecord): Promise<void>
  deleteMessages(conversationId: string): Promise<void>
  deleteMessagesByIds(ids: string[]): Promise<void>
}
