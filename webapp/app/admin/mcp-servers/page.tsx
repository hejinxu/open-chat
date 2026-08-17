'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useTranslation } from 'react-i18next'
import { BASE_PATH } from '@/config'

interface MCPServer {
  id: string
  name: string
  display_name: string
  description: string
  transport: string
  config: string
  is_enabled: boolean
  last_connected_at: number | null
  created_at: number
  updated_at: number
}

const fetcher = (url: string) => fetch(url).then(res => res.json())

export default function MCPServersPage() {
  const { t } = useTranslation()
  const { data, error, mutate } = useSWR<{ servers: MCPServer[] }>(`${BASE_PATH}/api/admin/mcp-servers`, fetcher)
  const [showDialog, setShowDialog] = useState(false)
  const [editingServer, setEditingServer] = useState<MCPServer | null>(null)
  const [form, setForm] = useState({
    name: '',
    display_name: '',
    description: '',
    transport: 'stdio',
    config: '{}',
    is_enabled: true,
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const servers = data?.servers || []

  const openCreate = () => {
    setEditingServer(null)
    setForm({
      name: '',
      display_name: '',
      description: '',
      transport: 'stdio',
      config: '{}',
      is_enabled: true,
    })
    setFormError('')
    setShowDialog(true)
  }

  const openEdit = (server: MCPServer) => {
    setEditingServer(server)
    setForm({
      name: server.name,
      display_name: server.display_name,
      description: server.description,
      transport: server.transport,
      config: server.config,
      is_enabled: server.is_enabled,
    })
    setFormError('')
    setShowDialog(true)
  }

  const handleSave = async () => {
    setFormError('')
    setSaving(true)

    let configObj: Record<string, any> = {}
    try {
      if (form.config.trim()) {
        configObj = JSON.parse(form.config)
      }
    } catch {
      setFormError(t('common.auth.invalidJsonConfig', '无效的 JSON 配置'))
      setSaving(false)
      return
    }

    try {
      const payload = {
        ...form,
        config: configObj,
      }

      if (editingServer) {
        const res = await fetch(`${BASE_PATH}/api/admin/mcp-servers`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingServer.id, ...payload }),
        })
        if (!res.ok) {
          const data = await res.json()
          setFormError(data.error || t('common.auth.updateFailed', '更新失败'))
          return
        }
      } else {
        const res = await fetch(`${BASE_PATH}/api/admin/mcp-servers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const data = await res.json()
          setFormError(data.error || t('common.auth.createFailed', '创建失败'))
          return
        }
      }

      setShowDialog(false)
      setEditingServer(null)
      mutate()
    } catch {
      setFormError(t('common.auth.networkError', '网络错误'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    // eslint-disable-next-line no-alert
    if (!confirm(t('common.auth.deleteMcpConfirm', '确定要删除此 MCP 服务器吗？'))) {
      return
    }

    try {
      await fetch(`${BASE_PATH}/api/admin/mcp-servers`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      mutate()
    } catch {
      // ignore
    }
  }

  const handleToggle = async (server: MCPServer) => {
    try {
      await fetch(`${BASE_PATH}/api/admin/mcp-servers`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: server.id, is_enabled: !server.is_enabled }),
      })
      mutate()
    } catch {
      // ignore
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-content">{t('common.auth.mcpServers', 'MCP Servers')}</h2>
        <button
          onClick={openCreate}
          className="px-3 py-1.5 text-sm bg-accent text-white rounded-md hover:opacity-90"
        >
          {t('common.auth.addMcpServer', '添加 MCP Server')}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded mb-4">
          {t('common.auth.loadMcpFailed', '加载 MCP 服务器失败')}
        </div>
      )}

      <div className="bg-surface-elevated rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-content-secondary">
              <th className="px-4 py-3 font-medium">{t('common.auth.name', '名称')}</th>
              <th className="px-4 py-3 font-medium">{t('common.auth.transport', '传输方式')}</th>
              <th className="px-4 py-3 font-medium">{t('common.auth.status', '状态')}</th>
              <th className="px-4 py-3 font-medium">{t('common.auth.actions', '操作')}</th>
            </tr>
          </thead>
          <tbody>
            {servers.map(server => (
              <tr key={server.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-content">{server.display_name}</div>
                  <div className="text-xs text-content-secondary">{server.name}</div>
                </td>
                <td className="px-4 py-3">
                  <span className="px-2 py-1 text-xs rounded bg-surface-hover text-content-secondary">
                    {server.transport}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleToggle(server)}
                    className={`px-2 py-1 text-xs rounded ${
                      server.is_enabled
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {server.is_enabled ? t('common.auth.enabled', '启用') : t('common.auth.disabled', '禁用')}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEdit(server)}
                      className="text-xs text-accent hover:underline"
                    >
                      {t('common.operation.edit', '编辑')}
                    </button>
                    <button
                      onClick={() => handleDelete(server.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      {t('common.auth.delete', '删除')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {servers.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-content-secondary">
                  {t('common.auth.noMcpServers', '暂未配置 MCP 服务器')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface-elevated rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-content mb-4">
              {editingServer ? t('common.auth.editMcpServer', '编辑 MCP Server') : t('common.auth.addMcpServer', '添加 MCP Server')}
            </h3>

            {formError && (
              <div className="bg-red-50 text-red-700 p-2 rounded mb-4 text-sm">
                {formError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-content-secondary mb-1">{t('common.auth.name', '名称')}</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm"
                  placeholder="my-mcp-server"
                />
              </div>

              <div>
                <label className="block text-xs text-content-secondary mb-1">{t('common.auth.displayName', '显示名称')}</label>
                <input
                  type="text"
                  value={form.display_name}
                  onChange={e => setForm({ ...form, display_name: e.target.value })}
                  className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm"
                  placeholder="My MCP Server"
                />
              </div>

              <div>
                <label className="block text-xs text-content-secondary mb-1">{t('common.auth.description', '描述')}</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm"
                />
              </div>

              <div>
                <label className="block text-xs text-content-secondary mb-1">{t('common.auth.transport', '传输方式')}</label>
                <select
                  value={form.transport}
                  onChange={e => setForm({ ...form, transport: e.target.value })}
                  className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm"
                >
                  <option value="stdio">STDIO</option>
                  <option value="http">HTTP</option>
                  <option value="sse">SSE</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-content-secondary mb-1">{t('common.auth.configJson', '配置 (JSON)')}</label>
                <textarea
                  value={form.config}
                  onChange={e => setForm({ ...form, config: e.target.value })}
                  className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm font-mono h-32 resize-none"
                  placeholder='{"command": "npx", "args": ["-y", "@modelcontextprotocol/server-math"]}'
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-content">
                <input
                  type="checkbox"
                  checked={form.is_enabled}
                  onChange={e => setForm({ ...form, is_enabled: e.target.checked })}
                  className="rounded border-border"
                />
                {t('common.auth.enabled', '启用')}
              </label>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => { setShowDialog(false); setEditingServer(null) }}
                className="px-4 py-2 text-sm text-content-secondary hover:text-content"
              >
                {t('common.operation.cancel', '取消')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm bg-accent text-white rounded-md hover:opacity-90 disabled:opacity-50"
              >
                {saving ? t('common.auth.saving', '保存中...') : (editingServer ? t('common.operation.save', '保存') : t('common.auth.create', '创建'))}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
