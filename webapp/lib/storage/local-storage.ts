import type { AgentSessionState, ConversationRecord, MessageRecord, StorageProvider } from './types'

const CONVERSATIONS_KEY = 'open_chat_conversations'
const MESSAGES_KEY = 'open_chat_messages'
const OLD_PARAMS_KEY = 'open_chat_conv_agent_params'
const OLD_DIFY_KEY = 'open_chat_dify_conv_map'
const MIGRATED_KEY = 'open_chat_v2_migrated'

function getAllConversationsFromStorage(): ConversationRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const data = localStorage.getItem(CONVERSATIONS_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

function saveAllConversationsToStorage(conversations: ConversationRecord[]) {
  localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations))
}

function getAllMessagesFromStorage(): MessageRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const data = localStorage.getItem(MESSAGES_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

function saveAllMessagesToStorage(messages: MessageRecord[]) {
  localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages))
}

function migrateOldData() {
  if (typeof window === 'undefined') return
  if (localStorage.getItem(MIGRATED_KEY)) return

  try {
    // Migrate old per-conversation per-agent params
    const oldParamsRaw = localStorage.getItem(OLD_PARAMS_KEY)
    const oldParams: Record<string, Record<string, Record<string, any>>> = oldParamsRaw ? JSON.parse(oldParamsRaw) : {}

    // Migrate old Dify conversation ID mappings
    const oldDifyRaw = localStorage.getItem(OLD_DIFY_KEY)
    const oldDify: Record<string, Record<string, string>> = oldDifyRaw ? JSON.parse(oldDifyRaw) : {}

    const conversations = getAllConversationsFromStorage()
    let changed = false

    for (const conv of conversations) {
      if (!conv.agents) conv.agents = {}

      // Merge params
      const convParams = oldParams[conv.id]
      if (convParams) {
        for (const [agentId, params] of Object.entries(convParams)) {
          if (!conv.agents[agentId]) conv.agents[agentId] = { params: {} }
          Object.assign(conv.agents[agentId].params, params)
        }
        changed = true
      }

      // Merge Dify conv IDs
      const convDify = oldDify[conv.id]
      if (convDify) {
        for (const [agentId, backendId] of Object.entries(convDify)) {
          if (!conv.agents[agentId]) conv.agents[agentId] = { params: {} }
          conv.agents[agentId].backend_conversation_id = backendId
        }
        changed = true
      }
    }

    if (changed) saveAllConversationsToStorage(conversations)

    localStorage.removeItem(OLD_PARAMS_KEY)
    localStorage.removeItem(OLD_DIFY_KEY)
    localStorage.setItem(MIGRATED_KEY, '1')
  } catch { /* ignore */ }
}

export class LocalStorageProvider implements StorageProvider {
  async getConversations(): Promise<ConversationRecord[]> {
    migrateOldData()
    const conversations = getAllConversationsFromStorage()
    // Ensure all conversations have agents field
    for (const conv of conversations) {
      if (!conv.agents) conv.agents = {}
    }
    return conversations.sort((a, b) => b.updated_at - a.updated_at)
  }

  async getConversationById(id: string): Promise<ConversationRecord | null> {
    const conversations = getAllConversationsFromStorage()
    const conv = conversations.find(c => c.id === id) || null
    if (conv && !conv.agents) conv.agents = {}
    return conv
  }

  async saveConversation(conv: ConversationRecord): Promise<void> {
    if (!conv.agents) conv.agents = {}
    const conversations = getAllConversationsFromStorage()
    const index = conversations.findIndex(c => c.id === conv.id)
    if (index >= 0) {
      conversations[index] = conv
    } else {
      conversations.push(conv)
    }
    saveAllConversationsToStorage(conversations)
  }

  async deleteConversation(id: string): Promise<void> {
    const conversations = getAllConversationsFromStorage()
    saveAllConversationsToStorage(conversations.filter(c => c.id !== id))
    const messages = getAllMessagesFromStorage()
    saveAllMessagesToStorage(messages.filter(m => m.conversation_id !== id))
  }

  async getMessages(conversationId: string): Promise<MessageRecord[]> {
    const messages = getAllMessagesFromStorage()
    return messages
      .filter(m => m.conversation_id === conversationId)
      .sort((a, b) => a.created_at - b.created_at)
  }

  async saveMessage(msg: MessageRecord): Promise<void> {
    const messages = getAllMessagesFromStorage()
    const index = messages.findIndex(m => m.id === msg.id)
    if (index >= 0) {
      messages[index] = msg
    } else {
      messages.push(msg)
    }
    saveAllMessagesToStorage(messages)

    const conversations = getAllConversationsFromStorage()
    const conv = conversations.find(c => c.id === msg.conversation_id)
    if (conv) {
      conv.updated_at = Math.floor(Date.now() / 1000)
      saveAllConversationsToStorage(conversations)
    }
  }

  async deleteMessages(conversationId: string): Promise<void> {
    const messages = getAllMessagesFromStorage()
    saveAllMessagesToStorage(messages.filter(m => m.conversation_id !== conversationId))
  }
}

let _instance: StorageProvider | null = null

export function getStorageProvider(): StorageProvider {
  if (!_instance) {
    _instance = new LocalStorageProvider()
  }
  return _instance
}
