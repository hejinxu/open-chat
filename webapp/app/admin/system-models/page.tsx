'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BASE_PATH } from '@/config'

interface ModelItem {
  id: string
  display_name: string
  model_name: string
  provider_id: string
  is_enabled: boolean
}

interface SystemConfig {
  key: string
  value: string
  description: string
}

export default function SystemModelsPage() {
  const { t } = useTranslation()
  const [models, setModels] = useState<ModelItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [titleModelId, setTitleModelId] = useState('')
  const [titleEnabled, setTitleEnabled] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    Promise.all([
      fetch(`${BASE_PATH}/api/admin/models`).then(r => r.json()),
      fetch(`${BASE_PATH}/api/admin/system-config`).then(r => r.json()),
    ]).then(([modelsData, configData]) => {
      setModels((modelsData.models || []).filter((m: ModelItem) => m.is_enabled))

      const titleModelConfig = (configData.configs || []).find((c: SystemConfig) => c.key === 'title_summarization_model_id')
      const titleEnabledConfig = (configData.configs || []).find((c: SystemConfig) => c.key === 'title_summarization_enabled')

      setTitleModelId(titleModelConfig?.value || '')
      setTitleEnabled(titleEnabledConfig?.value === 'true')
    }).catch(() => {
      // ignore
    }).finally(() => {
      setLoading(false)
    })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    try {
      const updates = [
        { key: 'title_summarization_model_id', value: titleModelId },
        { key: 'title_summarization_enabled', value: String(titleEnabled) },
      ]

      for (const update of updates) {
        const res = await fetch(`${BASE_PATH}/api/admin/system-config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update),
        })
        if (!res.ok) {
          const data = await res.json()
          setMessage(data.error || '保存失败')
          return
        }
      }

      setMessage('保存成功')
      setTimeout(() => setMessage(''), 3000)
    }
    catch {
      setMessage('网络错误')
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
      <h2 className="text-lg font-medium text-content mb-4">{t('common.auth.systemModelSettings', '系统模型设置')}</h2>

      <div className="bg-surface-elevated rounded-lg border border-border p-6 max-w-2xl">
        <h3 className="text-sm font-medium text-content mb-1">{t('common.auth.titleSummarization', '对话标题总结')}</h3>
        <p className="text-xs text-content-tertiary mb-4">
          配置用于自动总结对话标题的 AI 模型。启用后，新对话的 AI 回复完成后会自动生成语义化标题。禁用时使用用户首条消息前 30 字截取。
        </p>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm text-content">{t('common.auth.titleSummarizationEnabled', '启用 AI 标题总结')}</label>
              <p className="text-xs text-content-tertiary mt-0.5">{t('common.auth.titleSummarizationDisabled', '禁用时使用前30字截取')}</p>
            </div>
            <button
              type="button"
              onClick={() => setTitleEnabled(!titleEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${titleEnabled ? 'bg-accent' : 'bg-surface-hover'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${titleEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          <div>
            <label className="block text-sm text-content mb-1">{t('common.auth.titleSummarizationModel', '标题总结模型')}</label>
            <select
              value={titleModelId}
              onChange={e => setTitleModelId(e.target.value)}
              disabled={!titleEnabled}
              className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm disabled:opacity-50"
            >
              <option value="">请选择模型</option>
              {models.map(m => (
                <option key={m.id} value={m.id}>
                  {m.display_name} ({m.model_name})
                </option>
              ))}
            </select>
            <p className="text-xs text-content-tertiary mt-1">
              从模型库中选择一个模型用于标题总结，建议选择轻量级、低成本的模型。
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-accent text-white rounded-md hover:opacity-90 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
          {message && (
            <span className={`text-sm ${message === '保存成功' ? 'text-green-600' : 'text-red-500'}`}>{message}</span>
          )}
        </div>
      </div>
    </div>
  )
}
