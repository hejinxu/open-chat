import type { ConversationRecord, MessageRecord } from '../storage/types'
import type { EmbedTokenRecord } from '@/types/embed'
import type { UserRecord, UserAccountRecord, AppIntegrationRecord, ApiKeyRecord } from '@/types/auth'

export interface DatabaseProvider {
  // Conversations
  getConversations(): Promise<ConversationRecord[]>
  getConversationById(id: string): Promise<ConversationRecord | null>
  saveConversation(conv: ConversationRecord): Promise<void>
  deleteConversation(id: string): Promise<void>

  // Messages
  getMessages(conversationId: string): Promise<MessageRecord[]>
  saveMessage(msg: MessageRecord): Promise<void>
  deleteMessages(conversationId: string): Promise<void>
  deleteMessagesByIds(ids: string[]): Promise<void>

  // Embed Tokens (legacy, will be migrated to app_integrations + api_keys)
  getEmbedTokens(): Promise<EmbedTokenRecord[]>
  getEmbedTokenById(id: string): Promise<EmbedTokenRecord | null>
  getEmbedTokenByValue(token: string): Promise<EmbedTokenRecord | null>
  saveEmbedToken(tok: EmbedTokenRecord): Promise<void>
  deleteEmbedToken(id: string): Promise<void>

  // Users
  getUserById(id: string): Promise<UserRecord | null>
  getUsers(): Promise<UserRecord[]>
  saveUser(user: UserRecord): Promise<void>
  deleteUser(id: string): Promise<void>

  // User Accounts
  getUserAccountByIdentifier(identifier: string): Promise<UserAccountRecord | null>
  getUserAccountsByUserId(userId: string): Promise<UserAccountRecord[]>
  saveUserAccount(account: UserAccountRecord): Promise<void>
  deleteUserAccount(id: string): Promise<void>

  // App Integrations
  getAppIntegrations(): Promise<AppIntegrationRecord[]>
  getAppIntegrationById(id: string): Promise<AppIntegrationRecord | null>
  getAppIntegrationByAppId(appId: string): Promise<AppIntegrationRecord | null>
  saveAppIntegration(integration: AppIntegrationRecord): Promise<void>
  deleteAppIntegration(id: string): Promise<void>

  // API Keys
  getApiKeysByIntegration(integrationId: string): Promise<ApiKeyRecord[]>
  getApiKeyByKeyHash(keyHash: string): Promise<ApiKeyRecord | null>
  saveApiKey(key: ApiKeyRecord): Promise<void>
  deleteApiKey(id: string): Promise<void>
  updateApiKeyLastUsed(id: string): Promise<void>
}
