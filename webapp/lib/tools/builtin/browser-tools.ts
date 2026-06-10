import type { ToolDefinition } from '../types'

export const getPageContentTool: ToolDefinition = {
  name: 'get_page_content',
  displayName: '获取页面内容',
  description: '获取当前宿主页面的完整内容，包括标题、URL、HTML文本和元数据。当用户询问当前页面内容时使用。',
  category: 'builtin',
  execution: 'client',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
  outputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '页面标题' },
      url: { type: 'string', description: '页面URL' },
      content: { type: 'string', description: '页面文本内容' },
      metadata: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          keywords: { type: 'string' },
          author: { type: 'string' },
        },
      },
    },
  },
  isBuiltin: true,
  isEnabled: true,
  permissions: ['all'],
}

export const getSelectedTextTool: ToolDefinition = {
  name: 'get_selected_text',
  displayName: '获取选中文本',
  description: '获取用户在页面上选中的文本内容。当用户询问选中的内容时使用。',
  category: 'builtin',
  execution: 'client',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
  outputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '选中的文本' },
      range: {
        type: 'object',
        properties: {
          start: { type: 'number' },
          end: { type: 'number' },
        },
      },
    },
  },
  isBuiltin: true,
  isEnabled: true,
  permissions: ['all'],
}

export const getElementBySelectorTool: ToolDefinition = {
  name: 'get_element_by_selector',
  displayName: '按选择器获取元素',
  description: '根据CSS选择器获取页面元素的内容。当需要获取特定区域的内容时使用。',
  category: 'builtin',
  execution: 'client',
  inputSchema: {
    type: 'object',
    properties: {
      selector: {
        type: 'string',
        description: 'CSS选择器，如 #main-content, .article-body, table',
      },
      extractType: {
        type: 'string',
        enum: ['text', 'html', 'value'],
        default: 'text',
        description: '提取类型：text(文本), html(HTML), value(表单值)',
      },
    },
    required: ['selector'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      found: { type: 'boolean', description: '是否找到元素' },
      content: { type: 'string', description: '元素内容' },
      count: { type: 'number', description: '匹配的元素数量' },
    },
  },
  isBuiltin: true,
  isEnabled: true,
  permissions: ['all'],
}

export const browserTools = [
  getPageContentTool,
  getSelectedTextTool,
  getElementBySelectorTool,
]
