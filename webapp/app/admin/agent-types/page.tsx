'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BASE_PATH } from '@/config'

interface AgentType {
  id: string
  name: string
  icon: string
  description: string
  system_prompt_id: string | null
  backend_type_constraint: string[] | null
  execution_mode_constraint: string[] | null
  config_schema: Record<string, any>
  is_enabled: boolean
  created_at: number
  updated_at: number
}

interface SystemPrompt {
  id: string
  name: string
  description: string
}

export default function AgentTypesPage() {
  const { t } = useTranslation()
  const [agentTypes, setAgentTypes] = useState<AgentType[]>([])
  const [systemPrompts, setSystemPrompts] = useState<SystemPrompt[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editingType, setEditingType] = useState<AgentType | null>(null)
  const [form, setForm] = useState({
    name: '',
    icon: '🤖',
    description: '',
    system_prompt_id: '',
    backend_type_constraint: [] as string[],
    execution_mode_constraint: [] as string[],
    is_enabled: true,
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const isEditing = !!editingType

  const loadData = async () => {
    try {
      const [typesRes, promptsRes] = await Promise.all([
        fetch(`${BASE_PATH}/api/admin/agent-types`),
        fetch(`${BASE_PATH}/api/admin/system-prompts`),
      ])
      const typesData = await typesRes.json()
      const promptsData = await promptsRes.json()
      setAgentTypes(typesData.agent_types || [])
      setSystemPrompts(promptsData.system_prompts || [])
    }
    catch {
      // ignore
    }
    finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const openCreate = () => {
    setEditingType(null)
    setForm({
      name: '',
      icon: '🤖',
      description: '',
      system_prompt_id: '',
      backend_type_constraint: [],
      execution_mode_constraint: [],
      is_enabled: true,
    })
    setError('')
    setShowDialog(true)
  }

  const openEdit = (agentType: AgentType) => {
    setEditingType(agentType)
    setForm({
      name: agentType.name,
      icon: agentType.icon,
      description: agentType.description,
      system_prompt_id: agentType.system_prompt_id || '',
      backend_type_constraint: agentType.backend_type_constraint || [],
      execution_mode_constraint: agentType.execution_mode_constraint || [],
      is_enabled: agentType.is_enabled,
    })
    setError('')
    setShowDialog(true)
  }

  const handleConfirm = async () => {
    setError('')
    setSaving(true)

    try {
      const payload = {
        ...form,
        system_prompt_id: form.system_prompt_id || null,
        backend_type_constraint: form.backend_type_constraint.length > 0 ? form.backend_type_constraint : null,
        execution_mode_constraint: form.execution_mode_constraint.length > 0 ? form.execution_mode_constraint : null,
      }

      if (isEditing) {
        const res = await fetch(`${BASE_PATH}/api/admin/agent-types`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingType!.id, ...payload }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || t('common.auth.createFailed'))
          return
        }
      }
      else {
        const res = await fetch(`${BASE_PATH}/api/admin/agent-types`, {
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
      setEditingType(null)
      loadData()
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
    if (!confirm(t('common.auth.deleteAgentTypeConfirm', '确定要删除此智能体类型吗？'))) {
      return
    }

    try {
      await fetch(`${BASE_PATH}/api/admin/agent-types`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      loadData()
    }
    catch {
      // ignore
    }
  }

  const backendTypes = ['dify', 'direct_llm', 'fastgpt', 'n8n']
  const executionModes = ['chat', 'react', 'plan_and_execute']

  if (loading) {
    return <div className="text-content-secondary">Loading...</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-content">{t('common.auth.agentTypes', '智能体类型管理')}</h2>
        <button
          onClick={openCreate}
          className="px-3 py-1.5 text-sm bg-accent text-white rounded-md hover:opacity-90"
        >
          + {t('common.auth.addAgentType', '新增类型')}
        </button>
      </div>

      <div className="space-y-3">
        {agentTypes.map(agentType => (
          <div key={agentType.id} className="bg-surface-elevated rounded-lg border border-border p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{agentType.icon}</span>
                  <span className="font-medium text-content">{agentType.name}</span>
                  {!agentType.is_enabled && (
                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded">
                      {t('common.auth.disabled')}
                    </span>
                  )}
                </div>
                {agentType.description && (
                  <p className="text-sm text-content-secondary mb-2">{agentType.description}</p>
                )}
                <div className="flex flex-wrap gap-2 text-xs text-content-tertiary">
                  {agentType.system_prompt_id && (
                    <span className="px-2 py-0.5 bg-accent/10 text-accent rounded">
                      {t('common.auth.hasBuiltInPrompt', '有内置提示词')}
                    </span>
                  )}
                  {agentType.backend_type_constraint && (
                    <span className="px-2 py-0.5 bg-surface-tertiary rounded">
                      {t('common.auth.backendType')}: {agentType.backend_type_constraint.join(', ')}
                    </span>
                  )}
                  {agentType.execution_mode_constraint && (
                    <span className="px-2 py-0.5 bg-surface-tertiary rounded">
                      {t('common.auth.executionMode')}: {agentType.execution_mode_constraint.join(', ')}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={() => openEdit(agentType)}
                  className="text-xs text-content-secondary hover:text-content px-2 py-1 rounded hover:bg-surface-hover"
                >
                  {t('common.operation.edit')}
                </button>
                <button
                  onClick={() => handleDelete(agentType.id)}
                  className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
                >
                  {t('common.auth.delete')}
                </button>
              </div>
            </div>
          </div>
        ))}
        {agentTypes.length === 0 && (
          <div className="text-center py-8 text-content-secondary">
            {t('common.auth.noAgentTypes', '暂无智能体类型')}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface-elevated rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="text-lg font-medium text-content">
                {isEditing ? t('common.auth.editAgentType', '编辑类型') : t('common.auth.createAgentType', '新增类型')}
              </h3>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh] space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>
              )}
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
                <div className="w-16">
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
                <label className="block text-sm font-medium text-content mb-1">{t('common.auth.systemPrompt', '内置提示词')}</label>
                <select
                  value={form.system_prompt_id}
                  onChange={e => setForm({ ...form, system_prompt_id: e.target.value })}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content text-sm"
                >
                  <option value="">{t('common.auth.noSystemPrompt', '无')}</option>
                  {systemPrompts.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1">{t('common.auth.backendTypeConstraint', '后端类型约束')}</label>
                <div className="flex flex-wrap gap-2">
                  {backendTypes.map(bt => (
                    <label key={bt} className="flex items-center gap-1 text-sm text-content cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.backend_type_constraint.includes(bt)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setForm({ ...form, backend_type_constraint: [...form.backend_type_constraint, bt] })
                          }
                          else {
                            setForm({ ...form, backend_type_constraint: form.backend_type_constraint.filter(b => b !== bt) })
                          }
                        }}
                        className="rounded border-border"
                      />
                      {bt}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-content-tertiary mt-1">{t('common.auth.constraintHint', '留空表示无约束')}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1">{t('common.auth.executionModeConstraint', '执行模式约束')}</label>
                <div className="flex flex-wrap gap-2">
                  {executionModes.map(em => (
                    <label key={em} className="flex items-center gap-1 text-sm text-content cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.execution_mode_constraint.includes(em)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setForm({ ...form, execution_mode_constraint: [...form.execution_mode_constraint, em] })
                          }
                          else {
                            setForm({ ...form, execution_mode_constraint: form.execution_mode_constraint.filter(m => m !== em) })
                          }
                        }}
                        className="rounded border-border"
                      />
                      {em}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-content-tertiary mt-1">{t('common.auth.constraintHint', '留空表示无约束')}</p>
              </div>
              <label className="flex items-center gap-2 text-sm text-content">
                <input
                  type="checkbox"
                  checked={form.is_enabled}
                  onChange={e => setForm({ ...form, is_enabled: e.target.checked })}
                  className="rounded border-border"
                />
                {t('common.auth.isEnabled', '启用')}
              </label>
            </div>
            <div className="flex items-center justify-end gap-3 p-4 border-t border-border">
              <button
                onClick={() => { setShowDialog(false); setEditingType(null) }}
                className="px-4 py-2 text-sm text-content-secondary hover:text-content"
              >
                {t('common.operation.cancel')}
              </button>
              <button
                onClick={handleConfirm}
                disabled={saving || !form.name}
                className="px-4 py-2 text-sm bg-accent text-white rounded-md hover:opacity-90 disabled:opacity-50"
              >
                {saving ? t('common.auth.saving') : (isEditing ? t('common.operation.save') : t('common.auth.create'))}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
