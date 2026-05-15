'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { BASE_PATH } from '@/config'
import '@/i18n/i18next-config'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<{ id: string, name: string, role: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${BASE_PATH}/api/auth/me`)
      .then(res => res.json())
      .then((data) => {
        if (data.user) {
          if (data.user.role !== 'admin') {
            window.location.href = `${BASE_PATH}/`
            return
          }
          setUser(data.user)
        }
        else {
          router.push('/login')
        }
      })
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false))
  }, [router])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-content-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  const tabs = [
    { name: t('common.auth.users'), href: '/admin/users' },
    { name: t('common.auth.integrations'), href: '/admin/integrations' },
  ] as const

  return (
    <div className="flex flex-col h-full bg-surface">
      <div className="border-b border-border px-6 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-content">{t('common.auth.admin')}</h1>
          <button
            onClick={() => { window.location.href = `${BASE_PATH}/` }}
            className="text-sm text-content-secondary hover:text-content transition-colors"
          >
            {t('common.auth.backToChat')}
          </button>
        </div>
        <nav className="flex gap-4 mt-3">
          {tabs.map(tab => (
            <button
              key={tab.href}
              onClick={() => router.push(tab.href)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                pathname === tab.href
                  ? 'bg-accent text-white'
                  : 'text-content-secondary hover:text-content hover:bg-surface-hover'
              }`}
            >
              {tab.name}
            </button>
          ))}
        </nav>
      </div>
      <div className="flex-1 overflow-auto p-6">
        {children}
      </div>
    </div>
  )
}
