import type { IOnCompleted, IOnData, IOnError, IOnFile, IOnMessageEnd, IOnMessageReplace, IOnNodeFinished, IOnNodeStarted, IOnThought, IOnWorkflowFinished, IOnWorkflowStarted } from './base'
import { get, post, ssePost } from './base'
import type { Feedbacktype } from '@/types/app'
import { getConversationService } from '@/lib/services/conversation'
import { getMessageService } from '@/lib/services/message'
import type { ConversationRecord, MessageRecord } from '@/lib/storage/types'

export const sendChatMessage = async (
  body: Record<string, any>,
  {
    onData,
    onCompleted,
    onThought,
    onFile,
    onError,
    getAbortController,
    onMessageEnd,
    onMessageReplace,
    onWorkflowStarted,
    onNodeStarted,
    onNodeFinished,
    onWorkflowFinished,
  }: {
    onData: IOnData
    onCompleted: IOnCompleted
    onFile: IOnFile
    onThought: IOnThought
    onMessageEnd: IOnMessageEnd
    onMessageReplace: IOnMessageReplace
    onError: IOnError
    getAbortController?: (abortController: AbortController) => void
    onWorkflowStarted: IOnWorkflowStarted
    onNodeStarted: IOnNodeStarted
    onNodeFinished: IOnNodeFinished
    onWorkflowFinished: IOnWorkflowFinished
  },
) => {
  const { agent_id, ...rest } = body
  const headers: Record<string, string> = {}
  if (agent_id) headers['x-agent-id'] = agent_id
  return ssePost('chat-messages', {
    body: {
      ...rest,
      response_mode: 'streaming',
    },
    headers,
  }, { onData, onCompleted, onThought, onFile, onError, getAbortController, onMessageEnd, onMessageReplace, onNodeStarted, onWorkflowStarted, onWorkflowFinished, onNodeFinished })
}

export const fetchConversations = async () => {
  try {
    const service = getConversationService()
    const conversations: ConversationRecord[] = await service.getAllConversations()
    return { data: conversations.map(c => ({ ...c, inputs: {}, introduction: '', suggested_questions: [] })), error: undefined }
  }
  catch (error: any) {
    return { data: [], error: error.message }
  }
}

function messageRecordsToResponse(messages: MessageRecord[]) {
  const pairs: any[] = []
  let pendingUser: MessageRecord | null = null
  for (const msg of messages) {
    if (msg.role === 'user') {
      pendingUser = msg
    }
    else if (msg.role === 'assistant' && pendingUser) {
      pairs.push({
        id: msg.id,
        query: pendingUser.content,
        answer: msg.content,
        message_files: [...(pendingUser.message_files || []), ...(msg.message_files || [])],
        agent_thoughts: msg.agent_thoughts || [],
        feedback: msg.feedback,
      })
      pendingUser = null
    }
  }
  return { data: pairs, has_more: false }
}

export const fetchChatList = async (conversationId: string) => {
  try {
    const service = getMessageService()
    const messages = await service.getMessages(conversationId)
    return messageRecordsToResponse(messages)
  }
  catch {
    return { data: [], has_more: false }
  }
}

// init value. wait for server update
export const fetchAppParams = async () => {
  return get('parameters')
}

export const updateFeedback = async ({ url, body }: { url: string, body: Feedbacktype }) => {
  return post(url, { body })
}

export const stopChatMessage = async (taskId: string) => {
  return post(`chat-messages/${taskId}/stop`)
}

export const saveUserMessage = async (params: {
  conversation_id: string
  content: string
  agent_id?: string | null
  agent_name?: string | null
  message_files?: any[]
}) => {
  const service = getMessageService()
  return service.saveUserMessage(params)
}

export const saveAssistantMessage = async (params: {
  conversation_id: string
  content: string
  agent_id?: string | null
  agent_name?: string | null
  message_files?: any[]
  agent_thoughts?: any[]
}) => {
  const service = getMessageService()
  return service.saveAssistantMessage(params)
}

export const createLocalConversation = async (name: string, id?: string) => {
  const service = getConversationService()
  return service.createConversation(name, id)
}

export const updateLocalConversationName = async (id: string, name: string) => {
  const service = getConversationService()
  return service.updateConversation(id, { name })
}
