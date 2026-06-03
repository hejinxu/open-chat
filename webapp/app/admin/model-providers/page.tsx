'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BASE_PATH } from '@/config'
import FormDialog from '@/app/components/base/form-dialog'

interface ModelProvider {
  id: string
  name: string
  provider_type: string
  api_key: string
  api_base_url: string
  is_enabled: boolean
  created_at: number
  updated_at: number
}

const providerTypes = ['openai', 'anthropic', 'siliconflow', 'ollama', 'custom'] as const

const defaultApiUrls: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  siliconflow: 'https://api.siliconflow.cn/v1',
  ollama: 'http://localhost:11434/v1',
  custom: '',
}

export default function ModelProvidersPage() {
  const { t } = useTranslation()
  const [providers, setProviders] = useState<ModelProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editingProvider, setEditingProvider] = useState<ModelProvider | null>(null)
  const [form, setForm] = useState({
    name: '',
    provider_type: 'openai',
    api_key: '',
    api_base_url: 'https://api.openai.com/v1',
    is_enabled: true,
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const isEditing = !!editingProvider

  const loadProviders = async () => {
    try {
      const res = await fetch(`${BASE_PATH}/api/admin/model-providers`)
      const data = await res.json()
      setProviders(data.providers || [])
    }
    catch {
      // ignore
    }
    finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadProviders() }, [])

  const openCreate = () => {
    setEditingProvider(null)
    setForm({
      name: '',
      provider_type: 'openai',
      api_key: '',
      api_base_url: 'https://api.openai.com/v1',
      is_enabled: true,
    })
    setError('')
    setShowDialog(true)
  }

  const openEdit = (provider: ModelProvider) => {
    setEditingProvider(provider)
    setForm({
      name: provider.name,
      provider_type: provider.provider_type,
      api_key: provider.api_key,
      api_base_url: provider.api_base_url,
      is_enabled: provider.is_enabled,
    })
    setError('')
    setShowDialog(true)
  }

  const handleProviderTypeChange = (newType: string) => {
    setForm({
      ...form,
      provider_type: newType,
      api_base_url: defaultApiUrls[newType] || form.api_base_url,
    })
  }

  const handleConfirm = async () => {
    setError('')
    setSaving(true)

    try {
      if (isEditing) {
        const res = await fetch(`${BASE_PATH}/api/admin/model-providers`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingProvider!.id, ...form }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || t('common.auth.createFailed'))
          return
        }
      }
      else {
        const res = await fetch(`${BASE_PATH}/api/admin/model-providers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || t('common.auth.createFailed'))
          return
        }
      }

      setShowDialog(false)
      setEditingProvider(null)
      loadProviders()
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
    if (!confirm(t('common.auth.deleteProviderConfirm'))) {
      return
    }

    try {
      await fetch(`${BASE_PATH}/api/admin/model-providers`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      loadProviders()
    }
    catch {
      // ignore
    }
  }

  const handleToggle = async (provider: ModelProvider) => {
    try {
      await fetch(`${BASE_PATH}/api/admin/model-providers`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: provider.id, is_enabled: !provider.is_enabled }),
      })
      loadProviders()
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
        <h2 className="text-lg font-medium text-content">{t('common.auth.modelProviders')}</h2>
        <button
          onClick={openCreate}
          className="px-3 py-1.5 text-sm bg-accent text-white rounded-md hover:opacity-90"
        >
          {t('common.auth.addProvider')}
        </button>
      </div>

      <div className="bg-surface-elevated rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-content-secondary">
              <th className="px-4 py-2">{t('common.auth.name')}</th>
              <th className="px-4 py-2">{t('common.auth.providerType')}</th>
              <th className="px-4 py-2">{t('common.auth.apiUrl')}</th>
              <th className="px-4 py-2">{t('common.auth.status')}</th>
              <th className="px-4 py-2 text-right">{t('common.auth.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {providers.map(provider => (
              <tr key={provider.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 text-content">{provider.name}</td>
                <td className="px-4 py-2">
                  <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                    {provider.provider_type}
                  </span>
                </td>
                <td className="px-4 py-2 text-content-secondary text-xs font-mono">{provider.api_base_url}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${provider.is_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {provider.is_enabled ? t('common.auth.active') : t('common.auth.disabled')}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => openEdit(provider)} className="text-xs text-content-secondary hover:text-content mr-2">
                    {t('common.operation.edit')}
                  </button>
                  <button onClick={() => handleToggle(provider)} className="text-xs text-content-secondary hover:text-content mr-2">
                    {provider.is_enabled ? t('common.auth.disable') : t('common.auth.enable')}
                  </button>
                  <button onClick={() => handleDelete(provider.id)} className="text-xs text-red-500 hover:text-red-700">
                    {t('common.auth.delete')}
                  </button>
                </td>
              </tr>
            ))}
            {providers.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-4 text-center text-content-secondary">{t('common.auth.noProviders')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <FormDialog
        open={showDialog}
        onClose={() => { setShowDialog(false); setEditingProvider(null) }}
        onConfirm={handleConfirm}
        title={isEditing ? t('common.auth.editProvider') : t('common.auth.createProvider')}
        confirmText={isEditing ? t('common.operation.save') : t('common.auth.create')}
        loading={saving}
      >
        {error && <div className="mb-3 p-2 bg-red-50 text-red-700 text-sm rounded">{error}</div>}
        <div className="space-y-3">
          <div>
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
          <div>
            <label className="block text-xs text-content-secondary mb-1">{t('common.auth.providerType')}</label>
            <select
              value={form.provider_type}
              onChange={e => handleProviderTypeChange(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm"
            >
              {providerTypes.map(pt => (
                <option key={pt} value={pt}>{pt}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-content-secondary mb-1">{t('common.auth.apiUrl')}</label>
            <input
              type="text"
              placeholder="https://api.example.com/v1"
              value={form.api_base_url}
              onChange={e => setForm({ ...form, api_base_url: e.target.value })}
              className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm font-mono"
              name="provider-apiurl"
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
              name="provider-apikey"
              autoComplete="new-password"
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
