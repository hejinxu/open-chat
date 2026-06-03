import type { ConversationRecord, MessageRecord } from '../storage/types'
import type { UserRecord, UserAccountRecord, AppIntegrationRecord, ApiKeyRecord } from '@/types/auth'
import type { AgentRecord } from '@/types/agent'
import type { ModelProvider, Model } from '@/types/model'

export interface DatabaseProvider {
  // Conversations
  getConversations: () => Promise<ConversationRecord[]>
  getConversationById: (id: string) => Promise<ConversationRecord | null>
  saveConversation: (conv: ConversationRecord) => Promise<void>
  deleteConversation: (id: string) => Promise<void>
  updateConversationAgentParams: (convId: string, agentId: string, paramsJson: string) => Promise<void>
  updateConversationBackendConvId: (convId: string, agentId: string, backendConvId: string) => Promise<void>

  // Messages
  getMessages: (conversationId: string) => Promise<MessageRecord[]>
  saveMessage: (msg: MessageRecord) => Promise<void>
  deleteMessages: (conversationId: string) => Promise<void>
  deleteMessagesByIds: (ids: string[]) => Promise<void>
  updateMessageFeedback: (id: string, feedback: string) => Promise<void>

  // Users
  getUserById: (id: string) => Promise<UserRecord | null>
  getUsers: () => Promise<UserRecord[]>
  saveUser: (user: UserRecord) => Promise<void>
  deleteUser: (id: string) => Promise<void>

  // User Accounts
  getUserAccountByIdentifier: (identifier: string) => Promise<UserAccountRecord | null>
  getUserAccountsByUserId: (userId: string) => Promise<UserAccountRecord[]>
  saveUserAccount: (account: UserAccountRecord) => Promise<void>
  deleteUserAccount: (id: string) => Promise<void>

  // App Integrations
  getAppIntegrations: () => Promise<AppIntegrationRecord[]>
  getAppIntegrationById: (id: string) => Promise<AppIntegrationRecord | null>
  getAppIntegrationByAppId: (appId: string) => Promise<AppIntegrationRecord | null>
  saveAppIntegration: (integration: AppIntegrationRecord) => Promise<void>
  deleteAppIntegration: (id: string) => Promise<void>

  // API Keys
  getApiKeysByIntegration: (integrationId: string) => Promise<ApiKeyRecord[]>
  getApiKeyByKeyHash: (keyHash: string) => Promise<ApiKeyRecord | null>
  saveApiKey: (key: ApiKeyRecord) => Promise<void>
  deleteApiKey: (id: string) => Promise<void>
  updateApiKeyLastUsed: (id: string) => Promise<void>

  // Agents
  getAgents: () => Promise<AgentRecord[]>
  getAgentById: (id: string) => Promise<AgentRecord | null>
  getDefaultAgent: () => Promise<AgentRecord | null>
  saveAgent: (agent: AgentRecord) => Promise<void>
  deleteAgent: (id: string) => Promise<void>
  setDefaultAgent: (id: string) => Promise<void>

  // Model Providers
  getModelProviders: () => Promise<ModelProvider[]>
  getModelProviderById: (id: string) => Promise<ModelProvider | null>
  saveModelProvider: (provider: ModelProvider) => Promise<void>
  deleteModelProvider: (id: string) => Promise<void>

  // Models
  getModels: () => Promise<Model[]>
  getModelsByProvider: (providerId: string) => Promise<Model[]>
  getModelById: (id: string) => Promise<Model | null>
  saveModel: (model: Model) => Promise<void>
  deleteModel: (id: string) => Promise<void>
}
