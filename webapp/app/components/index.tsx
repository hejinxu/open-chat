'use client'
import type { FC } from 'react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import produce, { setAutoFreeze } from 'immer'
import { useBoolean, useGetState } from 'ahooks'
import useConversation from '@/hooks/use-conversation'
import Toast from '@/app/components/base/toast'
import Sidebar from '@/app/components/sidebar'
import ConfigSence from '@/app/components/config-scence'
import Header from '@/app/components/header'
import { fetchAppParams, fetchChatList, fetchConversations, sendChatMessage, stopChatMessage, saveUserMessage, saveAssistantMessage, createLocalConversation, updateLocalConversationName } from '@/service'
import type { ChatItem, ConversationItem, Feedbacktype, PromptConfig, VisionFile, VisionSettings } from '@/types/app'
import type { FileUpload } from '@/app/components/base/file-uploader-in-attachment/types'
import { Resolution, TransferMethod, WorkflowRunningStatus } from '@/types/app'
import Chat from '@/app/components/chat'
import { setLocaleOnClient } from '@/i18n/client'
import useBreakpoints, { MediaType } from '@/hooks/use-breakpoints'
import Loading from '@/app/components/base/loading'
import { replaceVarWithValues, userInputsFormToPromptVariables } from '@/utils/prompt'
import { BASE_PATH } from '@/config'
import AppUnavailable from '@/app/components/app-unavailable'
import { API_KEY, APP_ID, APP_INFO, isShowPrompt, promptTemplate } from '@/config'
import type { Annotation as AnnotationType } from '@/types/log'
import { addFileInfos, sortAgentSorts } from '@/utils/tools'
import { getStorageProvider } from '@/lib/storage'
import { RemoteStorageProvider } from '@/lib/storage/remote-storage'
import { getConversationService } from '@/lib/services/conversation'
import { getMessageService } from '@/lib/services/message'
import { stopReadAloud } from '@/app/components/chat/text-to-speech'
import ConfirmDialog from '@/app/components/base/confirm-dialog'
import { extractCommands, stripCommands } from '@/lib/command-parser'

export interface IMainProps {
  params: any
}

const Main: FC<IMainProps> = (props) => {
  const { t } = useTranslation()
  const media = useBreakpoints()
  const isMobile = media === MediaType.mobile
  const hasSetAppConfig = APP_ID && API_KEY

  const isEmbed = !!(props?.params?.isEmbed)
  const apiKey = props?.params?.apiKey || ''
  const embedAgentId = props?.params?.embedAgentId as string | null
  const getAgentParamsCallback = props?.params?.getAgentParams as ((ctx: { agentId: string, agentName: string, backendType: string, paramKeys: string[] }) => Promise<Record<string, any>>) | undefined

  /*
  * app info
  */
  const [appUnavailable, setAppUnavailable] = useState<boolean>(false)
  const [isUnknownReason, setIsUnknownReason] = useState<boolean>(false)
  const [promptConfig, setPromptConfig] = useState<PromptConfig | null>(null)
  const [inited, setInited] = useState<boolean>(false)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [defaultAgentId, setDefaultAgentId] = useState<string>('')
  const [isDirectLLM, setIsDirectLLM] = useState<boolean>(false)
  const [isChatListLoading, setIsChatListLoading] = useState<boolean>(false)
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<string | null>(null)
  const agentInputsCacheRef = useRef<Record<string, Record<string, any>>>({})
  const skipChatListFetchRef = useRef(false)
  const chatListFetchIdRef = useRef(0)
  const promptVariablesCacheRef = useRef<Record<string, { key: string, name?: string, required?: boolean }[]>>({})
  const fetchingPromisesRef = useRef<Record<string, Promise<void>>>({})
  const agentTypeMapRef = useRef<Record<string, string>>({})
  const backendConvIdCacheRef = useRef<Record<string, string>>({})
  const hasSavedBackendConvIdRef = useRef<Record<string, boolean>>({})
  const [currentUser, setCurrentUser] = useState<{ name: string, role: string } | null>(null)

  // ---- Utility: fetch & cache prompt_variables ----
  const fetchAndCachePromptVars = useCallback(async (agentId: string | null) => {
    const key = agentId || ''
    if (fetchingPromisesRef.current[key]) {
      await fetchingPromisesRef.current[key]
      return
    }
    const promise = (async () => {
      try {
        const headers: Record<string, string> = {}
        if (agentId) { headers['x-agent-id'] = agentId }
        if (apiKey) { headers['x-api-key'] = apiKey }
        const res = await fetch(`${BASE_PATH}/api/parameters`, { headers })
        const data = await res.json()
        promptVariablesCacheRef.current[key] = userInputsFormToPromptVariables(data.user_input_form || [])
      } catch {
        promptVariablesCacheRef.current[key] = []
      }
      delete fetchingPromisesRef.current[key]
    })()
    fetchingPromisesRef.current[key] = promise
    await promise
  }, [apiKey])

  // ---- Utility: call host's getAgentParams callback ----
  const callHostGetAgentParams = useCallback(async (
    agentId: string,
    agentName: string,
    backendType: string,
    paramKeys: string[],
  ): Promise<Record<string, any> | null> => {
    const ctx = { agentId, agentName, backendType, paramKeys }

    // 1. Direct callback (same-origin, from props)
    if (getAgentParamsCallback) {
      try { return await getAgentParamsCallback(ctx) } catch { return null }
    }

    // 2. Same-origin: read from window directly
    if (typeof window !== 'undefined') {
      const globalCallback = (window as any).__getAgentParams || (window as any).__getAgentConversationParams
      if (globalCallback) {
        try { return await globalCallback(ctx) } catch { return null }
      }
    }

    // 3. Cross-origin: postMessage request-response
    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      return new Promise((resolve) => {
        const requestId = Math.random().toString(36).slice(2)
        let resolved = false
        const handler = (e: MessageEvent) => {
          if (e.data?.type === 'com.openchat.embed'
            && e.data?.action === 'params-response'
            && e.data?.requestId === requestId
            && !resolved) {
            resolved = true
            window.removeEventListener('message', handler)
            resolve(e.data.params || null)
          }
        }
        window.addEventListener('message', handler)
        window.parent.postMessage({
          type: 'com.openchat.embed',
          action: 'params-request',
          requestId,
          context: ctx,
        }, '*')
        setTimeout(() => {
          if (!resolved) {
            resolved = true
            window.removeEventListener('message', handler)
            resolve(null)
          }
        }, 5000)
      })
    }

    return null
  }, [getAgentParamsCallback])

  // ---- Utility: sync clean params against latest prompt_variables ----
  function syncAndCleanParams(convId: string, agentId: string, promptVars: { key: string }[]): Record<string, any> | null {
    const saved = agentInputsCacheRef.current[agentId] || null
    const validKeys = new Set(promptVars.map(v => v.key))
    const cleaned: Record<string, any> = {}
    if (saved) {
      for (const [k, v] of Object.entries(saved)) {
        if (validKeys.has(k)) {
          cleaned[k] = v
        }
      }
    }
    if (Object.keys(cleaned).length > 0) {
      agentInputsCacheRef.current[agentId] = { ...cleaned }
      return cleaned
    }
    agentInputsCacheRef.current[agentId] = {}
    return null
  }

  // ---- Async version: sync clean params with remote storage support ----
  async function syncAndCleanParamsAsync(convId: string | null, agentId: string, promptVars: { key: string }[]): Promise<Record<string, any> | null> {
    if (!convId || convId === '-1') {
      return agentInputsCacheRef.current[agentId] || null
    }

    // 获取参数（远程，超时直接抛错）
    const provider = getStorageProvider()
    const conv = await provider.getConversationById(convId)
    const saved = conv?.agents?.[agentId]?.params || null

    // 清洗逻辑
    const validKeys = new Set(promptVars.map(v => v.key))
    const cleaned: Record<string, any> = {}
    let dirty = false
    if (saved) {
      for (const [k, v] of Object.entries(saved)) {
        if (validKeys.has(k)) {
          cleaned[k] = v
        } else {
          dirty = true
        }
      }
    }

    if (dirty) {
      getConversationService().saveAgentParams(convId, agentId, cleaned).catch(console.error)
    }

    if (Object.keys(cleaned).length > 0) {
      agentInputsCacheRef.current[agentId] = { ...cleaned }
      return cleaned
    }

    agentInputsCacheRef.current[agentId] = {}
    return null
  }

  // ---- Async: get backend_conversation_id ----
  async function getBackendConvId(convId: string, agentId: string): Promise<string | null> {
    const cacheKey = `${convId}:${agentId}`

    // 1. ref 缓存
    if (backendConvIdCacheRef.current[cacheKey]) {
      return backendConvIdCacheRef.current[cacheKey]
    }

    // 2. 远程存储（超时直接 throw，不 fallback）
    const provider = getStorageProvider()
    const conv = await provider.getConversationById(convId)
    if (!conv) { return null }

    const backendConvId = conv.agents?.[agentId]?.backend_conversation_id || null
    if (backendConvId) {
      backendConvIdCacheRef.current[cacheKey] = backendConvId
    }
    return backendConvId
  }

  // ---- Save backend_conversation_id ----
  function saveBackendConvId(convId: string, agentId: string, backendId: string) {
    const cacheKey = `${convId}:${agentId}`

    // 1. 立即更新 ref 缓存
    backendConvIdCacheRef.current[cacheKey] = backendId

    // 2. 异步写入远程存储（静默失败，不打断流式响应）
    getConversationService().saveBackendConversationId(convId, agentId, backendId).catch((error) => {
      console.error('Failed to sync backend_conv_id to remote:', error)
    })
  }

  // ---- Save agent params ----
  async function saveAgentParams(convId: string, agentId: string, params: Record<string, any>) {
    // 1. 立即更新 ref 缓存
    agentInputsCacheRef.current[agentId] = { ...params }

    // 2. 写入远程存储（失败直接抛错，由调用方处理）
    const provider = getStorageProvider()
    await provider.updateConversationAgentParams(convId, agentId, JSON.stringify(params))
  }

  // in mobile, show sidebar by click button
  const [isShowSidebar, { setTrue: showSidebar, setFalse: hideSidebar }] = useBoolean(false)
  const [visionConfig, setVisionConfig] = useState<VisionSettings | undefined>({
    enabled: false,
    number_limits: 2,
    detail: Resolution.low,
    transfer_methods: [TransferMethod.local_file],
  })
  const [fileConfig, setFileConfig] = useState<FileUpload | undefined>()

  useEffect(() => {
    if (APP_INFO?.title) { document.title = `${APP_INFO.title} - Powered by Dify` }
  }, [APP_INFO?.title])

  // Listen for embed sidebar toggle from parent frame
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.data?.type === 'com.openchat.embed' && e.data?.action === 'toggle-sidebar') {
        showSidebar()
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  // onData change thought (the produce obj). https://github.com/immerjs/immer/issues/576
  useEffect(() => {
    setAutoFreeze(false)
    return () => {
      setAutoFreeze(true)
    }
  }, [])

  /*
  * conversation info
  */
  const {
    conversationList,
    setConversationList,
    currConversationId,
    getCurrConversationId,
    setCurrConversationId,
    getConversationIdFromStorage,
    isNewConversation,
    currConversationInfo,
    currInputs,
    newConversationInputs,
    resetNewConversationInputs,
    setCurrInputs,
    setNewConversationInfo,
    setExistConversationInfo,
  } = useConversation()

  const [conversationIdChangeBecauseOfNew, setConversationIdChangeBecauseOfNew, getConversationIdChangeBecauseOfNew] = useGetState(false)
  const [isChatStarted, { setTrue: setChatStarted, setFalse: setChatNotStarted }] = useBoolean(false)
  const handleStartChat = (inputs: Record<string, any>) => {
    createNewChat()
    setConversationIdChangeBecauseOfNew(true)
    setCurrInputs(inputs)
    // Save to agent cache
    agentInputsCacheRef.current[selectedAgentId || defaultAgentId] = { ...inputs }
    setChatStarted()
    // parse variables in introduction
    setChatList(generateNewChatListWithOpenStatement('', inputs))
  }
  const hasSetInputs = (() => {
    if (!isNewConversation) { return true }
    if (isDirectLLM) { return true }

    return isChatStarted
  })()

  const conversationName = currConversationInfo?.name || t('app.chat.newChatDefaultName') as string
  const conversationIntroduction = currConversationInfo?.introduction || ''
  const suggestedQuestions = currConversationInfo?.suggested_questions || []

  const handleConversationSwitch = () => {
    if (!inited) { return }

    // update inputs of current conversation
    let notSyncToStateIntroduction = ''
    let notSyncToStateInputs: Record<string, any> | undefined | null = {}
    if (!isNewConversation) {
      const item = conversationList.find(item => item.id === currConversationId)
      notSyncToStateInputs = item?.inputs || {}
      setCurrInputs(notSyncToStateInputs as any)
      notSyncToStateIntroduction = item?.introduction || ''
      setExistConversationInfo({
        name: item?.name || '',
        introduction: notSyncToStateIntroduction,
        suggested_questions: suggestedQuestions,
      })
    }
    else {
      notSyncToStateInputs = newConversationInputs
      setCurrInputs(notSyncToStateInputs)
    }

    // Sync agent params when switching conversations (async load from remote)
    if (!isNewConversation && currConversationId && currConversationId !== '-1') {
      const agentKey = selectedAgentId || defaultAgentId
      const promptVars = promptVariablesCacheRef.current[agentKey]
      if (promptVars && agentKey) {
        syncAndCleanParamsAsync(currConversationId, agentKey, promptVars).then((cleaned) => {
          if (cleaned) {
            setCurrInputs(cleaned)
          }
        }).catch(console.error)
      }
    }

    // update chat list of current conversation
    if (!isNewConversation && !conversationIdChangeBecauseOfNew && !isResponding && !skipChatListFetchRef.current) {
      setChatList([])
      setIsChatListLoading(true)
      chatListFetchIdRef.current += 1
      const fetchId = chatListFetchIdRef.current
      fetchChatList(currConversationId).then((res: any) => {
        if (chatListFetchIdRef.current !== fetchId) { return }
        const { data } = res
        const newChatList: ChatItem[] = generateNewChatListWithOpenStatement(notSyncToStateIntroduction, notSyncToStateInputs)

        data.forEach((item: any) => {
          newChatList.push({
            id: `question-${item.id}`,
            content: item.query,
            isAnswer: false,
            message_files: item.message_files?.filter((file: any) => file.belongs_to === 'user') || [],

          })
          newChatList.push({
            id: item.id,
            content: item.answer,
            agent_thoughts: addFileInfos(item.agent_thoughts ? sortAgentSorts(item.agent_thoughts) : item.agent_thoughts, item.message_files),
            feedback: item.feedback,
            isAnswer: true,
            message_files: item.message_files?.filter((file: any) => file.belongs_to === 'assistant') || [],
          })
        })
        setChatList(newChatList)
        setIsChatListLoading(false)
      }).catch(() => {
        if (chatListFetchIdRef.current !== fetchId) { return }
        setIsChatListLoading(false)
      })
    }
    skipChatListFetchRef.current = false

    if (isNewConversation && isChatStarted) { setChatList(generateNewChatListWithOpenStatement()) }
    if (isNewConversation && isDirectLLM) { setChatList([]) }
  }
  useEffect(handleConversationSwitch, [currConversationId, inited])

  const handleDeleteConversation = async (id: string) => {
    await getConversationService().deleteConversation(id)
    const { data: allConversations } = await fetchConversations()
    if (currConversationId === id) {
      setConversationList(allConversations as any)
      stopReadAloud()
      setCurrConversationId('-1', APP_ID)
      setConversationIdChangeBecauseOfNew(true)
      hideSidebar()
    }
    else {
      setConversationList(allConversations as any)
    }
    notify({ type: 'success', message: t('common.api.success') })
  }

  const handleConversationIdChange = (id: string) => {
    stopReadAloud()
    if (id === '-1') {
      createNewChat()
      setConversationIdChangeBecauseOfNew(true)
    }
    else {
      setConversationIdChangeBecauseOfNew(false)
      setChatList([])
      setIsChatListLoading(true)
    }
    // trigger handleConversationSwitch
    setCurrConversationId(id, APP_ID)
    hideSidebar()
  }

  /*
  * chat info. chat is under conversation.
  */
  const [chatList, setChatList, getChatList] = useGetState<ChatItem[]>([])
  // user can not edit inputs if user had send message
  const canEditInputs = !chatList.some(item => item.isAnswer === false) && isNewConversation
  const createNewChat = () => {
    // if new chat is already exist, do not create new chat
    if (conversationList.some(item => item.id === '-1')) { return }

    setConversationList(produce(conversationList, (draft) => {
      draft.unshift({
        id: '-1',
        name: t('app.chat.newChatDefaultName'),
        inputs: newConversationInputs,
        introduction: conversationIntroduction,
        suggested_questions: suggestedQuestions,
      })
    }))
  }

  // sometime introduction is not applied to state
  const generateNewChatListWithOpenStatement = (introduction?: string, inputs?: Record<string, any> | null) => {
    let calculatedIntroduction = introduction || conversationIntroduction || ''
    const calculatedPromptVariables = inputs || currInputs || null
    if (calculatedIntroduction && calculatedPromptVariables) { calculatedIntroduction = replaceVarWithValues(calculatedIntroduction, promptConfig?.prompt_variables || [], calculatedPromptVariables) }

    const openStatement = {
      id: `${Date.now()}`,
      content: calculatedIntroduction,
      isAnswer: true,
      feedbackDisabled: true,
      isOpeningStatement: isShowPrompt,
      suggestedQuestions,
    }
    if (calculatedIntroduction) { return [openStatement] }

    return []
  }

  // init
  useEffect(() => {
    if (!hasSetAppConfig) {
      setAppUnavailable(true)
      return
    }
    (async () => {
      try {
        const embedHeaders = apiKey ? { 'x-api-key': apiKey } : undefined

        // Inject API key into RemoteStorageProvider for embed mode
        const storageProvider = getStorageProvider()
        if (storageProvider instanceof RemoteStorageProvider && apiKey) {
          storageProvider.setApiKey(apiKey)
        }

        const [conversationData, appParams, agentsRes] = await Promise.all([fetchConversations(), fetchAppParams(embedHeaders), fetch(`${BASE_PATH}/api/config/agents`, { headers: embedHeaders }).then(r => r.json())])

        // Fetch current user info (non-blocking)
        fetch(`${BASE_PATH}/api/auth/me`, { headers: embedHeaders }).then(r => r.ok ? r.json() : null).then(data => setCurrentUser(data?.user || null)).catch(() => {})
        // handle current conversation id
        const { data: conversations, error } = conversationData as { data: ConversationItem[], error: string }
        if (error) {
          Toast.notify({ type: 'error', message: error })
          throw new Error(error)
          return
        }
        const _conversationId = getConversationIdFromStorage(APP_ID)
        const currentConversation = conversations.find(item => item.id === _conversationId)
        const isNotNewConversation = !!currentConversation

        // fetch new conversation info
        const { user_input_form, opening_statement: introduction, file_upload, system_parameters, suggested_questions = [] }: any = appParams
        setLocaleOnClient(APP_INFO.default_language, true)
        setNewConversationInfo({
          name: t('app.chat.newChatDefaultName'),
          introduction,
          suggested_questions,
        })
        if (isNotNewConversation) {
          setExistConversationInfo({
            name: currentConversation.name || t('app.chat.newChatDefaultName'),
            introduction,
            suggested_questions,
          })
        }
        const prompt_variables = userInputsFormToPromptVariables(user_input_form)
        setPromptConfig({
          prompt_template: promptTemplate,
          prompt_variables,
        } as PromptConfig)
        const outerFileUploadEnabled = !!file_upload?.enabled
        setVisionConfig({
          ...file_upload?.image,
          enabled: !!(outerFileUploadEnabled && file_upload?.image?.enabled),
          image_file_size_limit: system_parameters?.system_parameters || 0,
        })
        setFileConfig({
          enabled: outerFileUploadEnabled,
          allowed_file_types: file_upload?.allowed_file_types,
          allowed_file_extensions: file_upload?.allowed_file_extensions,
          allowed_file_upload_methods: file_upload?.allowed_file_upload_methods,
          number_limits: file_upload?.number_limits,
          fileUploadConfig: file_upload?.fileUploadConfig,
        })
        setConversationList(conversations as ConversationItem[])

        // Resolve default agent ID
        const defaultAgent = agentsRes.agents?.find((a: any) => a.is_default) || agentsRes.agents?.[0]
        if (defaultAgent) {
          setDefaultAgentId(defaultAgent.id)
          // Cache default agent's prompt_variables for sync access on first render
          promptVariablesCacheRef.current[defaultAgent.id] = prompt_variables
        }

        // Validate embed agent ID — use it as selected agent if it exists and is enabled
        const activeAgent = embedAgentId
          ? agentsRes.agents?.find((a: any) => a.id === embedAgentId)
          : null
        if (activeAgent) {
          setSelectedAgentId(activeAgent.id)
          setIsDirectLLM(activeAgent.backend_type === 'direct_llm')
        }
        else {
          setIsDirectLLM(defaultAgent?.backend_type === 'direct_llm')
        }

        // Cache backend_type for each agent (used to skip param fetch for direct_llm etc.)
        agentsRes.agents?.forEach((a: any) => { agentTypeMapRef.current[a.id] = a.backend_type })

        if (isNotNewConversation) {
          // Clean up saved params for default agent in this conversation
          if (defaultAgent) {
            syncAndCleanParams(_conversationId, defaultAgent.id, prompt_variables)
          }
          setCurrConversationId(_conversationId, APP_ID, false)
        }

        setInited(true)
      }
      catch (e: any) {
        if (e.status === 404) {
          setAppUnavailable(true)
        }
        else {
          setIsUnknownReason(true)
          setAppUnavailable(true)
        }
      }
    })()
  }, [])

  const prevAgentIdRef = useRef<string | null>(null)

  // Stop auto-read when refreshing page
  useEffect(() => {
    return () => { stopReadAloud() }
  }, [])

  useEffect(() => {
    if (!inited) { return }

    stopReadAloud()

    const prevId = prevAgentIdRef.current
    const prevKey = prevId || defaultAgentId
    const realConvId = currConversationId && currConversationId !== '-1' ? currConversationId : null

    // Save previous agent's params to ref cache
    if (currInputs && prevKey) {
      agentInputsCacheRef.current[prevKey] = { ...currInputs }
    }

    // Clear form immediately to prevent stale params
    setCurrInputs(null)
    setPromptConfig(null)

    const agentKey = selectedAgentId || defaultAgentId
    if (!agentKey) { return }

    const isDirectLLM = agentTypeMapRef.current[agentKey] === 'direct_llm'
    setIsDirectLLM(isDirectLLM)

    if (isDirectLLM) {
      // Direct LLM agents have no prompt_variables; skip fetch
      promptVariablesCacheRef.current[agentKey] = []
      const cleaned = agentInputsCacheRef.current[agentKey] || null
      setCurrInputs(cleaned ? { ...cleaned } : null)
      setPromptConfig({ prompt_template: promptTemplate, prompt_variables: [] } as PromptConfig)

      // Call host for param values
      const agentName = agentTypeMapRef.current[agentKey] || ''
      callHostGetAgentParams(agentKey, agentName, 'direct_llm', []).then((hostParams) => {
        if (hostParams && Object.keys(hostParams).length > 0) {
          setCurrInputs(prev => ({ ...(prev || {}), ...hostParams }))
        }
      })
    }
    else {
      // Always fetch latest prompt_variables from backend, then sync + restore
      fetchAndCachePromptVars(selectedAgentId).then(async () => {
        const vars = promptVariablesCacheRef.current[agentKey] || []
        const cleaned = await syncAndCleanParamsAsync(realConvId, agentKey, vars)
        setCurrInputs(cleaned ? { ...cleaned } : null)
        setPromptConfig({ prompt_template: promptTemplate, prompt_variables: vars } as PromptConfig)

        // Call host for param values
        const agentName = agentTypeMapRef.current[agentKey] || ''
        const paramKeys = vars.map(v => v.key)
        callHostGetAgentParams(agentKey, agentName, agentTypeMapRef.current[agentKey] || '', paramKeys).then((hostParams) => {
          if (hostParams && Object.keys(hostParams).length > 0) {
            setCurrInputs(prev => ({ ...(prev || {}), ...hostParams }))
          }
        })
      })
    }

    prevAgentIdRef.current = selectedAgentId
  }, [selectedAgentId])

  // Sync currInputs to localStorage whenever it changes
  useEffect(() => {
    if (inited && currInputs && Object.keys(currInputs).length > 0) {
      const realConvId = currConversationId && currConversationId !== '-1' ? currConversationId : null
      const agentKey = selectedAgentId || defaultAgentId
      if (!agentKey) { return }
      agentInputsCacheRef.current[agentKey] = { ...currInputs }
    }
  }, [currInputs, inited])

  const [isResponding, { setTrue: setRespondingTrue, setFalse: setRespondingFalse }] = useBoolean(false)
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const { notify } = Toast
  const logError = (message: string) => {
    notify({ type: 'error', message })
  }

  const checkCanSend = () => {
    if (isChatListLoading) {
      notify({ type: 'info', message: t('app.chat.messageListLoading') || '消息列表加载中，请稍后' })
      return false
    }
    if (currConversationId !== '-1') { return true }

    if (!currInputs || !promptConfig?.prompt_variables) { return true }

    const missingRequired = promptConfig.prompt_variables
      .filter(v => v.required)
      .filter((v) => {
        const val = currInputs[v.key]
        return val === undefined || val === null || val === ''
      })

    if (missingRequired.length > 0) {
      logError(t('app.errorMessage.valueOfVarRequired'))
      return false
    }
    return true
  }

  const [controlFocus, setControlFocus] = useState(0)
  const [openingSuggestedQuestions, setOpeningSuggestedQuestions] = useState<string[]>([])
  const [messageTaskId, setMessageTaskId] = useState('')
  const [hasStopResponded, setHasStopResponded, getHasStopResponded] = useGetState(false)
  const [isRespondingConIsCurrCon, setIsRespondingConCurrCon, getIsRespondingConIsCurrCon] = useGetState(true)
  const agentInfoCacheRef = useRef<Record<string, { name: string, icon: string }>>({})

  const fetchAgentInfo = async (agentId: string) => {
    if (agentInfoCacheRef.current[agentId]) { return agentInfoCacheRef.current[agentId] }
    try {
      const headers = apiKey ? { 'x-api-key': apiKey } : undefined
      const res = await fetch(`${BASE_PATH}/api/config/agents`, { headers })
      const data = await res.json()
      const agent = data.agents?.find((a: any) => a.id === agentId)
      if (agent) {
        agentInfoCacheRef.current[agentId] = { name: agent.name, icon: agent.icon }
        return agentInfoCacheRef.current[agentId]
      }
    } catch { /* ignore */ }
    return null
  }

  const handleStopResponding = async () => {
    if (!messageTaskId) {
      if (abortController) {
        abortController.abort()
      }
      setRespondingFalse()
      return
    }
    setHasStopResponded(true)
    try {
      const agentKey = selectedAgentId || defaultAgentId
      await stopChatMessage(messageTaskId, agentKey || undefined, apiKey || undefined)
    } catch (e) {
      console.error('Failed to stop responding:', e)
    }
    if (abortController) {
      abortController.abort()
    }
    setChatList(produce(getChatList(), (draft) => {
      const lastItem = draft[draft.length - 1]
      if (lastItem?.isAnswer && lastItem.workflowProcess && lastItem.workflowProcess.status === WorkflowRunningStatus.Running) {
        lastItem.workflowProcess.status = WorkflowRunningStatus.Stopped
      }
    }))
    setRespondingFalse()
  }
  const [userQuery, setUserQuery] = useState('')

  const updateCurrentQA = ({
    responseItem,
    questionId,
    placeholderAnswerId,
    questionItem,
  }: {
    responseItem: ChatItem
    questionId: string
    placeholderAnswerId: string
    questionItem: ChatItem
  }) => {
    // closesure new list is outdated.
    const newListWithAnswer = produce(
      getChatList().filter(item => item.id !== responseItem.id && item.id !== placeholderAnswerId),
      (draft) => {
        if (!draft.find(item => item.id === questionId)) { draft.push({ ...questionItem }) }

        draft.push({ ...responseItem })
      },
    )
    setChatList(newListWithAnswer)
  }

  const transformToServerFile = (fileItem: any) => {
    return {
      type: 'image',
      transfer_method: fileItem.transferMethod,
      url: fileItem.url,
      upload_file_id: fileItem.id,
    }
  }

  const handleSend = async (message: string, files?: VisionFile[], agentId?: string | null) => {
    stopReadAloud()

    if (isResponding) {
      notify({ type: 'info', message: t('app.errorMessage.waitForResponse') })
      return
    }

    const curAgentId = agentId || selectedAgentId
    const agentKey = curAgentId || defaultAgentId
    const realConvId = currConversationId !== '-1' ? currConversationId : null

    // Guard: promptConfig not ready (null = still loading from backend)
    if (!promptConfig) {
      notify({ type: 'info', message: '智能体参数加载中，请稍后重试' })
      return
    }

    // Load agent-specific params: cache → empty
    let resolvedInputs: Record<string, any> = agentInputsCacheRef.current[agentKey] || {}

    // Call host for param values (override with host values, keep user values for unreturned keys)
    const hostBackendType = agentTypeMapRef.current[agentKey] || ''
    const hostParamKeys = promptConfig.prompt_variables.map(v => v.key)
    const hostParams = await callHostGetAgentParams(agentKey, '', hostBackendType, hostParamKeys)
    if (hostParams && Object.keys(hostParams).length > 0) {
      resolvedInputs = { ...resolvedInputs }
      for (const key of Object.keys(hostParams)) {
        if (hostParams[key] !== undefined && hostParams[key] !== null) {
          resolvedInputs[key] = hostParams[key]
        }
      }
    }

    // Validate required prompt variables (skip if agent has no params)
    if (promptConfig.prompt_variables.length) {
      const missing = promptConfig.prompt_variables
        .filter(v => v.required && (!resolvedInputs[v.key] && resolvedInputs[v.key] !== 0))
        .map(v => v.name || v.key)
      if (missing.length) {
        notify({ type: 'error', message: `请填写必填参数：${missing.join('、')}` })
        return
      }
    }

    const toServerInputs: Record<string, any> = {}
    Object.keys(resolvedInputs).forEach((key) => {
      const value = resolvedInputs[key]
      if (value?.supportFileType) { toServerInputs[key] = transformToServerFile(value) }
      else if (value?.[0]?.supportFileType) { toServerInputs[key] = value.map((item: any) => transformToServerFile(item)) }
      else { toServerInputs[key] = value }
    })

    // Save to agent-specific storage for next send
    if (Object.keys(toServerInputs).length > 0) {
      agentInputsCacheRef.current[agentKey] = { ...toServerInputs }
      if (realConvId) { saveAgentParams(realConvId, agentKey, toServerInputs).catch(console.error) }
    }

    // question
    const questionId = `question-${Date.now()}`
    let agentInfo: { name: string, icon: string } | null = null
    agentInfo = await fetchAgentInfo(agentKey)
    const questionItem = {
      id: questionId,
      content: message,
      isAnswer: false,
      message_files: (files || []).filter((f: any) => f.type === 'image'),
      agent_id: agentKey,
      agent_name: agentInfo?.name || null,
    }

    const placeholderAnswerId = `answer-placeholder-${Date.now()}`
    const placeholderAnswerItem = {
      id: placeholderAnswerId,
      content: '',
      isAnswer: true,
    }

    const newList = [...getChatList(), questionItem, placeholderAnswerItem]
    setChatList(newList)

    // Create local conversation + save user message BEFORE sending
    let localConvId = currConversationId !== '-1' ? currConversationId : null
    if (!localConvId) {
      const conv = await createLocalConversation(t('app.chat.newChatDefaultName'))
      localConvId = conv.id
    }
    await saveUserMessage({
      conversation_id: localConvId,
      content: message,
      agent_id: agentKey,
      agent_name: agentInfo?.name || null,
      message_files: (files || []).filter((f: any) => f.type === 'image'),
    })

    // 新会话首条消息：立即异步设置标题，不等 AI 回复
    if (getConversationIdChangeBecauseOfNew()) {
      const title = message.slice(0, 30) + (message.length > 30 ? '...' : '')
      updateLocalConversationName(localConvId, title)
    }

    // Look up Dify conversation_id for this agent (async)
    const difyConvId = await getBackendConvId(localConvId, agentKey)

    // 重置保存标志
    hasSavedBackendConvIdRef.current[`${localConvId}:${agentKey}`] = false

    const sendData: Record<string, any> = {
      inputs: toServerInputs,
      query: message,
      conversation_id: difyConvId || null,
      agent_id: agentKey,
      apiKey: apiKey || undefined,
      messages: chatList
        .filter(item => !item.isOpeningStatement && item.content)
        .map(item => ({ role: item.isAnswer ? 'assistant' as const : 'user' as const, content: item.content })),
    }

    if (files && files?.length > 0) {
      sendData.files = files.map((item) => {
        if (item.transfer_method === TransferMethod.local_file) {
          return { ...item, url: '' }
        }
        return item
      })
    }

    let isAgentMode = false

    // answer
    const responseItem: ChatItem = {
      id: `${Date.now()}`,
      content: '',
      agent_thoughts: [],
      message_files: [],
      isAnswer: true,
      agent_id: agentKey,
      agent_name: agentInfo?.name || null,
    }
    let hasSetResponseId = false

    const prevTempNewConversationId = getCurrConversationId() || '-1'
    let tempNewConversationId = ''

    setRespondingTrue()
    setHasStopResponded(false)
    sendChatMessage(sendData, {
      getAbortController: (abortController) => {
        setAbortController(abortController)
      },
      onData: (message: string, isFirstMessage: boolean, { conversationId: newDifyConvId, messageId, taskId }: any) => {
        // 只有 Dify 类型智能体才会在 chunk 中返回 conversation_id
        const convKey = `${localConvId}:${agentKey}`
        const isDifyAgent = agentTypeMapRef.current[agentKey] === 'dify'

        if (isDifyAgent && newDifyConvId && !hasSavedBackendConvIdRef.current[convKey]) {
          hasSavedBackendConvIdRef.current[convKey] = true
          saveBackendConvId(localConvId, agentKey, newDifyConvId)
        }
        if (!isAgentMode) {
          responseItem.content = responseItem.content + message
        }
        else {
          const lastThought = responseItem.agent_thoughts?.[responseItem.agent_thoughts?.length - 1]
          if (lastThought) { lastThought.thought = lastThought.thought + message }
        }
        if (messageId && !hasSetResponseId) {
          responseItem.id = messageId
          hasSetResponseId = true
        }

        if (isFirstMessage && newDifyConvId) { tempNewConversationId = newDifyConvId }

        setMessageTaskId(taskId)
        // has switched to other conversation
        if (prevTempNewConversationId !== getCurrConversationId()) {
          setIsRespondingConCurrCon(false)
          return
        }
        updateCurrentQA({
          responseItem,
          questionId,
          placeholderAnswerId,
          questionItem,
        })
      },
      async onCompleted(hasError?: boolean, errorMessage?: string) {
        if (hasError) {
          const errorContent = `⚠ ${errorMessage || 'Request failed'}`
          responseItem.content = errorContent
          setChatList(produce(getChatList(), (draft) => {
            const idx = draft.findIndex(item => item.id === placeholderAnswerId)
            if (idx !== -1) { draft[idx] = { ...draft[idx], content: errorContent } }
          }))
          if (localConvId) {
            await saveAssistantMessage({
              conversation_id: localConvId,
              content: errorContent,
              agent_id: agentKey,
              agent_name: agentInfo?.name || null,
              message_files: [],
              agent_thoughts: [],
            })
          }
          setRespondingFalse()
          return
        }

        // Save assistant message
        if (responseItem.content) {
          const commands = extractCommands(responseItem.content)
          const cleanContent = stripCommands(responseItem.content)

          if (isEmbed && commands.length > 0) {
            window.parent.postMessage({
              type: 'com.openchat.embed',
              action: 'command',
              commands,
            }, '*')
          }

          await saveAssistantMessage({
            conversation_id: localConvId,
            content: cleanContent,
            agent_id: agentKey,
            agent_name: agentInfo?.name || null,
            message_files: responseItem.message_files || [],
            agent_thoughts: responseItem.agent_thoughts || [],
          })
        }

        if (getConversationIdChangeBecauseOfNew()) {
          // Refresh sidebar
          const { data: allConversations } = await fetchConversations()
          setConversationList(allConversations as any)
        }
        setConversationIdChangeBecauseOfNew(false)
        // Preserve current inputs before resetting
        if (currInputs && Object.keys(currInputs).length > 0) {
          const aKey = selectedAgentId || defaultAgentId
          agentInputsCacheRef.current[aKey] = { ...currInputs }
          if (localConvId && localConvId !== '-1') {
            saveAgentParams(localConvId, aKey, currInputs).catch(console.error)
          }
        }
        resetNewConversationInputs()
        setChatNotStarted()
        if (localConvId) {
          skipChatListFetchRef.current = true
          setCurrConversationId(localConvId, APP_ID, true)
        }
        setRespondingFalse()
      },
      onFile(file) {
        const lastThought = responseItem.agent_thoughts?.[responseItem.agent_thoughts?.length - 1]
        if (lastThought) { lastThought.message_files = [...(lastThought as any).message_files, { ...file }] }

        updateCurrentQA({
          responseItem,
          questionId,
          placeholderAnswerId,
          questionItem,
        })
      },
      onThought(thought) {
        isAgentMode = true
        const response = responseItem as any
        if (thought.message_id && !hasSetResponseId) {
          response.id = thought.message_id
          hasSetResponseId = true
        }
        // responseItem.id = thought.message_id;
        if (response.agent_thoughts.length === 0) {
          response.agent_thoughts.push(thought)
        }
        else {
          const lastThought = response.agent_thoughts[response.agent_thoughts.length - 1]
          // thought changed but still the same thought, so update.
          if (lastThought.id === thought.id) {
            thought.thought = lastThought.thought
            thought.message_files = lastThought.message_files
            responseItem.agent_thoughts![response.agent_thoughts.length - 1] = thought
          }
          else {
            responseItem.agent_thoughts!.push(thought)
          }
        }
        // has switched to other conversation
        if (prevTempNewConversationId !== getCurrConversationId()) {
          setIsRespondingConCurrCon(false)
          return false
        }

        updateCurrentQA({
          responseItem,
          questionId,
          placeholderAnswerId,
          questionItem,
        })
      },
      onMessageEnd: (messageEnd) => {
        if (messageEnd.metadata?.annotation_reply) {
          responseItem.id = messageEnd.id
          responseItem.annotation = ({
            id: messageEnd.metadata.annotation_reply.id,
            authorName: messageEnd.metadata.annotation_reply.account.name,
          } as AnnotationType)
          const newListWithAnswer = produce(
            getChatList().filter(item => item.id !== responseItem.id && item.id !== placeholderAnswerId),
            (draft) => {
              if (!draft.find(item => item.id === questionId)) { draft.push({ ...questionItem }) }

              draft.push({
                ...responseItem,
              })
            },
          )
          setChatList(newListWithAnswer)
          return
        }
        // not support show citation
        // responseItem.citation = messageEnd.retriever_resources
        const newListWithAnswer = produce(
          getChatList().filter(item => item.id !== responseItem.id && item.id !== placeholderAnswerId),
          (draft) => {
            if (!draft.find(item => item.id === questionId)) { draft.push({ ...questionItem }) }

            draft.push({ ...responseItem })
          },
        )
        setChatList(newListWithAnswer)
      },
      onMessageReplace: (messageReplace) => {
        setChatList(produce(
          getChatList(),
          (draft) => {
            const current = draft.find(item => item.id === messageReplace.id)

            if (current) { current.content = messageReplace.answer }
          },
        ))
      },
      onError() {
        setRespondingFalse()
      },
      onWorkflowStarted: ({ workflow_run_id, task_id }) => {
        // taskIdRef.current = task_id
        responseItem.workflow_run_id = workflow_run_id
        responseItem.workflowProcess = {
          status: WorkflowRunningStatus.Running,
          tracing: [],
        }
        setChatList(produce(getChatList(), (draft) => {
          const currentIndex = draft.findIndex(item => item.id === responseItem.id)
          draft[currentIndex] = {
            ...draft[currentIndex],
            ...responseItem,
          }
        }))
      },
      onWorkflowFinished: ({ data }) => {
        responseItem.workflowProcess!.status = data.status as WorkflowRunningStatus
        setChatList(produce(getChatList(), (draft) => {
          const currentIndex = draft.findIndex(item => item.id === responseItem.id)
          draft[currentIndex] = {
            ...draft[currentIndex],
            ...responseItem,
          }
        }))
      },
      onNodeStarted: ({ data }) => {
        responseItem.workflowProcess!.tracing!.push(data as any)
        setChatList(produce(getChatList(), (draft) => {
          const currentIndex = draft.findIndex(item => item.id === responseItem.id)
          draft[currentIndex] = {
            ...draft[currentIndex],
            ...responseItem,
          }
        }))
      },
      onNodeFinished: ({ data }) => {
        const currentIndex = responseItem.workflowProcess!.tracing!.findIndex(item => item.node_id === data.node_id)
        responseItem.workflowProcess!.tracing[currentIndex] = data as any
        setChatList(produce(getChatList(), (draft) => {
          const currentIndex = draft.findIndex(item => item.id === responseItem.id)
          draft[currentIndex] = {
            ...draft[currentIndex],
            ...responseItem,
          }
        }))
      },
    })
  }

  const handleFeedback = async (messageId: string, feedback: Feedbacktype) => {
    try {
      const storage = getStorageProvider()
      await storage.updateMessageFeedback(messageId, JSON.stringify({ rating: feedback.rating }))
    }
    catch { /* ignore */ }
    const newChatList = chatList.map((item) => {
      if (item.id === messageId) {
        return {
          ...item,
          feedback,
        }
      }
      return item
    })
    setChatList(newChatList)
    notify({ type: 'success', message: t('common.api.success') })
  }

  const handleRegenerate = async (id: string) => {
    if (isResponding) {
      notify({ type: 'info', message: t('app.errorMessage.waitForResponse') })
      return
    }

    stopReadAloud()

    // Find the answer item by id
    const answerIndex = chatList.findIndex(item => item.id === id && item.isAnswer)
    if (answerIndex === -1) { return }

    // Find the question item that comes before this answer
    let questionIndex = answerIndex - 1
    while (questionIndex >= 0 && chatList[questionIndex].isAnswer) {
      questionIndex--
    }
    if (questionIndex < 0) { return }

    const questionItem = chatList[questionIndex]
    if (questionItem.isAnswer) { return }

    // Remove the answer and question from chat list
    const newChatList = [...chatList.slice(0, questionIndex)]
    setChatList(newChatList)

    // Resend the question
    const files = questionItem.message_files?.map(file => ({
      type: file.type,
      transfer_method: file.transfer_method,
      url: file.url,
      upload_file_id: file.upload_file_id,
    })) as VisionFile[] || []

    await handleSend(questionItem.content, files, questionItem.agent_id || selectedAgentId)
  }

  const handleDeleteMessage = (answerId: string) => {
    setDeleteConfirmTarget(answerId)
  }

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmTarget) { return }
    const answerId = deleteConfirmTarget
    setDeleteConfirmTarget(null)

    stopReadAloud()

    const list = getChatList()
    const aIndex = list.findIndex(item => item.id === answerId && item.isAnswer)
    if (aIndex < 0) { return }

    let qIndex = aIndex - 1
    while (qIndex >= 0 && list[qIndex].isAnswer) {
      qIndex--
    }
    const qItem = qIndex >= 0 ? list[qIndex] : null

    const newList = list.filter((_, i) => i !== aIndex && (qItem ? i !== qIndex : true))
    setChatList(newList)

    try {
      const idsToDelete = [answerId]
      if (qItem) { idsToDelete.push(qItem.id) }
      await getMessageService().deleteMessagesByIds(idsToDelete)
      notify({ type: 'success', message: '消息已删除' })
    } catch {
      notify({ type: 'error', message: '删除失败' })
    }
  }

  const renderSidebar = () => {
    if (!APP_ID || !APP_INFO) { return null }
    return (
      <Sidebar
        list={conversationList}
        onCurrentIdChange={handleConversationIdChange}
        onDelete={handleDeleteConversation}
        currentId={currConversationId}
        copyRight={APP_INFO.copyright || APP_INFO.title}
        isMobile={isMobile}
        title={APP_INFO.title}
        user={currentUser}
        isEmbed={isEmbed}
      />
    )
  }

  if (appUnavailable) { return <AppUnavailable isUnknownReason={isUnknownReason} errMessage={!hasSetAppConfig ? 'Please set APP_ID and API_KEY in config/index.tsx' : ''} /> }

  if (!APP_ID || !APP_INFO) { return <Loading type='app' /> }

  return (
    <div className='bg-surface'>
      {!isEmbed && (
        <Header
          isMobile={isMobile}
          onShowSideBar={showSidebar}
          onCreateNewChat={() => handleConversationIdChange('-1')}
        />
      )}
      <div className="flex bg-surface overflow-hidden">
        {/* sidebar */}
        {!isMobile && !isEmbed && renderSidebar()}
        {!isMobile && isEmbed && isShowSidebar && (
          <div className='fixed inset-0 z-50' style={{ backgroundColor: 'rgba(35, 56, 118, 0.2)' }} onClick={hideSidebar}>
            <div className='inline-block h-full' onClick={e => e.stopPropagation()}>
              {renderSidebar()}
            </div>
          </div>
        )}
        {isMobile && isShowSidebar && (
          <div className='fixed inset-0 z-50' style={{ backgroundColor: 'rgba(35, 56, 118, 0.2)' }} onClick={hideSidebar} >
            <div className='inline-block' onClick={e => e.stopPropagation()}>
              {renderSidebar()}
            </div>
          </div>
        )}
        {/* main */}
        <div className='flex-grow flex flex-col overflow-hidden h-screen'>
          {inited && (
            <ConfigSence
              conversationName={conversationName}
              hasSetInputs={hasSetInputs}
              isPublicVersion={isShowPrompt && agentTypeMapRef.current[selectedAgentId || defaultAgentId] !== 'direct_llm'}
              siteInfo={APP_INFO}
              promptConfig={promptConfig}
              onStartChat={handleStartChat}
              canEditInputs={canEditInputs}
              savedInputs={(currInputs as Record<string, any>) ?? agentInputsCacheRef.current[selectedAgentId || defaultAgentId]}
              onInputsChange={setCurrInputs}
              isDirectLLM={isDirectLLM}
            ></ConfigSence>
          )}

          {
            hasSetInputs && (
              <Chat
                chatList={chatList}
                onSend={handleSend}
                onFeedback={handleFeedback}
                onRegenerate={handleRegenerate}
                onDeleteMessage={handleDeleteMessage}
                isResponding={isResponding}
                isChatListLoading={isChatListLoading}
                onStopResponding={handleStopResponding}
                checkCanSend={checkCanSend}
                visionConfig={visionConfig}
                fileConfig={fileConfig}
                selectedAgentId={selectedAgentId}
                onAgentChange={setSelectedAgentId}
                apiKey={apiKey}
              />)
          }
        </div>
      </div>
      <ConfirmDialog
        open={deleteConfirmTarget !== null}
        onClose={() => setDeleteConfirmTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="确认删除"
        message="确定要删除这条消息吗？删除后无法恢复。"
        variant="danger"
      />
    </div>
  )
}

export default React.memo(Main)
