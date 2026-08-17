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

export default function SystemConfigPage() {
  const { t } = useTranslation()
  const [models, setModels] = useState<ModelItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [systemModelId, setSystemModelId] = useState('')
  const [maxToolRounds, setMaxToolRounds] = useState('12')
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')

  useEffect(() => {
    Promise.all([
      fetch(`${BASE_PATH}/api/admin/models`).then(r => r.json()),
      fetch(`${BASE_PATH}/api/admin/system-config`).then(r => r.json()),
    ]).then(([modelsData, configData]) => {
      setModels((modelsData.models || []).filter((m: ModelItem) => m.is_enabled))

      const modelConfig = (configData.configs || []).find((c: { key: string }) => c.key === 'system_model_id')
      setSystemModelId(modelConfig?.value || '')

      const maxRoundsConfig = (configData.configs || []).find((c: { key: string }) => c.key === 'max_tool_rounds')
      setMaxToolRounds(maxRoundsConfig?.value || '12')
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
        { key: 'system_model_id', value: systemModelId },
        { key: 'max_tool_rounds', value: maxToolRounds },
      ]

      for (const update of updates) {
        const res = await fetch(`${BASE_PATH}/api/admin/system-config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update),
        })
        if (!res.ok) {
          const data = await res.json()
          setMessage(data.error || t('common.auth.saveFailed', '保存失败'))
          setMessageType('error')
          return
        }
      }

      setMessage(t('common.auth.saveSuccess', '保存成功'))
      setMessageType('success')
      setTimeout(() => setMessage(''), 3000)
    }
    catch {
      setMessage(t('common.auth.networkError', '网络错误'))
      setMessageType('error')
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

      <div className="bg-surface-elevated rounded-lg border border-border p-6">
        {/* 系统模型 */}
        <div>
          <h3 className="text-sm font-medium text-content mb-1">{t('common.auth.systemModel', '系统模型')}</h3>
          <p className="text-xs text-content-tertiary mb-4">
            {t('common.auth.systemModelDesc', '配置系统级 AI 模型，用于支持对话标题自动生成等系统功能。')}
          </p>
          <select
            value={systemModelId}
            onChange={e => setSystemModelId(e.target.value)}
            className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm"
          >
            <option value="">{t('common.auth.selectModel', '请选择模型')}</option>
            {models.map(m => (
              <option key={m.id} value={m.id}>
                {m.display_name} ({m.model_name})
              </option>
            ))}
          </select>
          <p className="text-xs text-content-tertiary mt-1">
            {t('common.auth.systemModelHint', '建议选择响应速度快、成本较低的模型。')}
          </p>
        </div>

        {/* 工具调用限制 */}
        <div className="mt-6 pt-6 border-t border-border">
          <h3 className="text-sm font-medium text-content mb-1">工具调用轮数上限</h3>
          <p className="text-xs text-content-tertiary mb-4">
            配置 ReAct 模式下工具调用的最大轮数。达到上限后强制总结并回复用户。
          </p>
          <input
            type="number"
            min={1}
            max={50}
            value={maxToolRounds}
            onChange={e => setMaxToolRounds(e.target.value)}
            className="w-32 px-3 py-2 bg-surface border border-border rounded text-content text-sm"
          />
          <p className="text-xs text-content-tertiary mt-1">
            建议保持默认值 12。设置过小可能导致复杂任务无法完成，设置过大可能导致无效重试消耗资源。
          </p>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-accent text-white rounded-md hover:opacity-90 disabled:opacity-50"
          >
            {saving ? t('common.auth.saving', '保存中...') : t('common.operation.save', '保存')}
          </button>
          {message && (
            <span className={`text-sm ${messageType === 'success' ? 'text-green-600' : 'text-red-500'}`}>{message}</span>
          )}
        </div>
      </div>
    </div>
  )
}
