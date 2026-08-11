import type { ToolDefinition, ToolContext, ToolResult } from '../types'

async function httpRequestHandler(
  input: Record<string, any>,
  context: ToolContext,
): Promise<ToolResult> {
  const { url, method = 'GET', headers = {}, body, timeout = 10000 } = input

  if (!url) {
    return { success: false, error: 'URL is required' }
  }

  // 与 fetch_url 一致：无 http/https 前缀视为"搜索关键词"场景，受联网开关控制
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    const agentConfig = context.agentConfig || {}
    if (agentConfig.enable_network !== true) {
      return {
        success: false,
        error: '当前智能体未启用联网搜索功能。如需搜索，请在智能体配置中开启"允许联网搜索"。',
      }
    }
    return { success: false, error: 'URL 必须是 http:// 或 https:// 开头的完整地址。' }
  }

  console.log('[http_request] ===== 开始调用 =====')
  console.log('[http_request] URL:', url)
  console.log('[http_request] Method:', method)
  console.log('[http_request] Headers:', JSON.stringify(headers))
  console.log('[http_request] Body:', body ? JSON.stringify(body).substring(0, 500) : 'none')

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const fetchOptions: RequestInit = {
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      signal: controller.signal,
    }

    if (body && method.toUpperCase() !== 'GET') {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body)
    }

    console.log('[http_request] Fetching:', url)
    const response = await fetch(url, fetchOptions)
    clearTimeout(timeoutId)

    console.log('[http_request] Response status:', response.status, response.statusText)

    const contentType = response.headers.get('content-type') || ''
    let data: any

    if (contentType.includes('application/json')) {
      data = await response.json()
    } else {
      data = await response.text()
    }

    console.log('[http_request] Response body:', typeof data === 'string' ? data.substring(0, 500) : JSON.stringify(data).substring(0, 500))
    console.log('[http_request] ===== 调用结束 =====')

    return {
      success: true,
      data: {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: data,
      },
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, error: `Request timeout after ${timeout}ms` }
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export const httpRequestTool: ToolDefinition = {
  name: 'http_request',
  displayName: 'HTTP 请求',
  description: '发送HTTP请求到指定URL。可用于调用外部API、获取网页内容等。',
  category: 'builtin',
  execution: 'server',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: '请求URL',
      },
      method: {
        type: 'string',
        enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        default: 'GET',
        description: 'HTTP方法',
      },
      headers: {
        type: 'object',
        description: '请求头',
        default: {},
      },
      body: {
        type: 'object',
        description: '请求体（POST/PUT/PATCH时使用）',
      },
      timeout: {
        type: 'number',
        default: 10000,
        description: '超时时间（毫秒）',
      },
    },
    required: ['url'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      status: { type: 'number', description: 'HTTP状态码' },
      statusText: { type: 'string', description: '状态文本' },
      headers: { type: 'object', description: '响应头' },
      body: { type: 'object', description: '响应体' },
    },
  },
  handler: httpRequestHandler,
  isBuiltin: true,
  isEnabled: true,
  permissions: ['all'],
}

export const serverTools = [httpRequestTool]
