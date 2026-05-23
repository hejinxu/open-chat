'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BASE_PATH } from '@/config'
import FormDialog from '@/app/components/base/form-dialog'

interface Integration {
  id: string
  name: string
  description: string
  app_id: string
  is_enabled: boolean
  created_at: number
}

interface ApiKey {
  id: string
  name: string
  key_prefix: string
  is_enabled: boolean
  last_used_at: number | null
  created_at: number
}

export default function IntegrationsPage() {
  const { t } = useTranslation()
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editingIntegration, setEditingIntegration] = useState<Integration | null>(null)
  const [form, setForm] = useState({ name: '', description: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const isEditing = !!editingIntegration

  // Key management
  const [selectedIntegration, setSelectedIntegration] = useState<string | null>(null)
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [keysLoading, setKeysLoading] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)

  const loadIntegrations = async () => {
    try {
      const res = await fetch(`${BASE_PATH}/api/admin/integrations`)
      const data = await res.json()
      setIntegrations(data.integrations || [])
    }
    catch {
      // ignore
    }
    finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadIntegrations() }, [])

  const openCreate = () => {
    setEditingIntegration(null)
    setForm({ name: '', description: '' })
    setError('')
    setShowDialog(true)
  }

  const openEdit = (integration: Integration) => {
    setEditingIntegration(integration)
    setForm({ name: integration.name, description: integration.description })
    setError('')
    setShowDialog(true)
  }

  const handleConfirm = async () => {
    setError('')
    setSaving(true)

    try {
      if (isEditing) {
        const res = await fetch(`${BASE_PATH}/api/admin/integrations`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingIntegration.id, name: form.name, description: form.description }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || t('common.auth.createFailed'))
          return
        }
      }
      else {
        const res = await fetch(`${BASE_PATH}/api/admin/integrations`, {
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
      setEditingIntegration(null)
      setForm({ name: '', description: '' })
      loadIntegrations()
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
    if (!confirm(t('common.auth.deleteIntegrationConfirm'))) {
      return
    }

    try {
      await fetch(`${BASE_PATH}/api/admin/integrations`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      loadIntegrations()
    }
    catch {
      // ignore
    }
  }

  const loadKeys = async (integrationId: string) => {
    setSelectedIntegration(integrationId)
    setKeysLoading(true)
    try {
      const res = await fetch(`${BASE_PATH}/api/admin/integrations/${integrationId}/keys`)
      const data = await res.json()
      setKeys(data.keys || [])
    }
    catch {
      // ignore
    }
    finally {
      setKeysLoading(false)
    }
  }

  const handleGenerateKey = async () => {
    if (!selectedIntegration || !newKeyName) {
      return
    }

    try {
      const res = await fetch(`${BASE_PATH}/api/admin/integrations/${selectedIntegration}/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName }),
      })
      const data = await res.json()

      if (data.key) {
        setGeneratedKey(data.key.key)
        setNewKeyName('')
        loadKeys(selectedIntegration)
      }
    }
    catch {
      // ignore
    }
  }

  const handleRevokeKey = async (keyId: string) => {
    if (!selectedIntegration) {
      return
    }
    // eslint-disable-next-line no-alert
    if (!confirm(t('common.auth.revokeKeyConfirm'))) {
      return
    }

    try {
      await fetch(`${BASE_PATH}/api/admin/integrations/${selectedIntegration}/keys`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: keyId }),
      })
      loadKeys(selectedIntegration)
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
        <h2 className="text-lg font-medium text-content">{t('common.auth.integrations')}</h2>
        <button
          onClick={openCreate}
          className="px-3 py-1.5 text-sm bg-accent text-white rounded-md hover:opacity-90"
        >
          {t('common.auth.addIntegration')}
        </button>
      </div>

      <div className="bg-surface-elevated rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-content-secondary">
              <th className="px-4 py-2">{t('common.auth.name')}</th>
              <th className="px-4 py-2">{t('common.auth.appId')}</th>
              <th className="px-4 py-2">{t('common.auth.status')}</th>
              <th className="px-4 py-2">{t('common.auth.created')}</th>
              <th className="px-4 py-2 text-right">{t('common.auth.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {integrations.map(integration => (
              <tr key={integration.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 text-content">{integration.name}</td>
                <td className="px-4 py-2 text-content-secondary font-mono text-xs">{integration.app_id}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${integration.is_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {integration.is_enabled ? t('common.auth.active') : t('common.auth.disabled')}
                  </span>
                </td>
                <td className="px-4 py-2 text-content-secondary">
                  {new Date(integration.created_at * 1000).toLocaleDateString()}
                </td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => openEdit(integration)} className="text-xs text-content-secondary hover:text-content mr-2">
                    {t('common.operation.edit')}
                  </button>
                  <button onClick={() => loadKeys(integration.id)} className="text-xs text-content-secondary hover:text-content mr-2">
                    {t('common.auth.apiKey')}
                  </button>
                  <button onClick={() => handleDelete(integration.id)} className="text-xs text-red-500 hover:text-red-700">
                    {t('common.auth.delete')}
                  </button>
                </td>
              </tr>
            ))}
            {integrations.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-4 text-center text-content-secondary">{t('common.auth.noIntegrations')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* API Keys Panel */}
      {selectedIntegration && (
        <div className="mt-6 p-4 bg-surface-elevated rounded-lg border border-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-content">{t('common.auth.apiKey')}</h3>
            <button onClick={() => setSelectedIntegration(null)} className="text-xs text-content-secondary hover:text-content">{t('common.operation.cancel')}</button>
          </div>

          {/* Generate key */}
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              placeholder={t('common.auth.keyName')}
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              className="flex-1 px-3 py-1.5 bg-surface border border-border rounded text-content text-sm"
            />
            <button
              onClick={handleGenerateKey}
              disabled={!newKeyName}
              className="px-3 py-1.5 text-sm bg-accent text-white rounded hover:opacity-90 disabled:opacity-50"
            >
              {t('common.auth.generateKey')}
            </button>
          </div>

          {/* Show generated key */}
          {generatedKey && (
            <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
              <p className="text-xs text-yellow-700 mb-1">{t('common.auth.keyWarning')}</p>
              <code className="text-sm text-yellow-900 font-mono break-all">{generatedKey}</code>
              <button onClick={() => setGeneratedKey(null)} className="ml-2 text-xs text-yellow-600 hover:text-yellow-800">{t('common.auth.dismiss')}</button>
            </div>
          )}

          {/* Keys list */}
          {keysLoading && <div className="text-sm text-content-secondary">Loading...</div>}
          {!keysLoading && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-content-secondary">
                  <th className="px-3 py-1.5">{t('common.auth.name')}</th>
                  <th className="px-3 py-1.5">{t('common.auth.keyPrefix')}</th>
                  <th className="px-3 py-1.5">{t('common.auth.status')}</th>
                  <th className="px-3 py-1.5">{t('common.auth.lastUsed')}</th>
                  <th className="px-3 py-1.5 text-right">{t('common.auth.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {keys.map(key => (
                  <tr key={key.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-1.5 text-content">{key.name}</td>
                    <td className="px-3 py-1.5 text-content-secondary font-mono text-xs">{key.key_prefix}...</td>
                    <td className="px-3 py-1.5">
                      <span className={`text-xs px-2 py-0.5 rounded ${key.is_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {key.is_enabled ? t('common.auth.active') : t('common.auth.disabled')}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-content-secondary text-xs">
                      {key.last_used_at ? new Date(key.last_used_at * 1000).toLocaleString() : t('common.auth.never')}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <button onClick={() => handleRevokeKey(key.id)} className="text-xs text-red-500 hover:text-red-700">
                        {t('common.auth.revoke')}
                      </button>
                    </td>
                  </tr>
                ))}
                {keys.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-3 text-center text-content-secondary text-xs">{t('common.auth.noIntegrations')}</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      <FormDialog
        open={showDialog}
        onClose={() => { setShowDialog(false); setEditingIntegration(null) }}
        onConfirm={handleConfirm}
        title={isEditing ? t('common.auth.editIntegration') : t('common.auth.createIntegration')}
        confirmText={isEditing ? t('common.operation.save') : t('common.auth.create')}
        loading={saving}
      >
        {error && <div className="mb-3 p-2 bg-red-50 text-red-700 text-sm rounded">{error}</div>}
        <div className="space-y-3">
          <input
            type="text"
            placeholder={t('common.auth.name')}
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm"
            required
          />
          <input
            type="text"
            placeholder={t('common.auth.description')}
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm"
          />
        </div>
      </FormDialog>
    </div>
  )
}
