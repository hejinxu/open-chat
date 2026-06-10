/**
 * 工具使用指导 - 统一管理，供所有执行模式使用
 */

export const TOOL_USAGE_GUIDE = `
可用工具及使用场景：
- get_page_content: 当用户询问"当前页面"、"这个页面"、"页面内容"时使用
- get_selected_text: 当用户询问"选中的内容"、"选中的文字"时使用
- fetch_url: 当需要搜索信息或访问网页时使用
- get_current_time: 当用户明确询问时间、日期时使用
- http_request: 当需要调用 API 接口时使用

重要规则：
1. 用户问"当前页面展示了什么内容"时，必须调用 get_page_content 工具
2. 使用工具获取信息后，立即总结并回复用户，不要重复调用相同或相似的工具
3. 如果搜索结果已经包含用户需要的信息，请直接总结回复，不要再搜索
4. 每次工具调用后，评估是否已获得足够信息来回答用户问题
5. 如果已获得足够信息，请直接回复，不要继续调用工具
6. 最多调用5次工具，然后必须回复用户
7. 不要主动提及日期，除非用户明确询问`

export function getSystemPrompt(currentDate: string): string {
  return `你是一个有用的助手，可以使用工具来帮助用户。

当前日期：${currentDate}

${TOOL_USAGE_GUIDE}`
}

export function getStepExecutionPrompt(
  stepNumber: number,
  stepDescription: string,
  userQuery: string,
): string {
  return `你是一个任务执行专家。请执行以下任务步骤：

步骤 ${stepNumber}: ${stepDescription}

请直接执行并返回结果。如果需要使用工具，请使用提供的工具。

${TOOL_USAGE_GUIDE}

原始用户问题：${userQuery}`
}
