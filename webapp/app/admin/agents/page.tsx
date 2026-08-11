'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { BASE_PATH } from '@/config'
import type { AgentType, AgentExtraConfig, DatasourceConfig, BusinessKnowledgeItem, QueryExample } from '@/types/agent'
import { generateDynamicPrompt } from '@/lib/prompts/dynamic-prompt'

interface Agent {
  id: string
  name: string
  icon: string
  description: string
  backend_type: string
  api_key: string
  api_url: string
  model: string | null
  model_id: string | null
  extra_config: string
  execution_mode: string
  tools_config: string
  mcp_servers: string
  is_default: boolean
  is_enabled: boolean
  agent_type: AgentType
  agent_config: string
  created_at: number
  updated_at: number
}

interface ModelProvider {
  id: string
  name: string
  provider_type: string
  is_enabled: boolean
}

interface ModelItem {
  id: string
  provider_id: string
  model_name: string
  display_name: string
  is_enabled: boolean
}

const backendTypes = ['dify', 'direct_llm', 'fastgpt', 'n8n'] as const

type TabKey = 'basic' | 'model' | 'datasource' | 'knowledge' | 'prompt' | 'other'

export default function AgentsPage() {
  const { t } = useTranslation()
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('basic')
  const [isCreating, setIsCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [providers, setProviders] = useState<ModelProvider[]>([])
  const [allModels, setAllModels] = useState<ModelItem[]>([])
  const [agentTypesList, setAgentTypesList] = useState<any[]>([])
  const [systemPromptsList, setSystemPromptsList] = useState<any[]>([])

  const [form, setForm] = useState({
    name: '',
    icon: '🤖',
    description: '',
    backend_type: 'dify',
    api_key: '',
    api_url: '',
    model_id: '',
    extra_config: '{}',
    execution_mode: 'chat',
    is_default: false,
    is_enabled: true,
    agent_type: 'general' as AgentType,
    agent_config: '{}' as string,
  })

  const loadAgents = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_PATH}/api/admin/agents`)
      const data = await res.json()
      setAgents(data.agents || [])
    }
    catch (e) {
      console.error('[AgentsPage] Failed to load agents:', e)
    }
    finally {
      setLoading(false)
    }
  }, [])

  const loadModelData = useCallback(async () => {
    try {
      const [providersRes, modelsRes] = await Promise.all([
        fetch(`${BASE_PATH}/api/admin/model-providers`),
        fetch(`${BASE_PATH}/api/admin/models`),
      ])
      const providersData = await providersRes.json()
      const modelsData = await modelsRes.json()
      setProviders((providersData.providers || []).filter((p: ModelProvider) => p.is_enabled))
      setAllModels((modelsData.models || []).filter((m: ModelItem) => m.is_enabled))
    }
    catch (e) {
      console.error('[AgentsPage] Failed to load model data:', e)
    }
  }, [])

  const loadAgentTypesAndPrompts = useCallback(async () => {
    try {
      const [typesRes, promptsRes] = await Promise.all([
        fetch(`${BASE_PATH}/api/admin/agent-types`),
        fetch(`${BASE_PATH}/api/admin/system-prompts`),
      ])
      const typesData = await typesRes.json()
      const promptsData = await promptsRes.json()
      setAgentTypesList(typesData.agent_types || [])
      setSystemPromptsList(promptsData.system_prompts || [])
    }
    catch (e) {
      console.error('[AgentsPage] Failed to load agent types and prompts:', e)
    }
  }, [])

  useEffect(() => { loadAgents(); loadAgentTypesAndPrompts() }, [loadAgents, loadAgentTypesAndPrompts])

  const selectAgent = async (agent: Agent) => {
    setSelectedAgent(agent)
    setIsCreating(false)
    setActiveTab('basic')
    setForm({
      name: agent.name,
      icon: agent.icon,
      description: agent.description,
      backend_type: agent.backend_type,
      api_key: agent.api_key,
      api_url: agent.api_url,
      model_id: agent.model_id || '',
      extra_config: agent.extra_config || '{}',
      execution_mode: agent.execution_mode || 'chat',
      is_default: agent.is_default,
      is_enabled: agent.is_enabled,
      agent_type: agent.agent_type || 'general',
      agent_config: agent.agent_config || '{}',
    })
    setError('')
    await loadModelData()
  }

  const startCreate = async () => {
    setSelectedAgent(null)
    setIsCreating(true)
    setActiveTab('basic')
    setForm({
      name: '',
      icon: '🤖',
      description: '',
      backend_type: 'dify',
      api_key: '',
      api_url: '',
      model_id: '',
      extra_config: '{}',
      execution_mode: 'chat',
      is_default: false,
      is_enabled: true,
      agent_type: 'general',
      agent_config: '{}',
    })
    setError('')
    await loadModelData()
  }

  const getErrorMessage = (data: any): string => {
    const errorCodeMap: Record<string, string> = {
      NAME_REQUIRED: t('common.auth.nameRequired'),
      AGENT_NAME_EXISTS: t('common.auth.agentNameExists'),
      MODEL_NOT_FOUND: t('common.auth.modelNotFound'),
      MODEL_DISABLED: t('common.auth.modelDisabled'),
      AGENT_ID_REQUIRED: t('common.auth.agentIdRequired'),
      AGENT_NOT_FOUND: t('common.auth.agentNotFound'),
      CANNOT_DELETE_DEFAULT: t('common.auth.cannotDeleteDefault'),
    }
    return errorCodeMap[data.code] || data.error || t('common.auth.createFailed')
  }

  const handleSave = async () => {
    setError('')
    setSaving(true)

    let extraConfig: Record<string, any> = {}
    try {
      if (form.extra_config.trim()) {
        extraConfig = JSON.parse(form.extra_config)
      }
    }
    catch {
      setError(t('common.auth.invalidJson'))
      setSaving(false)
      return
    }

    let agentConfig: AgentExtraConfig = {}
    try {
      if (form.agent_config.trim()) {
        agentConfig = JSON.parse(form.agent_config)
      }
    }
    catch {
      setError(t('common.auth.invalidAgentConfig'))
      setSaving(false)
      return
    }

    try {
      const payload = {
        ...form,
        model_id: form.model_id || null,
        extra_config: extraConfig,
        agent_config: agentConfig,
      }

      if (isCreating) {
        const res = await fetch(`${BASE_PATH}/api/admin/agents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(getErrorMessage(data))
          return
        }
        setIsCreating(false)
        setSelectedAgent(data.agent)
      }
      else {
        const res = await fetch(`${BASE_PATH}/api/admin/agents`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: selectedAgent!.id, ...payload }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(getErrorMessage(data))
          return
        }
        setSelectedAgent(data.agent)
      }
      loadAgents()
    }
    catch {
      setError(t('common.auth.networkError'))
    }
    finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    // eslint-disable-next-line no-alert
    if (!confirm(t('common.auth.deleteAgentConfirm'))) {
      return
    }

    try {
      await fetch(`${BASE_PATH}/api/admin/agents`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (selectedAgent?.id === id) {
        setSelectedAgent(null)
        setIsCreating(false)
      }
      loadAgents()
    }
    catch {
      // ignore
    }
  }

  const handleToggle = async (agent: Agent) => {
    try {
      await fetch(`${BASE_PATH}/api/admin/agents`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: agent.id, is_enabled: !agent.is_enabled }),
      })
      loadAgents()
    }
    catch {
      // ignore
    }
  }

  const getAgentConfigParsed = (): AgentExtraConfig => {
    try {
      return form.agent_config ? JSON.parse(form.agent_config) : {}
    }
    catch {
      return {}
    }
  }

  // Check if the update affects dynamic prompt
  const shouldUpdateDynamicPrompt = (updates: Partial<AgentExtraConfig>): boolean => {
    return !!(
      updates.datasources
      || updates.business_knowledge
      || updates.query_examples
      || 'datasources' in updates
      || 'business_knowledge' in updates
      || 'query_examples' in updates
    )
  }

  const updateAgentConfig = (updates: Partial<AgentExtraConfig>) => {
    const current = getAgentConfigParsed()
    const updated = { ...current, ...updates }

    // Auto-update dynamic prompt if relevant fields changed
    if (shouldUpdateDynamicPrompt(updates)) {
      updated.dynamic_prompt = generateDynamicPrompt(updated)
      updated.dynamic_prompt_updated_at = Math.floor(Date.now() / 1000)
    }

    setForm({ ...form, agent_config: JSON.stringify(updated) })
  }

  const regenerateDynamicPrompt = () => {
    const current = getAgentConfigParsed()
    const updated = {
      ...current,
      dynamic_prompt: generateDynamicPrompt(current),
      dynamic_prompt_updated_at: Math.floor(Date.now() / 1000),
    }
    setForm({ ...form, agent_config: JSON.stringify(updated) })
  }

  const getVisibleTabs = (): { key: TabKey, label: string }[] => {
    const tabs: { key: TabKey, label: string }[] = [
      { key: 'basic', label: t('common.auth.basicConfig') },
    ]

    if (form.backend_type === 'direct_llm') {
      tabs.push({ key: 'model', label: t('common.auth.modelParams') })
    }

    if (form.agent_type === 'data_query') {
      tabs.push({ key: 'datasource', label: t('common.auth.datasource') })
      tabs.push({ key: 'knowledge', label: t('common.auth.businessKnowledge') })
    }

    if (form.backend_type === 'direct_llm') {
      tabs.push({ key: 'prompt', label: t('common.auth.systemPrompt') })
    }

    tabs.push({ key: 'other', label: t('common.auth.otherConfig') })

    return tabs
  }

  // 获取当前智能体类型的约束（API 返回的数据已经通过 dbToAgentType 解析，约束字段已是数组）
  const getCurrentAgentTypeConstraints = () => {
    const currentType = agentTypesList.find(t => t.id === form.agent_type)
    if (!currentType) { return { backend: null, execution: null } }
    return {
      backend: currentType.backend_type_constraint || null,
      execution: currentType.execution_mode_constraint || null,
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full text-content-secondary">Loading...</div>
  }

  return (
    <div className="flex h-[calc(100vh-120px)] gap-4">
      {/* 左侧：智能体列表 */}
      <div className="w-64 flex-shrink-0 flex flex-col bg-surface-elevated rounded-lg border border-border overflow-hidden">
        <div className="p-3 border-b border-border">
          <button
            onClick={startCreate}
            className="w-full px-3 py-2 text-sm bg-accent text-white rounded-md hover:opacity-90"
          >
            + {t('common.auth.addAgent')}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {agents.map(agent => (
            <div
              key={agent.id}
              onClick={() => selectAgent(agent)}
              className={`p-3 rounded-lg cursor-pointer transition-colors ${
                selectedAgent?.id === agent.id
                  ? 'bg-accent/10 border border-accent'
                  : 'bg-surface hover:bg-surface-hover border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{agent.icon}</span>
                <span className="font-medium text-content text-sm truncate">{agent.name}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-content-secondary">
                <span className="px-1.5 py-0.5 bg-surface-tertiary rounded">
                  {(agentTypesList.find(t => t.id === agent.agent_type)?.name) || t('common.auth.agentTypeGeneral')}
                </span>
                <span>{agent.backend_type}</span>
                {!agent.is_enabled && (
                  <span className="text-content-tertiary">{t('common.auth.disabled')}</span>
                )}
              </div>
            </div>
          ))}
          {agents.length === 0 && (
            <div className="text-center text-content-secondary text-sm py-8">
              {t('common.auth.noAgents')}
            </div>
          )}
        </div>
      </div>

      {/* 中间和右侧：配置区域 */}
      {(selectedAgent || isCreating)
        ? (
          <div className="flex-1 flex flex-col bg-surface-elevated rounded-lg border border-border overflow-hidden">
            {/* Tab 导航 */}
            <div className="flex items-center border-b border-border px-4">
              {getVisibleTabs().map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.key
                      ? 'border-accent text-accent'
                      : 'border-transparent text-content-secondary hover:text-content'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
              <div className="flex-1" />
              {!isCreating && selectedAgent && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggle(selectedAgent)}
                    className="text-xs text-content-secondary hover:text-content px-2 py-1 rounded hover:bg-surface-hover"
                  >
                    {selectedAgent.is_enabled ? t('common.auth.disable') : t('common.auth.enable')}
                  </button>
                  {!selectedAgent.is_default && (
                    <button
                      onClick={() => handleDelete(selectedAgent.id)}
                      className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
                    >
                      {t('common.auth.delete')}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Tab 内容 */}
            <div className="flex-1 overflow-y-auto p-6">
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                  {error}
                </div>
              )}

              {/* 基本配置 */}
              {activeTab === 'basic' && (
                <div className="space-y-4 max-w-2xl">
                  <div>
                    <label className="block text-sm font-medium text-content mb-1">
                      {t('common.auth.agentType')}
                      {!isCreating && <span className="ml-2 text-xs text-content-tertiary">({t('common.auth.cannotChange', '创建后不可修改')})</span>}
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {agentTypesList.map(type => (
                        <div
                          key={type.id}
                          onClick={() => {
                            if (!isCreating) { return }
                            const updates: Partial<typeof form> = { agent_type: type.id }
                            if (type.backend_type_constraint?.length === 1) {
                              updates.backend_type = type.backend_type_constraint[0]
                            }
                            if (type.execution_mode_constraint?.length === 1) {
                              updates.execution_mode = type.execution_mode_constraint[0]
                            }
                            setForm({ ...form, ...updates })
                          }}
                          className={`p-3 rounded-lg border transition-colors ${
                            form.agent_type === type.id
                              ? 'border-accent bg-accent/5'
                              : 'border-border'
                          } ${isCreating ? 'cursor-pointer hover:border-content-secondary' : 'opacity-60 cursor-not-allowed'}`}
                        >
                          <div className="font-medium text-content text-sm">
                            <span className="mr-2">{type.icon}</span>
                            {type.name}
                          </div>
                          <div className="text-xs text-content-secondary mt-1">{type.description}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-content mb-1">{t('common.auth.name')}</label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={e => setForm({ ...form, name: e.target.value })}
                        className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content text-sm"
                        required
                      />
                    </div>
                    <div className="w-20">
                      <label className="block text-sm font-medium text-content mb-1">{t('common.auth.icon')}</label>
                      <input
                        type="text"
                        value={form.icon}
                        onChange={e => setForm({ ...form, icon: e.target.value })}
                        className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content text-sm text-center"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-content mb-1">{t('common.auth.description')}</label>
                    <input
                      type="text"
                      value={form.description}
                      onChange={e => setForm({ ...form, description: e.target.value })}
                      className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-content mb-1">{t('common.auth.backendType')}</label>
                    <select
                      value={form.backend_type}
                      onChange={e => setForm({ ...form, backend_type: e.target.value, model_id: '' })}
                      className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content text-sm"
                      disabled={getCurrentAgentTypeConstraints().backend?.length === 1}
                    >
                      {(getCurrentAgentTypeConstraints().backend || [...backendTypes]).map(bt => (
                        <option key={bt} value={bt}>
                          {t(`common.auth.backend${bt === 'dify' ? 'Dify' : bt === 'direct_llm' ? 'DirectLlm' : bt === 'fastgpt' ? 'Fastgpt' : 'N8n'}`)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {form.backend_type === 'direct_llm' && (
                    <div>
                      <label className="block text-sm font-medium text-content mb-1">{t('common.auth.executionMode', '执行模式')}</label>
                      <select
                        value={form.execution_mode}
                        onChange={e => setForm({ ...form, execution_mode: e.target.value })}
                        className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content text-sm"
                        disabled={getCurrentAgentTypeConstraints().execution?.length === 1}
                      >
                        {(getCurrentAgentTypeConstraints().execution || ['chat', 'react', 'plan_and_execute']).map(mode => (
                          <option key={mode} value={mode}>
                            {mode === 'chat' ? t('common.auth.executionChat', '纯对话模式') : mode === 'react' ? t('common.auth.executionReact', 'ReAct 模式') : t('common.auth.executionPlanAndExecute', 'Plan-And-Execute 模式')}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-content-secondary mt-1">
                        {form.execution_mode === 'chat' && t('common.auth.executionChatDesc', '直接与LLM对话，不使用工具')}
                        {form.execution_mode === 'react' && t('common.auth.executionReactDesc', '支持工具调用，Agent会思考→调用工具→继续推理')}
                        {form.execution_mode === 'plan_and_execute' && t('common.auth.executionPlanDesc', '先规划任务步骤，再逐步执行，适合复杂任务')}
                      </p>
                    </div>
                  )}

                  {form.backend_type === 'direct_llm'
                    && (form.execution_mode === 'react' || form.execution_mode === 'plan_and_execute') && (
                    <div className="p-3 bg-surface border border-border rounded-lg">
                      <label className="flex items-center gap-2 text-sm text-content cursor-pointer">
                        <input
                          type="checkbox"
                          checked={getAgentConfigParsed().enable_network || false}
                          onChange={e => updateAgentConfig({ enable_network: e.target.checked })}
                          className="rounded border-border"
                        />
                        {t('common.auth.enableNetwork')}
                      </label>
                      <p className="text-xs text-content-secondary mt-2 ml-6">
                        {t('common.auth.enableNetworkDesc')}
                      </p>
                    </div>
                  )}

                  <label className="flex items-center gap-2 text-sm text-content">
                    <input
                      type="checkbox"
                      checked={form.is_default}
                      onChange={e => setForm({ ...form, is_default: e.target.checked })}
                      className="rounded border-border"
                    />
                    {t('common.auth.isDefault')}
                  </label>
                </div>
              )}

              {/* 模型参数 */}
              {activeTab === 'model' && (
                <div className="space-y-4 max-w-2xl">
                  <div>
                    <label className="block text-sm font-medium text-content mb-1">{t('common.auth.model')}</label>
                    <select
                      value={form.model_id}
                      onChange={e => setForm({ ...form, model_id: e.target.value, api_key: '', api_url: '' })}
                      className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content text-sm"
                    >
                      <option value="">{t('common.auth.selectModel')}</option>
                      {providers.map((p) => {
                        const providerModels = allModels.filter(m => m.provider_id === p.id)
                        if (providerModels.length === 0) { return null }
                        return (
                          <optgroup key={p.id} label={`${p.name} (${p.provider_type})`}>
                            {providerModels.map(m => (
                              <option key={m.id} value={m.id}>{m.display_name} ({m.model_name})</option>
                            ))}
                          </optgroup>
                        )
                      })}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-content mb-1">{t('common.auth.apiUrl')}</label>
                    <input
                      type="text"
                      placeholder="https://api.example.com/v1"
                      value={form.api_url}
                      onChange={e => setForm({ ...form, api_url: e.target.value })}
                      className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content text-sm font-mono"
                      autoComplete="off"
                      name="agent-apiurl"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-content mb-1">{t('common.auth.apiKey')}</label>
                    <input
                      type="password"
                      placeholder="sk-..."
                      value={form.api_key}
                      onChange={e => setForm({ ...form, api_key: e.target.value })}
                      className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content text-sm font-mono"
                      autoComplete="new-password"
                      name="agent-apikey"
                    />
                  </div>
                </div>
              )}

              {/* 数据源 */}
              {activeTab === 'datasource' && (
                <DatasourceTab
                  config={getAgentConfigParsed()}
                  onUpdate={updateAgentConfig}
                />
              )}

              {/* 业务知识 */}
              {activeTab === 'knowledge' && (
                <KnowledgeTab
                  config={getAgentConfigParsed()}
                  onUpdate={updateAgentConfig}
                />
              )}

              {/* 系统提示词 */}
              {activeTab === 'prompt' && (
                <SystemPromptTab
                  agentType={agentTypesList.find(t => t.id === form.agent_type)}
                  systemPrompts={systemPromptsList}
                  agentConfig={getAgentConfigParsed()}
                  onUpdate={updateAgentConfig}
                  onRegenerate={regenerateDynamicPrompt}
                />
              )}

              {/* 其他配置 */}
              {activeTab === 'other' && (
                <div className="space-y-4 max-w-2xl">
                  <div>
                    <label className="block text-sm font-medium text-content mb-1">
                      {t('common.auth.extraConfig')}
                      <span className="ml-2 text-xs text-content-tertiary">（JSON 格式）</span>
                    </label>
                    <textarea
                      value={form.extra_config}
                      onChange={e => setForm({ ...form, extra_config: e.target.value })}
                      className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content text-sm font-mono h-48 resize-y"
                      placeholder='{"temperature": 0.7}'
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 底部保存按钮 */}
            <div className="flex items-center justify-end gap-3 p-4 border-t border-border">
              <button
                onClick={handleSave}
                disabled={saving || !form.name}
                className="px-4 py-2 text-sm bg-accent text-white rounded-md hover:opacity-90 disabled:opacity-50"
              >
                {saving ? t('common.auth.saving') : (isCreating ? t('common.auth.create') : t('common.operation.save'))}
              </button>
            </div>
          </div>
        )
        : (
          <div className="flex-1 flex items-center justify-center bg-surface-elevated rounded-lg border border-border">
            <div className="text-center text-content-secondary">
              <div className="text-4xl mb-4">🤖</div>
              <div className="text-lg font-medium mb-2">{t('common.auth.selectAgent')}</div>
              <div className="text-sm">{t('common.auth.selectAgentDesc')}</div>
            </div>
          </div>
        )}
    </div>
  )
}

// 数据源 Tab 组件
function DatasourceTab({ config, onUpdate }: { config: AgentExtraConfig, onUpdate: (updates: Partial<AgentExtraConfig>) => void }) {
  const { t } = useTranslation()
  const datasources = config.datasources || []
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ id: string, success: boolean, message: string } | null>(null)
  const [editingDsId, setEditingDsId] = useState<string | null>(null)

  const addDatasource = () => {
    const newDs: DatasourceConfig = {
      id: `ds-${Date.now()}`,
      name: t('common.auth.datasourceName'),
      type: 'mysql',
      host: '127.0.0.1',
      port: 3306,
      database: '',
      username: '',
      password: '',
      schemas: 'public',
      is_active: datasources.length === 0,
    }
    onUpdate({ datasources: [...datasources, newDs] })
  }

  const updateDatasource = (id: string, updates: Partial<DatasourceConfig>) => {
    onUpdate({
      datasources: datasources.map(ds => ds.id === id ? { ...ds, ...updates } : ds),
    })
  }

  const removeDatasource = (id: string) => {
    const filtered = datasources.filter(ds => ds.id !== id)
    if (filtered.length > 0 && !filtered.some(ds => ds.is_active)) {
      filtered[0].is_active = true
    }
    onUpdate({ datasources: filtered })
  }

  const setActive = (id: string) => {
    onUpdate({
      datasources: datasources.map(ds => ({ ...ds, is_active: ds.id === id })),
    })
  }

  const testConnection = async (ds: DatasourceConfig) => {
    setTestingId(ds.id)
    setTestResult(null)
    try {
      const res = await fetch(`${BASE_PATH}/api/admin/datasources/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: ds.type,
          host: ds.host,
          port: ds.port,
          database: ds.database,
          username: ds.username,
          password: ds.password,
          schemas: ds.schemas,
        }),
      })
      const data = await res.json()
      setTestResult({
        id: ds.id,
        success: res.ok && data.success,
        message: data.message || (res.ok ? t('common.auth.connectionSuccess') : t('common.auth.connectionFailed')),
      })
    }
    catch {
      setTestResult({
        id: ds.id,
        success: false,
        message: t('common.auth.connectionFailed'),
      })
    }
    finally {
      setTestingId(null)
    }
  }

  return (
    <div className="space-y-4">
      {editingDsId
        ? (
          <TableFieldSelection
            datasource={datasources.find(ds => ds.id === editingDsId)!}
            onBack={() => setEditingDsId(null)}
            onUpdate={(updates) => {
              updateDatasource(editingDsId, updates)
            }}
          />
        )
        : (
          <>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-content">{t('common.auth.datasourceList')}</h3>
              <button
                onClick={addDatasource}
                className="px-3 py-1.5 text-sm bg-accent text-white rounded-md hover:opacity-90"
              >
                + {t('common.auth.addDatasource')}
              </button>
            </div>

            {datasources.length === 0
              ? (
                <div className="text-center py-8 text-content-secondary text-sm border border-dashed border-border rounded-lg">
                  {t('common.auth.noDatasource')}
                </div>
              )
              : (
                <div className="space-y-3">
                  {datasources.map(ds => (
                    <div key={ds.id} className="p-4 border border-border rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">📋</span>
                          <span className="font-medium text-content">{ds.name}</span>
                          {ds.is_active && (
                            <span className="text-xs px-2 py-0.5 bg-accent/10 text-accent rounded">使用中</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setEditingDsId(ds.id)}
                            className="text-xs text-accent hover:text-accent-hover px-2 py-1 rounded hover:bg-accent-bg"
                          >
                            {t('common.auth.tableFieldSelection')}
                          </button>
                          <button
                            onClick={() => testConnection(ds)}
                            disabled={testingId === ds.id}
                            className="text-xs text-content-secondary hover:text-content px-2 py-1 rounded hover:bg-surface-hover disabled:opacity-50"
                          >
                            {testingId === ds.id ? '...' : t('common.auth.testConnection')}
                          </button>
                          {!ds.is_active && (
                            <button
                              onClick={() => setActive(ds.id)}
                              className="text-xs text-content-secondary hover:text-content px-2 py-1 rounded hover:bg-surface-hover"
                            >
                              {t('common.auth.setAsActive')}
                            </button>
                          )}
                          <button
                            onClick={() => removeDatasource(ds.id)}
                            className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
                          >
                            {t('common.auth.delete')}
                          </button>
                        </div>
                      </div>

                      {testResult && testResult.id === ds.id && (
                        <div className={`mb-3 p-2 text-xs rounded ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                          {testResult.message}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-content-secondary mb-1">{t('common.auth.datasourceName')}</label>
                          <input
                            type="text"
                            value={ds.name}
                            onChange={e => updateDatasource(ds.id, { name: e.target.value })}
                            className="w-full px-2 py-1.5 text-sm bg-surface border border-border rounded text-content"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-content-secondary mb-1">{t('common.auth.datasourceType')}</label>
                          <select
                            value={ds.type}
                            onChange={e => updateDatasource(ds.id, { type: e.target.value as 'mysql' | 'postgresql' })}
                            className="w-full px-2 py-1.5 text-sm bg-surface border border-border rounded text-content"
                          >
                            <option value="mysql">MySQL</option>
                            <option value="postgresql">PostgreSQL</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-content-secondary mb-1">{t('common.auth.datasourceHost')}</label>
                          <input
                            type="text"
                            value={ds.host}
                            onChange={e => updateDatasource(ds.id, { host: e.target.value })}
                            className="w-full px-2 py-1.5 text-sm bg-surface border border-border rounded text-content font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-content-secondary mb-1">{t('common.auth.datasourcePort')}</label>
                          <input
                            type="number"
                            value={ds.port}
                            onChange={e => updateDatasource(ds.id, { port: parseInt(e.target.value) || 3306 })}
                            className="w-full px-2 py-1.5 text-sm bg-surface border border-border rounded text-content font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-content-secondary mb-1">{t('common.auth.datasourceDatabase')}</label>
                          <input
                            type="text"
                            value={ds.database}
                            onChange={e => updateDatasource(ds.id, { database: e.target.value })}
                            className="w-full px-2 py-1.5 text-sm bg-surface border border-border rounded text-content font-mono"
                          />
                        </div>
                        {ds.type === 'postgresql' && (
                          <div>
                            <label className="block text-xs text-content-secondary mb-1">{t('common.auth.datasourceSchemas')}</label>
                            <input
                              type="text"
                              value={ds.schemas || 'public'}
                              placeholder="public"
                              title={t('common.auth.datasourceSchemasHint')}
                              onChange={e => updateDatasource(ds.id, { schemas: e.target.value })}
                              className="w-full px-2 py-1.5 text-sm bg-surface border border-border rounded text-content font-mono"
                            />
                          </div>
                        )}
                        <div>
                          <label className="block text-xs text-content-secondary mb-1">{t('common.auth.datasourceUsername')}</label>
                          <input
                            type="text"
                            value={ds.username}
                            onChange={e => updateDatasource(ds.id, { username: e.target.value })}
                            className="w-full px-2 py-1.5 text-sm bg-surface border border-border rounded text-content font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-content-secondary mb-1">{t('common.auth.datasourcePassword')}</label>
                          <input
                            type="password"
                            value={ds.password}
                            onChange={e => updateDatasource(ds.id, { password: e.target.value })}
                            className="w-full px-2 py-1.5 text-sm bg-surface border border-border rounded text-content font-mono"
                            autoComplete="new-password"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </>
        )}
    </div>
  )
}

// 表字段选择组件
function TableFieldSelection({ datasource, onBack, onUpdate }: {
  datasource: DatasourceConfig
  onBack: () => void
  onUpdate: (updates: Partial<DatasourceConfig>) => void
}) {
  const { t } = useTranslation()
  const [tables, setTables] = useState<{ name: string, comment: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [tableFields, setTableFields] = useState<any[]>([])
  const [showSelectedOnly, setShowSelectedOnly] = useState(false)
  const [tableKeyword, setTableKeyword] = useState('')

  const loadTables = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${BASE_PATH}/api/admin/datasources/tables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: datasource.type,
          host: datasource.host,
          port: datasource.port,
          database: datasource.database,
          username: datasource.username,
          password: datasource.password,
          schemas: datasource.schemas,
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setTables(data.tables || [])
      }
      else {
        setError(data.message || 'Failed to load tables')
      }
    }
    catch {
      setError('Failed to load tables')
    }
    finally {
      setLoading(false)
    }
  }

  const loadTableFields = async (tableName: string) => {
    setSelectedTable(tableName)
    try {
      const res = await fetch(`${BASE_PATH}/api/admin/datasources/fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: datasource.type,
          host: datasource.host,
          port: datasource.port,
          database: datasource.database,
          username: datasource.username,
          password: datasource.password,
          table: tableName,
          schemas: datasource.schemas,
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        const fields = data.fields || []
        setTableFields(fields)

        // Store metadata in schema_overrides if not already present
        const overrides = datasource.schema_overrides || {}
        if (!overrides[tableName]) {
          const tableInfo = tables.find(t => t.name === tableName)
          const columns: Record<string, any> = {}
          for (const field of fields) {
            columns[field.name] = {
              type: field.type,
              comment: null, // Custom comment starts as null
              original_comment: field.comment || '', // Original comment from database
              is_primary_key: field.is_primary_key || false,
              foreign_key: field.foreign_key || null,
            }
          }
          onUpdate({
            schema_overrides: {
              ...overrides,
              [tableName]: {
                comment: null, // Custom table comment starts as null
                original_comment: tableInfo?.comment || '',
                columns,
              },
            },
          })
        }
      }
    }
    catch {
      // ignore
    }
  }

  const isTableSelected = (tableName: string) => {
    return datasource.selected_tables?.includes(tableName) || false
  }

  const isFieldSelected = (tableName: string, fieldName: string) => {
    return datasource.selected_columns?.[tableName]?.includes(fieldName) || false
  }

  const getTableCustomComment = (tableName: string) => {
    return datasource.schema_overrides?.[tableName]?.comment || ''
  }

  const getFieldCustomComment = (tableName: string, fieldName: string) => {
    return datasource.schema_overrides?.[tableName]?.columns?.[fieldName]?.comment || ''
  }

  const updateTableComment = (tableName: string, comment: string) => {
    const overrides = datasource.schema_overrides || {}
    const existing = overrides[tableName] || { comment: null, columns: {} }
    onUpdate({
      schema_overrides: {
        ...overrides,
        [tableName]: {
          ...existing,
          comment: comment || null,
        },
      },
    })
  }

  const updateFieldComment = (tableName: string, fieldName: string, comment: string) => {
    const overrides = datasource.schema_overrides || {}
    const existing = overrides[tableName] || { comment: null, columns: {} }
    const existingColumns = existing.columns || {}
    onUpdate({
      schema_overrides: {
        ...overrides,
        [tableName]: {
          ...existing,
          columns: {
            ...existingColumns,
            [fieldName]: {
              ...(existingColumns[fieldName] || {}),
              comment: comment || null,
            },
          },
        },
      },
    })
  }

  const loadTableFieldsForTable = async (tableName: string) => {
    try {
      const res = await fetch(`${BASE_PATH}/api/admin/datasources/fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: datasource.type,
          host: datasource.host,
          port: datasource.port,
          database: datasource.database,
          username: datasource.username,
          password: datasource.password,
          table: tableName,
          schemas: datasource.schemas,
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        return data.fields || []
      }
    }
    catch {
      // ignore
    }
    return []
  }

  const toggleTable = async (tableName: string) => {
    const selected = datasource.selected_tables || []
    const columns = datasource.selected_columns || {}
    if (selected.includes(tableName)) {
      onUpdate({
        selected_tables: selected.filter(t => t !== tableName),
        selected_columns: { ...columns, [tableName]: [] },
      })
    }
    else {
      const fields = await loadTableFieldsForTable(tableName)
      onUpdate({
        selected_tables: [...selected, tableName],
        selected_columns: { ...columns, [tableName]: fields.map((f: any) => f.name) },
      })
    }
  }

  const toggleField = (tableName: string, fieldName: string) => {
    const columns = datasource.selected_columns || {}
    const tableColumns = columns[tableName] || []
    if (tableColumns.includes(fieldName)) {
      onUpdate({
        selected_columns: { ...columns, [tableName]: tableColumns.filter(f => f !== fieldName) },
      })
    }
    else {
      onUpdate({
        selected_columns: { ...columns, [tableName]: [...tableColumns, fieldName] },
      })
    }
  }

  useEffect(() => {
    loadTables()
  }, [])

  // 计算已选表数量
  const selectedCount = datasource.selected_tables?.length || 0

  // 计算已选字段数量
  const selectedFieldCount = selectedTable
    ? (datasource.selected_columns?.[selectedTable]?.length || 0)
    : 0

  // 过滤表列表
  const filteredTables = tables.filter((table) => {
    if (showSelectedOnly && !isTableSelected(table.name)) {
      return false
    }
    if (tableKeyword && !table.name.toLowerCase().includes(tableKeyword.toLowerCase()) && !(table.comment || '').toLowerCase().includes(tableKeyword.toLowerCase())) {
      return false
    }
    return true
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="text-sm text-content-secondary hover:text-content flex items-center gap-1"
        >
          ← {t('common.auth.backToDatasourceList')}
        </button>
        <span className="text-sm font-medium text-content">— {datasource.name}</span>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>
      )}

      {loading
        ? (
          <div className="text-center py-8 text-content-secondary">Loading...</div>
        )
        : (
          <div className="flex gap-4 h-[500px]">
            {/* 左侧：表列表 */}
            <div className="flex-shrink-0 min-w-[280px] max-w-[320px] border border-border rounded-lg overflow-hidden">
              <div className="p-2 bg-surface-tertiary border-b border-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-content">{t('common.auth.selectTables')}</span>
                  <label className="flex items-center gap-1 text-xs text-content-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showSelectedOnly}
                      onChange={e => setShowSelectedOnly(e.target.checked)}
                      className="rounded border-border w-3 h-3"
                    />
                    {t('common.auth.selectedOnly', '已选')}
                    <span className="text-content-tertiary">
                      ({selectedCount}/{tables.length})
                    </span>
                  </label>
                </div>
                <input
                  type="text"
                  value={tableKeyword}
                  onChange={e => setTableKeyword(e.target.value)}
                  placeholder={t('common.auth.searchTables', '搜索表名...')}
                  className="w-full px-2 py-1 text-xs bg-surface border border-border rounded text-content"
                />
              </div>
              <div className="overflow-auto h-[calc(100%-80px)]">
                {filteredTables.map(table => (
                  <div
                    key={table.name}
                    className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-surface-hover whitespace-nowrap ${
                      selectedTable === table.name ? 'bg-accent/10' : ''
                    }`}
                    onClick={() => loadTableFields(table.name)}
                    title={table.comment ? `${table.name} — ${table.comment}` : table.name}
                  >
                    <input
                      type="checkbox"
                      checked={isTableSelected(table.name)}
                      onChange={(e) => {
                        e.stopPropagation()
                        toggleTable(table.name)
                      }}
                      className="rounded border-border flex-shrink-0"
                    />
                    <span className="text-sm text-content flex-shrink-0">📋 {table.name}</span>
                    {table.comment && (
                      <span className="text-xs text-content-tertiary truncate max-w-[120px]">— {table.comment}</span>
                    )}
                  </div>
                ))}
                {filteredTables.length === 0 && (
                  <div className="p-4 text-center text-content-secondary text-sm">
                    {tables.length === 0 ? 'No tables found' : t('common.auth.noMatchingTables', '无匹配表')}
                  </div>
                )}
              </div>
            </div>

            {/* 右侧：字段列表 */}
            <div className="flex-1 border border-border rounded-lg overflow-hidden">
              <div className="p-3 bg-surface-tertiary border-b border-border">
                <span className="text-sm font-medium text-content">
                  {selectedTable
                    ? `${selectedTable} - ${t('common.auth.selectFields')}`
                    : t('common.auth.selectFields')}
                  {selectedTable && tableFields.length > 0 && (
                    <span className="ml-2 text-xs text-content-tertiary">
                      ({selectedFieldCount}/{tableFields.length})
                    </span>
                  )}
                </span>
              </div>
              <div className="overflow-y-auto h-[calc(100%-40px)]">
                {selectedTable && tableFields.length > 0
                  ? (
                    <div>
                      {/* Table comment editing */}
                      <div className="p-3 border-b border-border bg-surface">
                        <div className="text-xs text-content-secondary mb-1">
                          {t('common.auth.tableComment', '表注释')}: {tables.find(t => t.name === selectedTable)?.comment || '-'}
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-content-secondary shrink-0">{t('common.auth.customComment', '自定义注释')}:</label>
                          <input
                            type="text"
                            value={getTableCustomComment(selectedTable)}
                            onChange={e => updateTableComment(selectedTable, e.target.value)}
                            placeholder={t('common.auth.customCommentPlaceholder', '输入自定义表注释...')}
                            className="flex-1 px-2 py-1 text-xs bg-surface border border-border rounded text-content"
                          />
                        </div>
                      </div>
                      {/* Field list */}
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-surface-tertiary text-content-secondary">
                            <th className="px-3 py-2 text-left w-10">选择</th>
                            <th className="px-3 py-2 text-left">字段名</th>
                            <th className="px-3 py-2 text-left w-20">类型</th>
                            <th className="px-3 py-2 text-left">原始注释</th>
                            <th className="px-3 py-2 text-left">自定义注释</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tableFields.map(field => (
                            <tr key={field.name} className="border-t border-border">
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={isFieldSelected(selectedTable, field.name)}
                                  onChange={() => toggleField(selectedTable, field.name)}
                                  className="rounded border-border"
                                />
                              </td>
                              <td className="px-3 py-2 text-content font-mono">
                                {field.name}
                                {field.is_primary_key && <span className="ml-1 text-xs text-accent">PK</span>}
                                {field.foreign_key && <span className="ml-1 text-xs text-content-tertiary">FK</span>}
                              </td>
                              <td className="px-3 py-2 text-content-secondary text-xs">{field.type}</td>
                              <td className="px-3 py-2 text-content-tertiary text-xs">{field.comment || '-'}</td>
                              <td className="px-2 py-1">
                                <input
                                  type="text"
                                  value={getFieldCustomComment(selectedTable, field.name)}
                                  onChange={e => updateFieldComment(selectedTable, field.name, e.target.value)}
                                  placeholder={t('common.auth.customCommentPlaceholder', '自定义注释...')}
                                  className="w-full px-2 py-1 text-xs bg-surface border border-border rounded text-content"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                  : (
                    <div className="p-4 text-center text-content-secondary text-sm">
                      {selectedTable ? 'No fields found' : 'Select a table from the left'}
                    </div>
                  )}
              </div>
            </div>
          </div>
        )}
    </div>
  )
}

// 系统提示词 Tab 组件
function SystemPromptTab({ agentType, systemPrompts, agentConfig, onUpdate, onRegenerate }: {
  agentType: any | undefined
  systemPrompts: any[]
  agentConfig: AgentExtraConfig
  onUpdate: (updates: Partial<AgentExtraConfig>) => void
  onRegenerate: () => void
}) {
  const { t } = useTranslation()
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

  const showToastMessage = (message: string) => {
    setToastMessage(message)
    setShowToast(true)
    setTimeout(() => setShowToast(false), 2000)
  }

  // Get the built-in prompt content
  const builtInPromptId = agentType?.system_prompt_id
  const builtInPrompt = builtInPromptId
    ? systemPrompts.find(p => p.id === builtInPromptId)
    : null

  const dynamicPromptUpdatedAt = agentConfig.dynamic_prompt_updated_at
    ? new Date(agentConfig.dynamic_prompt_updated_at * 1000).toLocaleString()
    : null

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Built-in Prompt (read-only) */}
      <div>
        <label className="block text-sm font-medium text-content mb-1">
          {t('common.auth.builtInPrompt', '内置提示词')}
        </label>
        {builtInPrompt
          ? (
            <div className="relative group">
              <div className="p-3 bg-surface-tertiary border border-border rounded-md text-content text-sm font-mono max-h-48 overflow-y-auto whitespace-pre-wrap">
                {builtInPrompt.content}
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(builtInPrompt.content)
                  showToastMessage(t('common.auth.copied', '已复制'))
                }}
                className="absolute top-2 right-2 p-1 text-content-tertiary hover:text-content bg-surface-elevated rounded opacity-0 group-hover:opacity-100 transition-opacity"
                title={t('common.auth.copy', '复制')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          )
          : (
            <div className="p-3 bg-surface-tertiary border border-border rounded-md text-content-tertiary text-sm">
              {t('common.auth.noBuiltInPrompt', '当前智能体类型未配置内置提示词')}
            </div>
          )}
        <p className="text-xs text-content-tertiary mt-2">
          {t('common.auth.builtInPromptDesc', '由智能体类型决定，在"智能体类型管理"中配置')}
        </p>
      </div>

      {/* Supplementary Prompt (user editable) */}
      <div>
        <label className="block text-sm font-medium text-content mb-1">
          {t('common.auth.supplementaryPrompt', '补充提示词')}
          <span className="ml-2 text-xs text-content-tertiary">({t('common.auth.optional', '可选')})</span>
        </label>
        <div className="relative group">
          <textarea
            value={agentConfig.system_prompt || ''}
            onChange={e => onUpdate({ system_prompt: e.target.value })}
            placeholder={t('common.auth.supplementaryPromptPlaceholder', '在内置提示词基础上，添加此智能体的特定指令...')}
            className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content text-sm h-40 resize-y font-mono"
          />
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(agentConfig.system_prompt || '')
              showToastMessage(t('common.auth.copied', '已复制'))
            }}
            className="absolute top-2 right-2 p-1 text-content-tertiary hover:text-content bg-surface-elevated rounded opacity-0 group-hover:opacity-100 transition-opacity"
            title={t('common.auth.copy', '复制')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-content-secondary mt-2">
          {t('common.auth.supplementaryPromptDesc', '在内置提示词基础上，添加此智能体的特定指令')}
        </p>
      </div>

      {/* Dynamic Prompt (auto-generated, can regenerate) */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-content">
            {t('common.auth.dynamicPrompt', '动态提示词（自动生成）')}
          </label>
          <button
            type="button"
            onClick={onRegenerate}
            className="text-xs text-accent hover:text-accent-hover px-2 py-1 rounded hover:bg-accent-bg"
          >
            {t('common.auth.regenerate', '重新生成')}
          </button>
        </div>
        {agentConfig.dynamic_prompt
          ? (
            <div className="relative group">
              <div className="p-3 bg-surface-tertiary border border-border rounded-md text-content text-sm font-mono max-h-48 overflow-y-auto whitespace-pre-wrap">
                {agentConfig.dynamic_prompt}
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(agentConfig.dynamic_prompt || '')
                  showToastMessage(t('common.auth.copied', '已复制'))
                }}
                className="absolute top-2 right-2 p-1 text-content-tertiary hover:text-content bg-surface-elevated rounded opacity-0 group-hover:opacity-100 transition-opacity"
                title={t('common.auth.copy', '复制')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          )
          : (
            <div className="p-3 bg-surface-tertiary border border-border rounded-md text-content-tertiary text-sm">
              {t('common.auth.noDynamicPrompt', '尚未生成，配置数据源和业务知识后自动生成')}
            </div>
          )}
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-content-tertiary">
            {t('common.auth.dynamicPromptDesc', '包含：数据源类型、业务知识、查询示例，配置变更时自动更新（数据表结构由请求时实时注入）')}
          </p>
          {dynamicPromptUpdatedAt && (
            <p className="text-xs text-content-tertiary">
              {t('common.auth.lastUpdated', '最后更新')}: {dynamicPromptUpdatedAt}
            </p>
          )}
        </div>
      </div>

      {/* Toast 提示 */}
      {showToast && (
        <div className="fixed bottom-4 right-4 bg-surface-elevated border border-border rounded-lg shadow-lg px-4 py-2 text-sm text-content animate-fade-in">
          {toastMessage}
        </div>
      )}
    </div>
  )
}

// 业务知识 Tab 组件
function KnowledgeTab({ config, onUpdate }: { config: AgentExtraConfig, onUpdate: (updates: Partial<AgentExtraConfig>) => void }) {
  const { t } = useTranslation()
  const knowledge = config.business_knowledge || []
  const examples = config.query_examples || []

  const addKnowledge = () => {
    const newItem: BusinessKnowledgeItem = {
      id: `k-${Date.now()}`,
      term: '',
      definition: '',
    }
    onUpdate({ business_knowledge: [...knowledge, newItem] })
  }

  const updateKnowledge = (id: string, updates: Partial<BusinessKnowledgeItem>) => {
    onUpdate({
      business_knowledge: knowledge.map(item => item.id === id ? { ...item, ...updates } : item),
    })
  }

  const removeKnowledge = (id: string) => {
    onUpdate({ business_knowledge: knowledge.filter(item => item.id !== id) })
  }

  const addExample = () => {
    const newItem: QueryExample = {
      id: `e-${Date.now()}`,
      question: '',
      sql: '',
    }
    onUpdate({ query_examples: [...examples, newItem] })
  }

  const updateExample = (id: string, updates: Partial<QueryExample>) => {
    onUpdate({
      query_examples: examples.map(item => item.id === id ? { ...item, ...updates } : item),
    })
  }

  const removeExample = (id: string) => {
    onUpdate({ query_examples: examples.filter(item => item.id !== id) })
  }

  return (
    <div className="space-y-8">
      {/* 业务知识 */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-content">{t('common.auth.businessKnowledge')}</h3>
          <button
            onClick={addKnowledge}
            className="px-3 py-1.5 text-sm bg-accent text-white rounded-md hover:opacity-90"
          >
            + {t('common.auth.addTerm')}
          </button>
        </div>

        {knowledge.length === 0
          ? (
            <div className="text-center py-6 text-content-secondary text-sm border border-dashed border-border rounded-lg">
              {t('common.auth.noKnowledge')}
            </div>
          )
          : (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-tertiary text-content-secondary">
                    <th className="px-3 py-2 text-left w-8">#</th>
                    <th className="px-3 py-2 text-left w-32">{t('common.auth.termName')}</th>
                    <th className="px-3 py-2 text-left">{t('common.auth.termDefinition')}</th>
                    <th className="px-3 py-2 text-left w-36">{t('common.auth.fieldMapping')}</th>
                    <th className="px-3 py-2 text-left w-36">{t('common.auth.sqlExpression')}</th>
                    <th className="px-3 py-2 text-right w-16">{t('common.operation.edit')}</th>
                  </tr>
                </thead>
                <tbody>
                  {knowledge.map((item, index) => (
                    <tr key={item.id} className="border-t border-border">
                      <td className="px-3 py-2 text-content-secondary">{index + 1}</td>
                      <td className="px-2 py-1">
                        <input
                          type="text"
                          value={item.term}
                          onChange={e => updateKnowledge(item.id, { term: e.target.value })}
                          className="w-full px-2 py-1 text-sm bg-surface border border-border rounded text-content"
                          placeholder="如：营收"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="text"
                          value={item.definition}
                          onChange={e => updateKnowledge(item.id, { definition: e.target.value })}
                          className="w-full px-2 py-1 text-sm bg-surface border border-border rounded text-content"
                          placeholder="如：主营业务收入，不含退款"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="text"
                          value={item.field_mapping || ''}
                          onChange={e => updateKnowledge(item.id, { field_mapping: e.target.value })}
                          className="w-full px-2 py-1 text-sm bg-surface border border-border rounded text-content font-mono"
                          placeholder="orders.revenue"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="text"
                          value={item.sql_expression || ''}
                          onChange={e => updateKnowledge(item.id, { sql_expression: e.target.value })}
                          className="w-full px-2 py-1 text-sm bg-surface border border-border rounded text-content font-mono"
                          placeholder="SUM(revenue) WHERE ..."
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => removeKnowledge(item.id)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {/* 查询示例 */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-content">{t('common.auth.queryExamples')}</h3>
          <button
            onClick={addExample}
            className="px-3 py-1.5 text-sm bg-accent text-white rounded-md hover:opacity-90"
          >
            + {t('common.auth.addExample')}
          </button>
        </div>

        {examples.length === 0
          ? (
            <div className="text-center py-6 text-content-secondary text-sm border border-dashed border-border rounded-lg">
              {t('common.auth.noExamples')}
            </div>
          )
          : (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-tertiary text-content-secondary">
                    <th className="px-3 py-2 text-left w-8">#</th>
                    <th className="px-3 py-2 text-left w-48">{t('common.auth.userQuestion')}</th>
                    <th className="px-3 py-2 text-left">{t('common.auth.exampleSql')}</th>
                    <th className="px-3 py-2 text-left w-32">{t('common.auth.explanation')}</th>
                    <th className="px-3 py-2 text-right w-16">{t('common.operation.edit')}</th>
                  </tr>
                </thead>
                <tbody>
                  {examples.map((item, index) => (
                    <tr key={item.id} className="border-t border-border">
                      <td className="px-3 py-2 text-content-secondary">{index + 1}</td>
                      <td className="px-2 py-1">
                        <input
                          type="text"
                          value={item.question}
                          onChange={e => updateExample(item.id, { question: e.target.value })}
                          className="w-full px-2 py-1 text-sm bg-surface border border-border rounded text-content"
                          placeholder="上个月营收多少？"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="text"
                          value={item.sql}
                          onChange={e => updateExample(item.id, { sql: e.target.value })}
                          className="w-full px-2 py-1 text-sm bg-surface border border-border rounded text-content font-mono"
                          placeholder="SELECT SUM(revenue) FROM orders WHERE ..."
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="text"
                          value={item.explanation || ''}
                          onChange={e => updateExample(item.id, { explanation: e.target.value })}
                          className="w-full px-2 py-1 text-sm bg-surface border border-border rounded text-content"
                          placeholder="按月聚合"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => removeExample(item.id)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  )
}
