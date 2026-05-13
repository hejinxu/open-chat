import type { ConversationRecord, MessageRecord } from '../storage/types'
import type { EmbedTokenRecord } from '@/types/embed'

export interface DatabaseProvider {
  getConversations(): Promise<ConversationRecord[]>
  getConversationById(id: string): Promise<ConversationRecord | null>
  saveConversation(conv: ConversationRecord): Promise<void>
  deleteConversation(id: string): Promise<void>
  getMessages(conversationId: string): Promise<MessageRecord[]>
  saveMessage(msg: MessageRecord): Promise<void>
  deleteMessages(conversationId: string): Promise<void>
  deleteMessagesByIds(ids: string[]): Promise<void>
  getEmbedTokens(): Promise<EmbedTokenRecord[]>
  getEmbedTokenById(id: string): Promise<EmbedTokenRecord | null>
  getEmbedTokenByValue(token: string): Promise<EmbedTokenRecord | null>
  saveEmbedToken(tok: EmbedTokenRecord): Promise<void>
  deleteEmbedToken(id: string): Promise<void>
}
