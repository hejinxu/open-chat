'use client'

import { useState } from 'react'
import useSWR from 'swr'
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
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">工具管理</h1>
      </div>

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded ${filter === 'all' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
        >
          全部
        </button>
        <button
          onClick={() => setFilter('builtin')}
          className={`px-4 py-2 rounded ${filter === 'builtin' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
        >
          内置
        </button>
        <button
          onClick={() => setFilter('custom')}
          className={`px-4 py-2 rounded ${filter === 'custom' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
        >
          自定义
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          加载失败: {error.message}
        </div>
      )}

      {!data && !error && (
        <div className="text-center py-8">加载中...</div>
      )}

      {data && (
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  名称
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  类型
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  执行位置
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  状态
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  描述
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredTools.map(tool => (
                <tr key={tool.name} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {tool.displayName}
                    </div>
                    <div className="text-sm text-gray-500">
                      {tool.name}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      tool.category === 'builtin'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {tool.category === 'builtin' ? '内置' : '自定义'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      tool.execution === 'client'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-purple-100 text-purple-800'
                    }`}>
                      {tool.execution === 'client' ? '客户端' : '服务端'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      tool.isEnabled
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {tool.isEnabled ? '启用' : '禁用'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900 max-w-xs truncate">
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
        <div className="text-center py-8 text-gray-500">
          没有找到工具
        </div>
      )}
    </div>
  )
}
