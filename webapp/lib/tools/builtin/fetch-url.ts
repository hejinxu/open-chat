import type { ToolDefinition, ToolContext, ToolResult } from '../types'

function extractTextAndLinks(html: string): { text: string, links: Array<{ title: string, url: string }> } {
  const links: Array<{ title: string, url: string }> = []

  // 提取链接
  const linkPattern = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
  let linkMatch
  while ((linkMatch = linkPattern.exec(html)) !== null) {
    const url = linkMatch[1]
    const title = linkMatch[2].replace(/<[^>]+>/g, '').trim()
    if (url && title && !url.startsWith('#') && !url.startsWith('javascript:')) {
      links.push({ title: title.substring(0, 100), url })
    }
  }

  // 提取文本
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
  text = text.replace(/<[^>]+>/g, ' ')
  text = text.replace(/&nbsp;/g, ' ')
  text = text.replace(/&amp;/g, '&')
  text = text.replace(/&lt;/g, '<')
  text = text.replace(/&gt;/g, '>')
  text = text.replace(/&quot;/g, '"')
  text = text.replace(/&#39;/g, '\'')
  text = text.replace(/\s+/g, ' ').trim()

  if (text.length > 6000) {
    text = `${text.substring(0, 6000)}... (truncated)`
  }

  return { text, links: links.slice(0, 50) }
}

async function searchWithScraping(query: string, engine: 'bing' | 'baidu', count: number): Promise<ToolResult> {
  try {
    const encodedQuery = encodeURIComponent(query)
    let url: string

    if (engine === 'bing') {
      // 生成随机 cvid
      const cvid = Math.random().toString(16).substring(2, 10).toUpperCase()
        + Math.random().toString(16).substring(2, 6).toUpperCase()
        + Math.random().toString(16).substring(2, 6).toUpperCase()
        + Math.random().toString(16).substring(2, 6).toUpperCase()
        + Math.random().toString(16).substring(2, 12).toUpperCase()

      url = `https://cn.bing.com/search?q=${encodedQuery}&qs=n&form=QBRE&sp=-1&lq=0&pq=${encodedQuery}&sc=11-9&sk=&cvid=${cvid}`
    } else {
      url = `https://www.baidu.com/s?wd=${encodedQuery}&rn=${count}`
    }

    console.log(`[fetch_url] Searching: ${engine} | URL: ${url}`)
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const html = await response.text()

    // 提取页面文本和链接
    const { text, links } = extractTextAndLinks(html)

    // 清理文本，移除无关内容
    const cleanedText = text
      .replace(/自适应缩放/g, '')
      .replace(/跳至内容/g, '')
      .replace(/辅助功能反馈/g, '')
      .replace(/国内版 国际版/g, '')
      .replace(/网页 图片 视频 学术 词典 地图 更多/g, '')
      .replace(/航班 工具/g, '')
      .replace(/约 [\d,]+ 个结果/g, '')
      .replace(/在新选项卡中打开链接/g, '')
      .replace(/时间不限/g, '')
      .replace(/为回应符合本地法律要求的通知.*?此处/g, '')
      .replace(/分页 \d+ \d+ \d+ 下一页/g, '')
      .replace(/增值电信业务经营许可证[\s\S]*$/, '')
      .replace(/\s+/g, ' ')
      .trim()

    // 格式化链接列表（只保留有意义的链接）
    const meaningfulLinks = links.filter(l =>
      l.title.length > 5
      && !l.url.includes('javascript:')
      && !l.url.includes('#'),
    ).slice(0, 10)

    const linksText = meaningfulLinks.length > 0
      ? `\n\n相关链接：\n${meaningfulLinks.map(l => `- ${l.title}: ${l.url}`).join('\n')}`
      : ''

    return {
      success: true,
      data: `【搜索结果】查询: "${query}"\n\n${cleanedText.substring(0, 3000)}${linksText}`,
    }
  } catch (error: any) {
    return {
      success: false,
      error: `Search failed: ${error.message}`,
    }
  }
}

async function fetchUrlHandler(
  input: Record<string, any>,
  context: ToolContext,
): Promise<ToolResult> {
  const { url, search_engine = 'bing' } = input

  console.log('[fetch_url] Called with input:', JSON.stringify(input))

  if (!url) {
    return { success: false, error: 'URL is required' }
  }

  // 检查是否是搜索查询（没有 http/https 前缀）
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    // 检查是否启用联网搜索
    const agentConfig = context.agentConfig || {}
    if (agentConfig.enable_network === false) {
      return {
        success: false,
        error: '当前智能体未启用联网搜索功能。如需搜索，请在智能体配置中开启"允许联网搜索"。',
      }
    }
    // 当作搜索查询处理
    const engine = search_engine === 'baidu' ? 'baidu' : 'bing'
    console.log(`[fetch_url] Treating as search query: "${url}" (engine: ${engine})`)
    return searchWithScraping(url, engine, 5)
  }

  // 直接抓取 URL（无论 enable_network 如何都允许，可能是内网页面）
  console.log(`[fetch_url] Fetching URL: ${url}`)
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const html = await response.text()

    // 提取页面文本和链接
    const { text, links } = extractTextAndLinks(html)

    // 格式化链接列表（只保留有意义的链接）
    const meaningfulLinks = links.filter(l =>
      l.title.length > 5
      && !l.url.includes('javascript:')
      && !l.url.includes('#'),
    ).slice(0, 15)

    const linksText = meaningfulLinks.length > 0
      ? `\n\n页面链接：\n${meaningfulLinks.map(l => `- ${l.title}: ${l.url}`).join('\n')}`
      : ''

    return {
      success: true,
      data: `【网页内容】${url}\n\n${text.substring(0, 4000)}${linksText}`,
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    }
  }
}

export const fetchUrlTool: ToolDefinition = {
  name: 'fetch_url',
  displayName: '网页抓取/搜索',
  description: '抓取指定URL的网页内容，或者搜索互联网信息。当用户提供URL时抓取网页内容，当用户提供搜索关键词时搜索互联网。',
  category: 'builtin',
  execution: 'server',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: '要抓取的URL地址，或者搜索关键词',
      },
      search_engine: {
        type: 'string',
        enum: ['bing', 'baidu'],
        default: 'bing',
        description: '搜索引擎选择（仅在搜索时有效）',
      },
    },
    required: ['url'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL地址' },
      content: { type: 'string', description: '网页内容' },
      contentLength: { type: 'number', description: '内容长度' },
    },
  },
  handler: fetchUrlHandler,
  isBuiltin: true,
  isEnabled: true,
  permissions: ['all'],
}

export const fetchUrlTools = [fetchUrlTool]
