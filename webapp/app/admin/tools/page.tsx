'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useTranslation } from 'react-i18next'
import { BASE_PATH } from '@/config'

interface Tool {
  name: string
  displayName: string
  description: string
  category: string
  execution: string
  isBuiltin: boolean
  isEnabled: boolean
  permissions: string[]
  metadata?: Record<string, any>
}

const fetcher = (url: string) => fetch(url).then(res => res.json())

export default function ToolsPage() {
  const { t } = useTranslation()
  const { data, error } = useSWR<{ tools: Tool[] }>(`${BASE_PATH}/api/tools`, fetcher)
  const [filter, setFilter] = useState<'all' | 'builtin' | 'custom'>('all')

  const tools = data?.tools || []
  const filteredTools = tools.filter((tool) => {
    if (filter === 'all') { return true }
    if (filter === 'builtin') { return tool.category === 'builtin' }
    if (filter === 'custom') { return tool.category === 'custom' }
    return true
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-content">{t('common.auth.tools', '工具管理')}</h2>
      </div>

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 text-sm rounded-md transition-colors ${filter === 'all' ? 'bg-accent text-white' : 'bg-surface-hover text-content-secondary hover:text-content'}`}
        >
          {t('common.auth.all', '全部')}
        </button>
        <button
          onClick={() => setFilter('builtin')}
          className={`px-4 py-2 text-sm rounded-md transition-colors ${filter === 'builtin' ? 'bg-accent text-white' : 'bg-surface-hover text-content-secondary hover:text-content'}`}
        >
          {t('common.auth.builtin', '内置')}
        </button>
        <button
          onClick={() => setFilter('custom')}
          className={`px-4 py-2 text-sm rounded-md transition-colors ${filter === 'custom' ? 'bg-accent text-white' : 'bg-surface-hover text-content-secondary hover:text-content'}`}
        >
          {t('common.auth.custom', '自定义')}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded mb-4 text-sm">
          {t('common.auth.loadFailed', '加载失败')}: {error.message}
        </div>
      )}

      {!data && !error && (
        <div className="text-center py-8 text-content-secondary">{t('common.auth.loading', '加载中...')}</div>
      )}

      {data && (
        <div className="bg-surface-elevated rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-content-secondary">
                <th className="px-4 py-3 font-medium">{t('common.auth.name', '名称')}</th>
                <th className="px-4 py-3 font-medium">{t('common.auth.type', '类型')}</th>
                <th className="px-4 py-3 font-medium">{t('common.auth.executionLocation', '执行位置')}</th>
                <th className="px-4 py-3 font-medium">{t('common.auth.status', '状态')}</th>
                <th className="px-4 py-3 font-medium">{t('common.auth.description', '描述')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredTools.map(tool => (
                <tr key={tool.name} className="hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="font-medium text-content">{tool.displayName}</div>
                    <div className="text-xs text-content-secondary">{tool.name}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded ${tool.category === 'builtin' ? 'bg-accent-bg text-accent' : 'bg-surface-hover text-content-secondary'}`}>
                      {tool.category === 'builtin' ? t('common.auth.builtin', '内置') : t('common.auth.custom', '自定义')}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded ${tool.execution === 'client' ? 'bg-surface-hover text-content-tertiary' : 'bg-accent-bg text-content-accent'}`}>
                      {tool.execution === 'client' ? t('common.auth.client', '客户端') : t('common.auth.server', '服务端')}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded ${tool.isEnabled ? 'bg-accent-bg text-accent' : 'bg-surface-hover text-content-tertiary'}`}>
                      {tool.isEnabled ? t('common.auth.enabled', '启用') : t('common.auth.disabled', '禁用')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-content-secondary max-w-xs truncate">
                      {tool.description}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && filteredTools.length === 0 && (
        <div className="text-center py-8 text-content-secondary">
          {t('common.auth.noTools', '没有找到工具')}
        </div>
      )}
    </div>
  )
}
