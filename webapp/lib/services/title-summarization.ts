import { getDatabaseProvider } from '@/lib/db'

/**
 * 使用系统配置的模型总结对话标题
 * @returns 总结后的标题（不超过 30 字），若未配置或失败则返回 null
 */
export async function summarizeConversationTitle(
  userMessage: string,
  assistantMessage: string,
): Promise<string | null> {
  try {
    const db = getDatabaseProvider()

    // 1. 检查是否启用
    const enabledConfig = await db.getSystemConfigByKey('title_summarization_enabled')
    if (!enabledConfig || enabledConfig.value !== 'true') {
      return null
    }

    // 2. 获取配置的模型 ID
    const modelIdConfig = await db.getSystemConfigByKey('title_summarization_model_id')
    if (!modelIdConfig || !modelIdConfig.value) {
      return null
    }

    // 3. 从 models 表获取模型信息
    const model = await db.getModelById(modelIdConfig.value)
    if (!model) {
      console.error('[TitleSummarization] Model not found:', modelIdConfig.value)
      return null
    }

    // 4. 获取 provider 信息（API key, API URL）
    const provider = await db.getModelProviderById(model.provider_id)
    if (!provider) {
      console.error('[TitleSummarization] Provider not found:', model.provider_id)
      return null
    }

    if (!provider.api_key) {
      console.error('[TitleSummarization] Provider has no API key:', provider.id)
      return null
    }

    // 5. 构造总结 prompt
    const prompt = `请根据以下对话内容，生成一个简短的对话标题（不超过20个字，不要包含引号、句号等标点符号）：

用户：${userMessage.slice(0, 500)}
助手：${assistantMessage.slice(0, 500)}

标题：`

    const apiUrl = provider.api_base_url.replace(/\/+$/, '')

    // 6. 调用 LLM API（非流式）
    const res = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.api_key}`,
      },
      body: JSON.stringify({
        model: model.model_name,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        temperature: 0.3,
        max_tokens: 50,
      }),
    })

    if (!res.ok) {
      const errorText = await res.text()
      console.error('[TitleSummarization] LLM API error:', res.status, errorText)
      return null
    }

    const data = await res.json()
    const title = data.choices?.[0]?.message?.content?.trim()

    if (!title) {
      return null
    }

    // 7. 清理标题（去除引号、换行等）
    const cleanTitle = title
      .replace(/["""''「」『』]/g, '')
      .replace(/[。.\n\r]/g, '')
      .trim()

    // 限制 30 字以内
    return cleanTitle.length > 30 ? cleanTitle.slice(0, 30) : cleanTitle
  }
  catch (error) {
    console.error('[TitleSummarization] Error:', error)
    return null
  }
}
