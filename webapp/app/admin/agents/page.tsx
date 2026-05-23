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
  extra_config: string
  is_default: boolean
  is_enabled: boolean
  created_at: number
  updated_at: number
}

const backendTypes = ['dify', 'direct_llm', 'fastgpt', 'n8n'] as const

export default function AgentsPage() {
  const { t } = useTranslation()
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)
  const [form, setForm] = useState({
    id: '',
    name: '',
    icon: '🤖',
    description: '',
    backend_type: 'dify',
    api_key: '',
    api_url: '',
    model: '',
    extra_config: '{}',
    is_default: false,
    is_enabled: true,
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

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

  useEffect(() => { loadAgents() }, [])

  const openCreate = () => {
    setEditingAgent(null)
    setForm({
      id: '',
      name: '',
      icon: '🤖',
      description: '',
      backend_type: 'dify',
      api_key: '',
      api_url: '',
      model: '',
      extra_config: '{}',
      is_default: false,
      is_enabled: true,
    })
    setError('')
    setShowDialog(true)
  }

  const openEdit = (agent: Agent) => {
    setEditingAgent(agent)
    setForm({
      id: agent.id,
      name: agent.name,
      icon: agent.icon,
      description: agent.description,
      backend_type: agent.backend_type,
      api_key: agent.api_key,
      api_url: agent.api_url,
      model: agent.model || '',
      extra_config: agent.extra_config || '{}',
      is_default: agent.is_default,
      is_enabled: agent.is_enabled,
    })
    setError('')
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
        model: form.model || null,
        extra_config: extraConfig,
      }

      if (isEditing) {
        const res = await fetch(`${BASE_PATH}/api/admin/agents`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
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
              <th className="px-4 py-2">{t('common.auth.backendType')}</th>
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
                <td className="px-4 py-2 text-content-secondary text-xs">{agent.backend_type}</td>
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
              <tr><td colSpan={5} className="px-4 py-4 text-center text-content-secondary">{t('common.auth.noAgents')}</td></tr>
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
          {!isEditing && (
            <input
              type="text"
              placeholder="ID (e.g. my-agent)"
              value={form.id}
              onChange={e => setForm({ ...form, id: e.target.value })}
              className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm font-mono"
              required
            />
          )}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={t('common.auth.name')}
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="flex-1 px-3 py-2 bg-surface border border-border rounded text-content text-sm"
              required
            />
            <input
              type="text"
              placeholder="Icon"
              value={form.icon}
              onChange={e => setForm({ ...form, icon: e.target.value })}
              className="w-16 px-3 py-2 bg-surface border border-border rounded text-content text-sm text-center"
            />
          </div>
          <input
            type="text"
            placeholder={t('common.auth.description')}
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm"
          />
          <select
            value={form.backend_type}
            onChange={e => setForm({ ...form, backend_type: e.target.value })}
            className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm"
          >
            {backendTypes.map(bt => (
              <option key={bt} value={bt}>{t(`common.auth.backend${bt === 'dify' ? 'Dify' : bt === 'direct_llm' ? 'DirectLlm' : bt === 'fastgpt' ? 'Fastgpt' : 'N8n'}`)}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="API URL"
            value={form.api_url}
            onChange={e => setForm({ ...form, api_url: e.target.value })}
            className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm font-mono"
          />
          <input
            type="password"
            placeholder="API Key"
            value={form.api_key}
            onChange={e => setForm({ ...form, api_key: e.target.value })}
            className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm font-mono"
          />
          <input
            type="text"
            placeholder="Model (required for direct_llm)"
            value={form.model}
            onChange={e => setForm({ ...form, model: e.target.value })}
            className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm font-mono"
          />
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
