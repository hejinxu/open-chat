'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BASE_PATH } from '@/config'

interface SystemConfig {
  key: string
  value: string
  description: string
  updated_at: number
}

export default function SystemConfigPage() {
  const { t } = useTranslation()
  const [configs, setConfigs] = useState<SystemConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  const loadConfigs = async () => {
    try {
      const res = await fetch(`${BASE_PATH}/api/admin/system-config`)
      const data = await res.json()
      setConfigs(data.configs || [])
    }
    catch {
      // ignore
    }
    finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadConfigs() }, [])

  const handleEdit = (config: SystemConfig) => {
    setEditingKey(config.key)
    setEditValue(config.value)
  }

  const handleSave = async (key: string) => {
    setSaving(true)
    try {
      const res = await fetch(`${BASE_PATH}/api/admin/system-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: editValue }),
      })
      if (res.ok) {
        setEditingKey(null)
        loadConfigs()
      }
    }
    catch {
      // ignore
    }
    finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-content-secondary">Loading...</div>
  }

  return (
    <div>
      <h2 className="text-lg font-medium text-content mb-4">{t('common.auth.systemConfig', '系统配置')}</h2>

      <div className="bg-surface-elevated rounded-lg border border-border overflow-hidden max-w-3xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-content-secondary">
              <th className="px-4 py-2">配置项</th>
              <th className="px-4 py-2">值</th>
              <th className="px-4 py-2">说明</th>
              <th className="px-4 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {configs.map(config => (
              <tr key={config.key} className="border-b border-border last:border-0">
                <td className="px-4 py-2 text-content font-mono text-xs">{config.key}</td>
                <td className="px-4 py-2 text-content">
                  {editingKey === config.key
                    ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        className="w-full px-2 py-1 bg-surface border border-border rounded text-content text-sm"
                      />
                    )
                    : (
                      <span className="text-content-secondary">{config.value || '(空)'}</span>
                    )}
                </td>
                <td className="px-4 py-2 text-content-tertiary text-xs">{config.description}</td>
                <td className="px-4 py-2 text-right">
                  {editingKey === config.key
                    ? (
                      <>
                        <button
                          onClick={() => handleSave(config.key)}
                          disabled={saving}
                          className="text-xs text-accent hover:opacity-80 mr-2"
                        >
                          保存
                        </button>
                        <button
                          onClick={() => setEditingKey(null)}
                          className="text-xs text-content-tertiary hover:text-content"
                        >
                          取消
                        </button>
                      </>
                    )
                    : (
                      <button
                        onClick={() => handleEdit(config)}
                        className="text-xs text-content-secondary hover:text-content"
                      >
                        {t('common.operation.edit')}
                      </button>
                    )}
                </td>
              </tr>
            ))}
            {configs.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-4 text-center text-content-secondary">暂无配置项</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
