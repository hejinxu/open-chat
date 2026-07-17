import type { ToolDefinition, ToolContext, ToolResult } from '../types'

async function searchWithDuckDuckGo(
  query: string,
  count: number,
): Promise<ToolResult> {
  try {
    // 使用 DuckDuckGo Instant Answer API（免费，无需 API Key）
    const response = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
    )

    if (!response.ok) {
      return {
        success: false,
        error: `DuckDuckGo API error: ${response.status}`,
      }
    }

    const data = await response.json()
    const results: Array<{ title: string, url: string, snippet: string }> = []

    // 提取 AbstractText
    if (data.AbstractText) {
      results.push({
        title: data.Heading || query,
        url: data.AbstractURL || '',
        snippet: data.AbstractText,
      })
    }

    // 提取 RelatedTopics
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, count - results.length)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0] || topic.Text.substring(0, 50),
            url: topic.FirstURL,
            snippet: topic.Text,
          })
        }
      }
    }

    if (results.length === 0) {
      return {
        success: true,
        data: [{
          title: 'No results found',
          url: '',
          snippet: `No instant answer found for "${query}". Try using a more specific search or configure a search API key for better results.`,
        }],
      }
    }

    return { success: true, data: results.slice(0, count) }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'DuckDuckGo search failed',
    }
  }
}

interface SearchConfig {
  provider?: 'bing' | 'serpapi' | 'custom'
  apiKey?: string
  apiEndpoint?: string
  customHeaders?: Record<string, string>
}

async function searchWithBing(
  query: string,
  count: number,
  apiKey: string,
): Promise<ToolResult> {
  try {
    const response = await fetch(
      `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=${count}`,
      {
        headers: {
          'Ocp-Apim-Subscription-Key': apiKey,
        },
      },
    )

    if (!response.ok) {
      return {
        success: false,
        error: `Bing API error: ${response.status} ${response.statusText}`,
      }
    }

    const data = await response.json()
    const results = data.webPages?.value?.map((r: any) => ({
      title: r.name,
      url: r.url,
      snippet: r.snippet,
    })) || []

    return { success: true, data: results }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Bing search failed',
    }
  }
}

async function searchWithSerpAPI(
  query: string,
  count: number,
  apiKey: string,
): Promise<ToolResult> {
  try {
    const response = await fetch(
      `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&num=${count}&api_key=${apiKey}`,
    )

    if (!response.ok) {
      return {
        success: false,
        error: `SerpAPI error: ${response.status} ${response.statusText}`,
      }
    }

    const data = await response.json()
    const results = (data.organic_results || []).slice(0, count).map((r: any) => ({
      title: r.title,
      url: r.link,
      snippet: r.snippet,
    }))

    return { success: true, data: results }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'SerpAPI search failed',
    }
  }
}

async function searchWithCustom(
  query: string,
  count: number,
  config: SearchConfig,
): Promise<ToolResult> {
  if (!config.apiEndpoint) {
    return { success: false, error: 'Custom search endpoint not configured' }
  }

  try {
    const url = new URL(config.apiEndpoint)
    url.searchParams.set('q', query)
    url.searchParams.set('count', String(count))

    const response = await fetch(url.toString(), {
      headers: {
        'Content-Type': 'application/json',
        ...config.customHeaders,
      },
    })

    if (!response.ok) {
      return {
        success: false,
        error: `Custom search error: ${response.status} ${response.statusText}`,
      }
    }

    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Custom search failed',
    }
  }
}

async function webSearchHandler(
  input: Record<string, any>,
  context: ToolContext,
): Promise<ToolResult> {
  const { query, count = 5 } = input

  if (!query) {
    return { success: false, error: 'Search query is required' }
  }

  const agentConfig = context.agentConfig || {}

  // 检查是否启用联网搜索
  if (agentConfig.enable_network === false) {
    return {
      success: false,
      error: '当前智能体未启用联网搜索功能。如需搜索，请在智能体配置中开启"允许联网搜索"。',
    }
  }

  const searchConfig: SearchConfig = agentConfig.web_search || {}

  // 如果没有配置搜索服务，使用免费的 DuckDuckGo
  if (!searchConfig.provider || !searchConfig.apiKey) {
    return searchWithDuckDuckGo(query, count)
  }

  switch (searchConfig.provider) {
    case 'bing':
      return searchWithBing(query, count, searchConfig.apiKey)
    case 'serpapi':
      return searchWithSerpAPI(query, count, searchConfig.apiKey)
    case 'custom':
      return searchWithCustom(query, count, searchConfig)
    default:
      return searchWithDuckDuckGo(query, count)
  }
}

export const webSearchTool: ToolDefinition = {
  name: 'web_search',
  displayName: 'Web 搜索',
  description: '搜索互联网获取最新信息。当用户问题需要联网搜索、获取实时信息、查找最新数据时使用。',
  category: 'builtin',
  execution: 'server',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索关键词',
      },
      count: {
        type: 'number',
        default: 5,
        description: '返回结果数量',
      },
    },
    required: ['query'],
  },
  outputSchema: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '结果标题' },
        url: { type: 'string', description: '结果URL' },
        snippet: { type: 'string', description: '结果摘要' },
      },
    },
  },
  handler: webSearchHandler,
  isBuiltin: true,
  isEnabled: true,
  permissions: ['all'],
  metadata: {
    configurable: true,
    configFields: [
      {
        name: 'provider',
        label: '搜索服务提供商',
        type: 'select',
        options: [
          { value: 'bing', label: 'Bing' },
          { value: 'serpapi', label: 'SerpAPI' },
          { value: 'custom', label: '自定义' },
        ],
        required: true,
      },
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        required: true,
        showIf: { provider: ['bing', 'serpapi'] },
      },
      {
        name: 'apiEndpoint',
        label: 'API 端点',
        type: 'text',
        required: true,
        showIf: { provider: ['custom'] },
      },
      {
        name: 'customHeaders',
        label: '自定义请求头',
        type: 'json',
        showIf: { provider: ['custom'] },
      },
    ],
  },
}

export const webSearchTools = [webSearchTool]
