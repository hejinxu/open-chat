'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BASE_PATH } from '@/config'

interface SystemPrompt {
  id: string
  name: string
  description: string
  content: string
  created_at: number
  updated_at: number
}

export default function SystemPromptsPage() {
  const { t } = useTranslation()
  const [prompts, setPrompts] = useState<SystemPrompt[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState<SystemPrompt | null>(null)
  const [previewPrompt, setPreviewPrompt] = useState<SystemPrompt | null>(null)
  const [form, setForm] = useState({
    name: '',
    description: '',
    content: '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const isEditing = !!editingPrompt

  const loadPrompts = async () => {
    try {
      const res = await fetch(`${BASE_PATH}/api/admin/system-prompts`)
      const data = await res.json()
      setPrompts(data.system_prompts || [])
    }
    catch {
      // ignore
    }
    finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadPrompts() }, [])

  const openCreate = () => {
    setEditingPrompt(null)
    setForm({ name: '', description: '', content: '' })
    setError('')
    setShowDialog(true)
  }

  const openEdit = (prompt: SystemPrompt) => {
    setEditingPrompt(prompt)
    setForm({
      name: prompt.name,
      description: prompt.description,
      content: prompt.content,
    })
    setError('')
    setShowDialog(true)
  }

  const handleConfirm = async () => {
    setError('')
    setSaving(true)

    try {
      if (isEditing) {
        const res = await fetch(`${BASE_PATH}/api/admin/system-prompts`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingPrompt!.id, ...form }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || t('common.auth.createFailed'))
          return
        }
      }
      else {
        const res = await fetch(`${BASE_PATH}/api/admin/system-prompts`, {
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
      setEditingPrompt(null)
      loadPrompts()
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
    if (!confirm(t('common.auth.deleteSystemPromptConfirm', '确定要删除此内置提示词吗？'))) {
      return
    }

    try {
      await fetch(`${BASE_PATH}/api/admin/system-prompts`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      loadPrompts()
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
        <h2 className="text-lg font-medium text-content">{t('common.auth.systemPrompts', '内置提示词管理')}</h2>
        <button
          onClick={openCreate}
          className="px-3 py-1.5 text-sm bg-accent text-white rounded-md hover:opacity-90"
        >
          + {t('common.auth.addSystemPrompt', '新增提示词')}
        </button>
      </div>

      <div className="space-y-3">
        {prompts.map(prompt => (
          <div key={prompt.id} className="bg-surface-elevated rounded-lg border border-border p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">📋</span>
                  <span className="font-medium text-content">{prompt.name}</span>
                </div>
                {prompt.description && (
                  <p className="text-sm text-content-secondary mb-2">{prompt.description}</p>
                )}
                <p className="text-xs text-content-tertiary line-clamp-2">
                  {prompt.content.substring(0, 150)}...
                </p>
                <p className="text-xs text-content-tertiary mt-2">
                  {t('common.auth.createdAt', '创建时间')}: {new Date(prompt.created_at * 1000).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={() => setPreviewPrompt(prompt)}
                  className="text-xs text-content-secondary hover:text-content px-2 py-1 rounded hover:bg-surface-hover"
                >
                  {t('common.auth.preview', '预览')}
                </button>
                <button
                  onClick={() => openEdit(prompt)}
                  className="text-xs text-content-secondary hover:text-content px-2 py-1 rounded hover:bg-surface-hover"
                >
                  {t('common.operation.edit')}
                </button>
                <button
                  onClick={() => handleDelete(prompt.id)}
                  className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
                >
                  {t('common.auth.delete')}
                </button>
              </div>
            </div>
          </div>
        ))}
        {prompts.length === 0 && (
          <div className="text-center py-8 text-content-secondary">
            {t('common.auth.noSystemPrompts', '暂无内置提示词')}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface-elevated rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="text-lg font-medium text-content">
                {isEditing ? t('common.auth.editSystemPrompt', '编辑提示词') : t('common.auth.createSystemPrompt', '新增提示词')}
              </h3>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh] space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-content mb-1">{t('common.auth.name')}</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content text-sm"
                  required
                />
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
                <label className="block text-sm font-medium text-content mb-1">{t('common.auth.content', '内容')}</label>
                <textarea
                  value={form.content}
                  onChange={e => setForm({ ...form, content: e.target.value })}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content text-sm font-mono h-64 resize-y"
                  required
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-4 border-t border-border">
              <button
                onClick={() => { setShowDialog(false); setEditingPrompt(null) }}
                className="px-4 py-2 text-sm text-content-secondary hover:text-content"
              >
                {t('common.operation.cancel')}
              </button>
              <button
                onClick={handleConfirm}
                disabled={saving || !form.name || !form.content}
                className="px-4 py-2 text-sm bg-accent text-white rounded-md hover:opacity-90 disabled:opacity-50"
              >
                {saving ? t('common.auth.saving') : (isEditing ? t('common.operation.save') : t('common.auth.create'))}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Dialog */}
      {previewPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface-elevated rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="text-lg font-medium text-content">{previewPrompt.name}</h3>
              <button
                onClick={() => setPreviewPrompt(null)}
                className="text-content-secondary hover:text-content"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[70vh]">
              <pre className="whitespace-pre-wrap text-sm text-content font-mono">{previewPrompt.content}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
