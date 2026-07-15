'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BASE_PATH } from '@/config'
import { useTheme } from '@/hooks/use-theme'
import '@/i18n/i18next-config'

export default function LoginPage() {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [captchaInput, setCaptchaInput] = useState('')
  const [captchaId, setCaptchaId] = useState('')
  const [captchaSvg, setCaptchaSvg] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const fetchCaptcha = useCallback(async () => {
    try {
      const isDark = resolvedTheme === 'dark' || resolvedTheme === 'tech-blue'
      const res = await fetch(`${BASE_PATH}/api/auth/captcha?theme=${isDark ? 'dark' : 'light'}`)
      const data = await res.json()
      setCaptchaId(data.captchaId)
      setCaptchaSvg(data.svg)
      setCaptchaInput('')
    }
    catch {
      console.error('Failed to fetch captcha')
    }
  }, [resolvedTheme])

  useEffect(() => {
    fetchCaptcha()
  }, [fetchCaptcha])

  const refreshCaptcha = () => {
    fetchCaptcha()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch(`${BASE_PATH}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password, captchaId, captcha: captchaInput }),
      })

      const data = await res.json()

      if (!res.ok) {
        const errorCodeMap: Record<string, string> = {
          INVALID_CAPTCHA: t('common.auth.invalidCaptcha'),
          INVALID_CREDENTIALS: t('common.auth.invalidCredentials'),
          ACCOUNT_DISABLED: t('common.auth.accountDisabled'),
        }
        setError(errorCodeMap[data.code] || data.error || t('common.auth.invalidCredentials'))
        refreshCaptcha()
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
              autoComplete="off"
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
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">
              {t('common.auth.captcha')}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={captchaInput}
                onChange={e => setCaptchaInput(e.target.value)}
                className="flex-1 px-3 py-2 bg-surface border border-border rounded-md text-content focus:outline-none focus:ring-2 focus:ring-accent"
                required
                maxLength={4}
                autoComplete="off"
              />
              <div
                className="w-[120px] h-10 shrink-0 overflow-hidden cursor-pointer rounded"
                onClick={refreshCaptcha}
                title={t('common.auth.refreshCaptcha')}
              >
                <div
                  className="w-full h-full [&>svg]:w-full [&>svg]:h-full [&>svg]:block"
                  dangerouslySetInnerHTML={{ __html: captchaSvg }}
                />
              </div>
            </div>
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
