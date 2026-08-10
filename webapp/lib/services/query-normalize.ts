export interface NormalizeOptions {
  model: string
  apiKey?: string
  apiUrl?: string
}

export interface NormalizeResult {
  canonicalQuery: string
  expandedQueries: string[]
}

const QUERY_NORMALIZE_SYSTEM_PROMPT = `# 角色

你是查询规范化专家。将多轮用户输入整理为一个独立、无歧义的规范化查询。

# 处理规则

0. **必须保留用户询问的核心指标口径和业务术语**：例如"风险数量/风险个数/风险点数量"不得改写为"风险报告数量/报告个数"，"销售额"不得改写为"订单数"。只做指代消解与相对时间换算，禁止替换、扩缩或改变指标定义。
1. 结合多轮历史完成指代消解（如"那华北呢""第二名呢"），只保留与最新问题相关的上下文；**最新输入中已明确表达的指标与过滤条件优先**，历史仅用于消解指代，不得把历史中的指标强加到最新问题。
2. 将"今天、昨天、本周、本月、上个月、近 30 天"等相对时间换算为明确日期或日期范围；当前时间由输入提供。
3. 完整保留用户的指标、维度、过滤条件、排序、Top N 和"不要绘图"等限制。
4. 本阶段没有表结构，不得猜测任何表名、字段名或状态值；仅当用户或业务背景中已出现时才可保留。
5. 只使用自然语言，不输出 SQL、代码或查询实现方案。
6. 生成 2 至 3 个与规范化查询语义、范围和约束完全相同的等价表达，用于检索；不得扩大或缩小范围，不新增分析目标。
7. 输出前检查：删除所有来自猜测的表名、字段名、状态值、阈值、SQL 片段和实现细节；确认指标口径与最新输入完全一致。

# 输出格式

只输出合法 JSON，不要输出 Markdown 或解释：
{
  "canonical_query": "规范化后的独立查询",
  "expanded_queries": ["等价表达1", "等价表达2"]
}`

const RELATIVE_TIME_PATTERN = /今天|昨天|明天|本周|上周|本月|上月|上个月|这个月|今年|去年|最近|近\s*\d+\s*(天|周|个?月|年)|季度/

// 指代/追问词：query 含这些词且有历史时，才需要结合历史做指代消解
const COREFERENCE_PATTERN = /那|呢|它|这个|这些|该公司|该企业|同上|再|继续|上一条|刚才|换个|换一种/

/**
 * Whether the query needs normalization. Only normalize when there is something
 * to resolve: a relative-time expression, or a coreference/turn that depends on
 * history. A self-contained query (e.g. "规上企业风险总个数是多少") must NOT be
 * rewritten, otherwise the model may drift the metric definition (风险数量 vs 风险报告数量).
 */
export function shouldNormalize(query: string, historyCount: number): boolean {
  if (RELATIVE_TIME_PATTERN.test(query)) {
    return true
  }
  return historyCount > 0 && COREFERENCE_PATTERN.test(query)
}

function extractJson(text: string): Record<string, any> | null {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : trimmed
  try {
    const parsed = JSON.parse(candidate)
    return parsed && typeof parsed === 'object' ? parsed : null
  }
  catch {
    const block = trimmed.match(/\{[\s\S]*\}/)
    if (block) {
      try {
        const parsed = JSON.parse(block[0])
        return parsed && typeof parsed === 'object' ? parsed : null
      }
      catch {
        return null
      }
    }
    return null
  }
}

/**
 * Normalize a user query (multi-turn coreference + relative-time resolution).
 * Returns null on failure; callers should fall back to the original query.
 */
export async function normalizeQuery(
  query: string,
  history: Array<{ role: string, content: string }>,
  options: NormalizeOptions,
): Promise<NormalizeResult | null> {
  try {
    const { model, apiKey, apiUrl } = options
    if (!model || !apiKey || !apiUrl) {
      console.warn('[QueryNormalize] Missing model/apiKey/apiUrl, skip normalization')
      return null
    }

    const historyText = history
      .slice(-6)
      .map(m => `${m.role === 'user' ? '用户' : '助手'}：${m.content}`)
      .join('\n')
    const nowText = new Date().toLocaleString('zh-CN', { hour12: false })

    const baseUrl = apiUrl.replace(/\/+$/, '')
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: QUERY_NORMALIZE_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `当前时间：${nowText}\n\n多轮历史：\n${historyText || '(无)'}\n\n最新输入：${query}`,
          },
        ],
        stream: false,
        temperature: 0,
        max_tokens: 500,
      }),
    })

    if (!res.ok) {
      const errorText = await res.text()
      console.error('[QueryNormalize] LLM API error:', res.status, errorText)
      return null
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) {
      return null
    }

    const parsed = extractJson(content)
    if (parsed && typeof parsed.canonical_query === 'string' && parsed.canonical_query.trim()) {
      return {
        canonicalQuery: parsed.canonical_query.trim(),
        expandedQueries: Array.isArray(parsed.expanded_queries)
          ? parsed.expanded_queries.filter((item): item is string => typeof item === 'string')
          : [],
      }
    }
    return null
  }
  catch (error) {
    console.warn('[QueryNormalize] failed, fallback to original query:', error)
    return null
  }
}
