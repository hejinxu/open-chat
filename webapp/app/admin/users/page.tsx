'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BASE_PATH } from '@/config'
import FormDialog from '@/app/components/base/form-dialog'

interface User {
  id: string
  name: string
  role: string
  is_enabled: boolean
  created_at: number
}

export default function UsersPage() {
  const { t } = useTranslation()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [form, setForm] = useState({ name: '', identifier: '', password: '', role: 'user' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const isEditing = !!editingUser

  const loadUsers = async () => {
    try {
      const res = await fetch(`${BASE_PATH}/api/admin/users`)
      const data = await res.json()
      setUsers(data.users || [])
    }
    catch {
      // ignore
    }
    finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadUsers() }, [])

  const openCreate = () => {
    setEditingUser(null)
    setForm({ name: '', identifier: '', password: '', role: 'user' })
    setError('')
    setShowDialog(true)
  }

  const openEdit = (user: User) => {
    setEditingUser(user)
    setForm({ name: user.name, identifier: '', password: '', role: user.role })
    setError('')
    setShowDialog(true)
  }

  const handleConfirm = async () => {
    setError('')
    setSaving(true)

    try {
      if (isEditing) {
        const res = await fetch(`${BASE_PATH}/api/admin/users`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingUser.id, name: form.name, role: form.role }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || t('common.auth.createFailed'))
          return
        }
      }
      else {
        const res = await fetch(`${BASE_PATH}/api/admin/users`, {
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
      setEditingUser(null)
      setForm({ name: '', identifier: '', password: '', role: 'user' })
      loadUsers()
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
    if (!confirm(t('common.auth.deleteUserConfirm'))) {
      return
    }

    try {
      await fetch(`${BASE_PATH}/api/admin/users`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      loadUsers()
    }
    catch {
      // ignore
    }
  }

  const handleToggle = async (user: User) => {
    try {
      await fetch(`${BASE_PATH}/api/admin/users`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, is_enabled: !user.is_enabled }),
      })
      loadUsers()
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
        <h2 className="text-lg font-medium text-content">{t('common.auth.users')}</h2>
        <button
          onClick={openCreate}
          className="px-3 py-1.5 text-sm bg-accent text-white rounded-md hover:opacity-90"
        >
          {t('common.auth.addUser')}
        </button>
      </div>

      <div className="bg-surface-elevated rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-content-secondary">
              <th className="px-4 py-2">{t('common.auth.name')}</th>
              <th className="px-4 py-2">{t('common.auth.role')}</th>
              <th className="px-4 py-2">{t('common.auth.status')}</th>
              <th className="px-4 py-2">{t('common.auth.created')}</th>
              <th className="px-4 py-2 text-right">{t('common.auth.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 text-content">{user.name}</td>
                <td className="px-4 py-2 text-content-secondary">{user.role}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${user.is_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {user.is_enabled ? t('common.auth.active') : t('common.auth.disabled')}
                  </span>
                </td>
                <td className="px-4 py-2 text-content-secondary">
                  {new Date(user.created_at * 1000).toLocaleDateString()}
                </td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => openEdit(user)} className="text-xs text-content-secondary hover:text-content mr-2">
                    {t('common.operation.edit')}
                  </button>
                  <button onClick={() => handleToggle(user)} className="text-xs text-content-secondary hover:text-content mr-2">
                    {user.is_enabled ? t('common.auth.disable') : t('common.auth.enable')}
                  </button>
                  <button onClick={() => handleDelete(user.id)} className="text-xs text-red-500 hover:text-red-700">
                    {t('common.auth.delete')}
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-4 text-center text-content-secondary">{t('common.auth.noUsers')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <FormDialog
        open={showDialog}
        onClose={() => { setShowDialog(false); setEditingUser(null) }}
        onConfirm={handleConfirm}
        title={isEditing ? t('common.auth.editUser') : t('common.auth.createUser')}
        confirmText={isEditing ? t('common.operation.save') : t('common.auth.create')}
        loading={saving}
      >
        {error && <div className="mb-3 p-2 bg-red-50 text-red-700 text-sm rounded">{error}</div>}
        <div className="space-y-3">
          <input
            type="text"
            placeholder={t('common.auth.displayName')}
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm"
            required
          />
          {!isEditing && (
            <>
              <input
                type="text"
                placeholder={t('common.auth.loginIdentifier')}
                value={form.identifier}
                onChange={e => setForm({ ...form, identifier: e.target.value })}
                className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm"
                required
              />
              <input
                type="password"
                placeholder={t('common.auth.password')}
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm"
                required
                minLength={6}
              />
            </>
          )}
          <select
            value={form.role}
            onChange={e => setForm({ ...form, role: e.target.value })}
            className="w-full px-3 py-2 bg-surface border border-border rounded text-content text-sm"
          >
            <option value="user">{t('common.auth.users')}</option>
            <option value="admin">{t('common.auth.admin')}</option>
          </select>
        </div>
      </FormDialog>
    </div>
  )
}
