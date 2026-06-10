import type { ToolDefinition, ToolContext, ToolResult } from '../types'

async function getCurrentTimeHandler(
  input: Record<string, any>,
  _context: ToolContext,
): Promise<ToolResult> {
  const { timezone = 'Asia/Shanghai' } = input

  try {
    const now = new Date()
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'long',
      hour12: false,
    }

    const formatter = new Intl.DateTimeFormat('zh-CN', options)
    const formatted = formatter.format(now)

    return {
      success: true,
      data: {
        datetime: now.toISOString(),
        timestamp: now.getTime(),
        formatted,
        timezone,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        day: now.getDate(),
        hour: now.getHours(),
        minute: now.getMinutes(),
        second: now.getSeconds(),
      },
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    }
  }
}

export const getCurrentTimeTool: ToolDefinition = {
  name: 'get_current_time',
  displayName: '获取当前时间',
  description: '获取当前的日期和时间。当用户询问时间相关的问题，或者需要获取实时信息时使用。',
  category: 'builtin',
  execution: 'server',
  inputSchema: {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        default: 'Asia/Shanghai',
        description: '时区，如 Asia/Shanghai, America/New_York',
      },
    },
    required: [],
  },
  outputSchema: {
    type: 'object',
    properties: {
      datetime: { type: 'string', description: 'ISO 格式的日期时间' },
      timestamp: { type: 'number', description: '时间戳（毫秒）' },
      formatted: { type: 'string', description: '格式化的日期时间' },
      timezone: { type: 'string', description: '时区' },
    },
  },
  handler: getCurrentTimeHandler,
  isBuiltin: true,
  isEnabled: true,
  permissions: ['all'],
}

export const timeTools = [getCurrentTimeTool]
