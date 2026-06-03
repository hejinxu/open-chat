'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BASE_PATH } from '@/config'
import FormDialog from '@/app/components/base/form-dialog'

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
  description: string
  context_window: number | null
  max_output_tokens: number | null
  capabilities: string[]
  pricing_input: number | null
  pricing_output: number | null
  default_params: Record<string, any>
  is_enabled: boolean
  created_at: number
  updated_at: number
}

interface ModelWithProviderName extends ModelItem {
  provider_name: string
}

const capabilityOptions = ['vision', 'function_calling', 'streaming'] as const

export default function ModelsPage() {
  const { t } = useTranslation()
  const [models, setModels] = useState<ModelWithProviderName[]>([])
  const [providers, setProviders] = useState<ModelProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editingModel, setEditingModel] = useState<ModelWithProviderName | null>(null)
  const [form, setForm] = useState({
    provider_id: '',
    model_name: '',
    display_name: '',
    description: '',
    context_window: '',
    max_output_tokens: '',
    capabilities: [] as string[],
    pricing_input: '',
    pricing_output: '',
    default_params: '{}',
    is_enabled: true,
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const isEditing = !!editingModel

  const loadData = async () => {
    try {
      const [modelsRes, providersRes] = await Promise.all([
        fetch(`${BASE_PATH}/api/admin/models`),
        fetch(`${BASE_PATH}/api/admin/model-providers`),
      ])
      const modelsData = await modelsRes.json()
      const providersData = await providersRes.json()

      const allProviders = providersData.providers || []
      setProviders(allProviders)

      const modelsWithNames = (modelsData.models || []).map((m: ModelItem) => {
        const provider = allProviders.find((p: ModelProvider) => p.id === m.provider_id)
        return {
          ...m,
          provider_name: provider?.name || 'Unknown',
        }
      })
      setModels(modelsWithNames)
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
    setEditingModel(null)
    setForm({
      provider_id: providers[0]?.id || '',
      model_name: '',
      display_name: '',
      description: '',
      context_window: '',
      max_output_tokens: '',
      capabilities: [],
      pricing_input: '',
      pricing_output: '',
      default_params: '{}',
      is_enabled: true,
    })
    setError('')
    setShowDialog(true)
  }

  const openEdit = (model: ModelWithProviderName) => {
    setEditingModel(model)
    setForm({
      provider_id: model.provider_id,
      model_name: model.model_name,
      display_name: model.display_name,
      description: model.description,
      context_window: model.context_window?.toString() || '',
      max_output_tokens: model.max_output_tokens?.toString() || '',
      capabilities: model.capabilities || [],
      pricing_input: model.pricing_input?.toString() || '',
      pricing_output: model.pricing_output?.toString() || '',
      default_params: Object.keys(model.default_params || {}).length > 0 ? JSON.stringify(model.default_params, null, 2) : '{}',
      is_enabled: model.is_enabled,
    })
    setError('')
    setShowDialog(true)
  }

  const toggleCapability = (cap: string) => {
    setForm(prev => ({
      ...prev,
      capabilities: prev.capabilities.includes(cap)
        ? prev.capabilities.filter(c => c !== cap)
        : [...prev.capabilities, cap],
    }))
  }

  const handleConfirm = async () => {
    setError('')
    setSaving(true)

    let defaultParams: Record<string, any> = {}
    try {
      if (form.default_params.trim()) {
        defaultParams = JSON.parse(form.default_params)
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
        context_window: form.context_window ? parseInt(form.context_window) : null,
        max_output_tokens: form.max_output_tokens ? parseInt(form.max_output_tokens) : null,
        pricing_input: form.pricing_input ? parseFloat(form.pricing_input) : null,
        pricing_output: form.pricing_output ? parseFloat(form.pricing_output) : null,
        default_params: defaultParams,
      }

      if (isEditing) {
        const res = await fetch(`${BASE_PATH}/api/admin/models`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingModel!.id, ...payload }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || t('common.auth.createFailed'))
          return
        }
      }
      else {
        const res = await fetch(`${BASE_PATH}/api/admin/models`, {
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
      setEditingModel(null)
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
    if (!confirm(t('common.auth.deleteModelConfirm'))) {
      return
    }

    try {
      await fetch(`${BASE_PATH}/api/admin/models`, {
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

  const handleToggle = async (model: ModelWithProviderName) => {
    try {
      await fetch(`${BASE_PATH}/api/admin/models`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: model.id, is_enabled: !model.is_enabled }),
      })
      loadData()
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
        <h2 className="text-lg font-medium text-content">{t('common.auth.models')}</h2>
        <button
          onClick={openCreate}
          disabled={providers.length === 0}
          className="px-3 py-1.5 text-sm bg-accent text-white rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t('common.auth.addModel')}
        </button>
      </div>

      {providers.length === 0 && (
        <div className="mb-4 p-3 bg-yellow-50 text-yellow-700 text-sm rounded border border-yellow-200">
          {t('common.auth.noProvidersFirst')}
        </div>
      )}

      <div className="bg-surface-elevated rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-content-secondary">
              <th className="px-4 py-2">{t('common.auth.displayName')}</th>
              <th className="px-4 py-2">{t('common.auth.modelName')}</th>
              <th className="px-4 py-2">{t('common.auth.provider')}</th>
              <th className="px-4 py-2">{t('common.auth.contextWindow')}</th>
              <th className="px-4 py-2">{t('common.auth.capabilities')}</th>
              <th className="px-4 py-2">{t('common.auth.status')}</th>
              <th className="px-4 py-2 text-right">{t('common.auth.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {models.map(model => (
              <tr key={model.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 text-content">{model.display_name}</td>
                <td className="px-4 py-2 text-content-secondary text-xs font-mono">{model.model_name}</td>
                <td className="px-4 py-2 text-content-secondary text-xs">{model.provider_name}</td>
                <td className="px-4 py-2 text-content-secondary text-xs">
                  {model.context_window ? `${(model.context_window / 1000).toFixed(0)}K` : '-'}
                </td>
                <td className="px-4 py-2">
                  <div className="flex gap-1 flex-wrap">
                    {model.capabilities?.map(cap => (
                      <span key={cap} className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                        {cap}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${model.is_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {model.is_enabled ? t('common.auth.active') : t('common.auth.disabled')}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => openEdit(model)} className="text-xs text-content-secondary hover:text-content mr-2">
                    {t('common.operation.edit')}
                  </button>
                  <button onClick={() => handleToggle(model)} className="text-xs text-content-secondary hover:text-content mr-2">
                    {model.is_enabled ? t('common.auth.disable') : t('common.auth.enable')}
                  </button>
                  <button onClick={() => handleDelete(model.id)} className="text-xs text-red-500 hover:text-red-700">
                    {t('common.auth.delete')}
                  </button>
                </td>
              </tr>
            ))}
            {models.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-4 text-center text-content-secondary">{t('common.auth.noModels')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <FormDialog
        open={showDialog}
        onClose={() => { setShowDialog(false); setEditingModel(null) }}
        onConfirm={handleConfirm}
        title={isEditing ? t('common.auth.editModel') : t('common.auth.createModel')}
        confirmText={isEditing ? t('common.operation.save') : t('common.auth.create')}
        loading={saving}
      >
        {error && <div className="mb-3 p-2 bg-red-50 text-red-700 text-sm rounded">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-content-secondary mb-1">{t('common.auth.provider')}</label>
            <select
              value={form.provider_id}
              onChange={e => setForm({ ...form, provider_id: e.target.value })}
              className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm"
            >
              {providers.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.provider_type})</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs text-content-secondary mb-1">{t('common.auth.modelName')}</label>
              <input
                type="text"
                placeholder="gpt-4o"
                value={form.model_name}
                onChange={e => setForm({ ...form, model_name: e.target.value })}
                className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm font-mono"
                required
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-content-secondary mb-1">{t('common.auth.displayName')}</label>
              <input
                type="text"
                placeholder="GPT-4o"
                value={form.display_name}
                onChange={e => setForm({ ...form, display_name: e.target.value })}
                className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm"
                required
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
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs text-content-secondary mb-1">{t('common.auth.contextWindow')}</label>
              <input
                type="number"
                placeholder="128000"
                value={form.context_window}
                onChange={e => setForm({ ...form, context_window: e.target.value })}
                className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-content-secondary mb-1">{t('common.auth.maxOutputTokens')}</label>
              <input
                type="number"
                placeholder="4096"
                value={form.max_output_tokens}
                onChange={e => setForm({ ...form, max_output_tokens: e.target.value })}
                className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-content-secondary mb-1">{t('common.auth.capabilities')}</label>
            <div className="flex gap-3">
              {capabilityOptions.map(cap => (
                <label key={cap} className="flex items-center gap-1.5 text-sm text-content">
                  <input
                    type="checkbox"
                    checked={form.capabilities.includes(cap)}
                    onChange={() => toggleCapability(cap)}
                    className="rounded border-border"
                  />
                  {cap}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs text-content-secondary mb-1">{t('common.auth.pricingInput')}</label>
              <input
                type="number"
                step="0.01"
                placeholder="2.50"
                value={form.pricing_input}
                onChange={e => setForm({ ...form, pricing_input: e.target.value })}
                className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-content-secondary mb-1">{t('common.auth.pricingOutput')}</label>
              <input
                type="number"
                step="0.01"
                placeholder="10.00"
                value={form.pricing_output}
                onChange={e => setForm({ ...form, pricing_output: e.target.value })}
                className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-content-secondary mb-1">{t('common.auth.defaultParams')} (JSON)</label>
            <textarea
              placeholder='{"temperature": 0.7, "max_tokens": 4096}'
              value={form.default_params}
              onChange={e => setForm({ ...form, default_params: e.target.value })}
              className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm font-mono h-20 resize-none"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-content">
            <input
              type="checkbox"
              checked={form.is_enabled}
              onChange={e => setForm({ ...form, is_enabled: e.target.checked })}
              className="rounded border-border"
            />
            {t('common.auth.enabled')}
          </label>
        </div>
      </FormDialog>
    </div>
  )
}
