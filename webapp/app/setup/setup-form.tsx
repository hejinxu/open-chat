'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { BASE_PATH } from '@/config'
import '@/i18n/i18next-config'

export default function SetupForm() {
  const { t } = useTranslation()
  const router = useRouter()
  const [name, setName] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [countdown, setCountdown] = useState(3)
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (redirectTimer.current) {
        clearTimeout(redirectTimer.current)
      }
      if (countdownTimer.current) {
        clearInterval(countdownTimer.current)
      }
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError(t('common.auth.passwordsDoNotMatch'))
      return
    }

    if (password.length < 6) {
      setError(t('common.auth.passwordTooShort'))
      return
    }

    setLoading(true)

    try {
      const res = await fetch(`${BASE_PATH}/api/auth/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, identifier, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || t('common.auth.createFailed'))
        return
      }

      setSuccess(true)
      setCountdown(3)
      countdownTimer.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (countdownTimer.current)
              clearInterval(countdownTimer.current)
            router.push('/login')
            return 0
          }
          return prev - 1
        })
      }, 1000)
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
        <h1 className="text-xl font-semibold text-content mb-2 text-center">{t('common.auth.setup')}</h1>
        <p className="text-sm text-content-secondary mb-6 text-center">
          {t('common.auth.createAdminAccount')}
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-green-700 text-sm">
            {t('common.auth.setupSuccess')}（{countdown}s）
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">
              {t('common.auth.displayName')}
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content focus:outline-none focus:ring-2 focus:ring-accent"
              required
              autoFocus
              disabled={success}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">
              {t('common.auth.loginIdentifier')}
            </label>
            <input
              type="text"
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content focus:outline-none focus:ring-2 focus:ring-accent"
              required
              disabled={success}
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
              minLength={6}
              disabled={success}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">
              {t('common.auth.confirmPassword')}
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content focus:outline-none focus:ring-2 focus:ring-accent"
              required
              minLength={6}
              disabled={success}
            />
          </div>

          <button
            type="submit"
            disabled={loading || success}
            className="w-full py-2 px-4 bg-accent text-white rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? t('common.auth.settingUp') : t('common.auth.createAdminAccount')}
          </button>
        </form>
      </div>
    </div>
  )
}
