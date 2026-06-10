'use client'

import { useState } from 'react'
import useSWR from 'swr'
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
      setFormError('Invalid JSON config')
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
          setFormError(data.error || 'Failed to update')
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
          setFormError(data.error || 'Failed to create')
          return
        }
      }

      setShowDialog(false)
      setEditingServer(null)
      mutate()
    } catch {
      setFormError('Network error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    // eslint-disable-next-line no-alert
    if (!confirm('Are you sure you want to delete this MCP server?')) {
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
        <h2 className="text-lg font-medium text-content">MCP Servers</h2>
        <button
          onClick={openCreate}
          className="px-3 py-1.5 text-sm bg-accent text-white rounded-md hover:opacity-90"
        >
          Add MCP Server
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded mb-4">
          Failed to load MCP servers
        </div>
      )}

      <div className="bg-surface-elevated rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-content-secondary">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Transport</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
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
                    {server.is_enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEdit(server)}
                      className="text-xs text-accent hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(server.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {servers.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-content-secondary">
                  No MCP servers configured
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
              {editingServer ? 'Edit MCP Server' : 'Add MCP Server'}
            </h3>

            {formError && (
              <div className="bg-red-50 text-red-700 p-2 rounded mb-4 text-sm">
                {formError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-content-secondary mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm"
                  placeholder="my-mcp-server"
                />
              </div>

              <div>
                <label className="block text-xs text-content-secondary mb-1">Display Name</label>
                <input
                  type="text"
                  value={form.display_name}
                  onChange={e => setForm({ ...form, display_name: e.target.value })}
                  className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm"
                  placeholder="My MCP Server"
                />
              </div>

              <div>
                <label className="block text-xs text-content-secondary mb-1">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm"
                />
              </div>

              <div>
                <label className="block text-xs text-content-secondary mb-1">Transport</label>
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
                <label className="block text-xs text-content-secondary mb-1">Config (JSON)</label>
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
                Enabled
              </label>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => { setShowDialog(false); setEditingServer(null) }}
                className="px-4 py-2 text-sm text-content-secondary hover:text-content"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm bg-accent text-white rounded-md hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Saving...' : (editingServer ? 'Save' : 'Create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
