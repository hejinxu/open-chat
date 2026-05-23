'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BASE_PATH } from '@/config'
import '@/i18n/i18next-config'

export default function LoginPage() {
  const { t } = useTranslation()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch(`${BASE_PATH}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || t('common.auth.invalidCredentials'))
        return
      }

      window.location.href = `${BASE_PATH}/`
    }
    catch {
      setError(t('common.auth.networkError'))
    }
    finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center h-full bg-surface">
      <div className="w-full max-w-sm p-8 bg-surface-elevated rounded-lg shadow-lg">
        <h1 className="text-xl font-semibold text-content mb-6 text-center">{t('common.auth.login')}</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">
              {t('common.auth.identifier')}
            </label>
            <input
              type="text"
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content focus:outline-none focus:ring-2 focus:ring-accent"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">
              {t('common.auth.password')}
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content focus:outline-none focus:ring-2 focus:ring-accent"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-accent text-white rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? t('common.auth.loggingIn') : t('common.auth.login')}
          </button>
        </form>
      </div>
    </div>
  )
}
