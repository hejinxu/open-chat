export { browserTools, getPageContentTool, getSelectedTextTool, getElementBySelectorTool } from './browser-tools'
export { serverTools, httpRequestTool } from './server-tools'
export { fetchUrlTools, fetchUrlTool } from './fetch-url'
export { timeTools, getCurrentTimeTool } from './time-tools'

import { browserTools } from './browser-tools'
import { serverTools } from './server-tools'
import { fetchUrlTools } from './fetch-url'
import { timeTools } from './time-tools'
import type { ToolDefinition } from '../types'

export const allBuiltinTools: ToolDefinition[] = [
  ...browserTools,
  ...serverTools,
  ...fetchUrlTools,
  ...timeTools,
]
