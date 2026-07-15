'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BASE_PATH } from '@/config'
import FormDialog from '@/app/components/base/form-dialog'

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

export default function AgentsPage() {
  const { t } = useTranslation()
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)
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
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [providers, setProviders] = useState<ModelProvider[]>([])
  const [allModels, setAllModels] = useState<ModelItem[]>([])

  const isEditing = !!editingAgent

  const loadAgents = async () => {
    try {
      const res = await fetch(`${BASE_PATH}/api/admin/agents`)
      const data = await res.json()
      setAgents(data.agents || [])
    }
    catch {
      // ignore
    }
    finally {
      setLoading(false)
    }
  }

  const loadModelData = async () => {
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
    catch {
      // ignore
    }
  }

  useEffect(() => { loadAgents() }, [])

  const openCreate = async () => {
    setEditingAgent(null)
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
    })
    setError('')
    await loadModelData()
    setShowDialog(true)
  }

  const openEdit = async (agent: Agent) => {
    setEditingAgent(agent)
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
    })
    setError('')
    await loadModelData()
    setShowDialog(true)
  }

  const handleConfirm = async () => {
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

    try {
      const payload = {
        ...form,
        model_id: form.model_id || null,
        extra_config: extraConfig,
      }

      if (isEditing) {
        const res = await fetch(`${BASE_PATH}/api/admin/agents`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingAgent!.id, ...payload }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || t('common.auth.createFailed'))
          return
        }
      }
      else {
        const res = await fetch(`${BASE_PATH}/api/admin/agents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || t('common.auth.createFailed'))
          return
        }
      }

      setShowDialog(false)
      setEditingAgent(null)
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

  if (loading) {
    return <div className="text-content-secondary">Loading...</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-content">{t('common.auth.agents')}</h2>
        <button
          onClick={openCreate}
          className="px-3 py-1.5 text-sm bg-accent text-white rounded-md hover:opacity-90"
        >
          {t('common.auth.addAgent')}
        </button>
      </div>

      <div className="bg-surface-elevated rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-content-secondary">
              <th className="px-4 py-2">{t('common.auth.name')}</th>
              <th className="px-4 py-2">{t('common.auth.agentId')}</th>
              <th className="px-4 py-2">{t('common.auth.backendType')}</th>
              <th className="px-4 py-2">{t('common.auth.model')}</th>
              <th className="px-4 py-2">{t('common.auth.status')}</th>
              <th className="px-4 py-2">{t('common.auth.isDefault')}</th>
              <th className="px-4 py-2 text-right">{t('common.auth.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {agents.map(agent => (
              <tr key={agent.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 text-content">
                  <span className="mr-2">{agent.icon}</span>
                  {agent.name}
                </td>
                <td className="px-4 py-2 text-content-secondary text-xs font-mono">{agent.id}</td>
                <td className="px-4 py-2 text-content-secondary text-xs">{agent.backend_type}</td>
                <td className="px-4 py-2 text-content-secondary text-xs font-mono">{agent.model || '-'}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${agent.is_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {agent.is_enabled ? t('common.auth.active') : t('common.auth.disabled')}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {agent.is_default && (
                    <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                      {t('common.auth.yes')}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => openEdit(agent)} className="text-xs text-content-secondary hover:text-content mr-2">
                    {t('common.operation.edit')}
                  </button>
                  <button onClick={() => handleToggle(agent)} className="text-xs text-content-secondary hover:text-content mr-2">
                    {agent.is_enabled ? t('common.auth.disable') : t('common.auth.enable')}
                  </button>
                  {!agent.is_default && (
                    <button onClick={() => handleDelete(agent.id)} className="text-xs text-red-500 hover:text-red-700">
                      {t('common.auth.delete')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {agents.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-4 text-center text-content-secondary">{t('common.auth.noAgents')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <FormDialog
        open={showDialog}
        onClose={() => { setShowDialog(false); setEditingAgent(null) }}
        onConfirm={handleConfirm}
        title={isEditing ? t('common.auth.editAgent') : t('common.auth.createAgent')}
        confirmText={isEditing ? t('common.operation.save') : t('common.auth.create')}
        loading={saving}
      >
        {error && <div className="mb-3 p-2 bg-red-50 text-red-700 text-sm rounded">{error}</div>}
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs text-content-secondary mb-1">{t('common.auth.name')}</label>
              <input
                type="text"
                placeholder={t('common.auth.name')}
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm"
                required
              />
            </div>
            <div className="w-16">
              <label className="block text-xs text-content-secondary mb-1">{t('common.auth.icon')}</label>
              <input
                type="text"
                placeholder="🤖"
                value={form.icon}
                onChange={e => setForm({ ...form, icon: e.target.value })}
                className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm text-center"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-content-secondary mb-1">{t('common.auth.description')}</label>
            <input
              type="text"
              placeholder={t('common.auth.description')}
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-content-secondary mb-1">{t('common.auth.backendType')}</label>
            <select
              value={form.backend_type}
              onChange={e => setForm({ ...form, backend_type: e.target.value, model_id: '' })}
              className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm"
            >
              {backendTypes.map(bt => (
                <option key={bt} value={bt}>{t(`common.auth.backend${bt === 'dify' ? 'Dify' : bt === 'direct_llm' ? 'DirectLlm' : bt === 'fastgpt' ? 'Fastgpt' : 'N8n'}`)}</option>
              ))}
            </select>
          </div>
          {form.backend_type === 'direct_llm' && (
            <div>
              <label className="block text-xs text-content-secondary mb-1">{t('common.auth.executionMode', '执行模式')}</label>
              <select
                value={form.execution_mode}
                onChange={e => setForm({ ...form, execution_mode: e.target.value })}
                className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm"
              >
                <option value="chat">{t('common.auth.executionChat', '纯对话模式')}</option>
                <option value="react">{t('common.auth.executionReact', 'ReAct 模式')}</option>
                <option value="plan_and_execute">{t('common.auth.executionPlanAndExecute', 'Plan-And-Execute 模式')}</option>
              </select>
              <p className="text-xs text-content-secondary mt-1">
                {form.execution_mode === 'chat' && t('common.auth.executionChatDesc', '直接与LLM对话，不使用工具')}
                {form.execution_mode === 'react' && t('common.auth.executionReactDesc', '支持工具调用，Agent会思考→调用工具→继续推理')}
                {form.execution_mode === 'plan_and_execute' && t('common.auth.executionPlanDesc', '先规划任务步骤，再逐步执行，适合复杂任务')}
              </p>
            </div>
          )}
          {form.backend_type === 'direct_llm' && (
            <div>
              <label className="block text-xs text-content-secondary mb-1">{t('common.auth.model')}</label>
              <select
                value={form.model_id}
                onChange={e => setForm({ ...form, model_id: e.target.value, api_key: '', api_url: '' })}
                className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm"
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
              {providers.length === 0 && (
                <p className="text-xs text-yellow-600 mt-1">{t('common.auth.noProvidersFirst')}</p>
              )}
            </div>
          )}
          <div>
            <label className="block text-xs text-content-secondary mb-1">{t('common.auth.apiUrl')}</label>
            <input
              type="text"
              placeholder="https://api.example.com/v1"
              value={form.api_url}
              onChange={e => setForm({ ...form, api_url: e.target.value })}
              className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm font-mono"
              name="agent-apiurl"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="block text-xs text-content-secondary mb-1">{t('common.auth.apiKey')}</label>
            <input
              type="password"
              placeholder="sk-..."
              value={form.api_key}
              onChange={e => setForm({ ...form, api_key: e.target.value })}
              className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm font-mono"
              name="agent-apikey"
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="block text-xs text-content-secondary mb-1">{t('common.auth.extraConfig')}</label>
            <textarea
              placeholder='{"temperature": 0.7}'
              value={form.extra_config}
              onChange={e => setForm({ ...form, extra_config: e.target.value })}
              className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm font-mono h-20 resize-none"
            />
          </div>
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
      </FormDialog>
    </div>
  )
}
