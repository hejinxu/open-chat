'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { Bars3Icon } from '@heroicons/react/24/outline'
import { BASE_PATH } from '@/config'
import '@/i18n/i18next-config'
import UserMenu from '@/app/components/admin/user-menu'

interface MenuItem {
  name: string
  href: string
  icon: string
}

interface MenuGroup {
  title: string
  items: MenuItem[]
}

const SIDEBAR_COLLAPSED_KEY = 'admin-sidebar-collapsed'

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
  const [collapsed, setCollapsed] = useState(false)

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

  useEffect(() => {
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
    if (saved === 'true') { setCollapsed(true) }
  }, [])

  const toggleSidebar = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
  }

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

  const menuGroups: MenuGroup[] = [
    {
      title: t('common.auth.agentManagement', '智能体管理'),
      items: [
        { name: t('common.auth.agents'), href: '/admin/agents', icon: '🤖' },
        { name: t('common.auth.agentTypes', '智能体类型'), href: '/admin/agent-types', icon: '📂' },
        { name: t('common.auth.systemPrompts', '内置提示词'), href: '/admin/system-prompts', icon: '📝' },
      ],
    },
    {
      title: t('common.auth.modelManagement', '模型管理'),
      items: [
        { name: t('common.auth.modelProviders'), href: '/admin/model-providers', icon: '🔌' },
        { name: t('common.auth.models'), href: '/admin/models', icon: '📦' },
      ],
    },
    {
      title: t('common.auth.systemManagement', '系统管理'),
      items: [
        { name: t('common.auth.users'), href: '/admin/users', icon: '👥' },
        { name: t('common.auth.systemConfig', '系统配置'), href: '/admin/system-config', icon: '🔧' },
      ],
    },
    {
      title: t('common.auth.toolsAndIntegrations', '工具与集成'),
      items: [
        { name: t('common.auth.tools', '工具管理'), href: '/admin/tools', icon: '🛠️' },
        { name: t('common.auth.mcpServers', 'MCP Servers'), href: '/admin/mcp-servers', icon: '🔗' },
        { name: t('common.auth.integrations'), href: '/admin/integrations', icon: '📱' },
      ],
    },
  ]

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Top Header */}
      <div className="bg-surface-secondary border-b border-border px-6 py-3 shrink-0 shadow-sm z-10">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-content">{t('common.auth.admin')}</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { window.location.href = `${BASE_PATH}/` }}
              className="text-sm text-content-secondary hover:text-content transition-colors"
            >
              {t('common.auth.backToChat')}
            </button>
            <UserMenu user={user} />
          </div>
        </div>
      </div>
      {/* Body: Sidebar + Content */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <nav
          className={`${collapsed ? 'w-16' : 'w-56'} shrink-0 bg-surface-secondary border-r border-border flex flex-col transition-all duration-200`}
        >
          {/* Menu - scrollable */}
          <div className="flex-1 overflow-y-auto py-3">
            {menuGroups.map(group => (
              <div key={group.title} className="mb-4">
                {!collapsed && (
                  <div className="px-4 py-1.5 text-xs font-medium text-content-tertiary uppercase tracking-wide">
                    {group.title}
                  </div>
                )}
                {collapsed && (
                  <div className="mx-3 my-2 border-t border-border" />
                )}
                <div className={collapsed ? 'px-2 space-y-1' : 'px-2 space-y-0.5'}>
                  {group.items.map((item) => {
                    const active = pathname === item.href
                    return (
                      <button
                        key={item.href}
                        onClick={() => router.push(item.href)}
                        title={collapsed ? item.name : undefined}
                        className={`relative w-full flex items-center ${collapsed ? 'justify-center' : 'gap-2'} ${collapsed ? 'px-0' : 'px-3'} py-2 text-sm transition-colors rounded-md ${
                          active
                            ? 'bg-accent-bg text-accent font-medium'
                            : 'text-content-secondary hover:text-content hover:bg-surface-hover'
                        }`}
                      >
                        {active && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r bg-accent" />
                        )}
                        <span className="text-base shrink-0">{item.icon}</span>
                        {!collapsed && <span className="truncate">{item.name}</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          {/* Collapse toggle - fixed at bottom */}
          <div className={`shrink-0 ${collapsed ? 'p-2 flex justify-center' : 'p-3 flex justify-end'}`}>
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded-md text-content-secondary hover:text-content hover:bg-surface-hover transition-colors"
              title={collapsed ? t('common.auth.expandSidebar', '展开侧边栏') : t('common.auth.collapseSidebar', '收起侧边栏')}
            >
              <Bars3Icon className="w-5 h-5" />
            </button>
          </div>
        </nav>
        {/* Content Area */}
        <div className="flex-1 overflow-auto p-6">
          {children}
        </div>
      </div>
    </div>
  )
}
