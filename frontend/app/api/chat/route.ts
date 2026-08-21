import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const MAX_MESSAGE_LENGTH = 2_000
const MAX_INGREDIENTS = 100
const MAX_TEXT_LENGTH = 100

type IngredientContext = { name: string; quantity: number; unit: string; freshness?: string }
type AgentContext = { ingredients: IngredientContext[]; allergies: string[]; dislikes: string[] }

function cleanText(value: unknown, maxLength = MAX_TEXT_LENGTH): string | null {
  if (typeof value !== 'string') return null
  const result = value.trim()
  return result && result.length <= maxLength ? result : null
}

function parseContext(value: unknown): AgentContext | null {
  if (value == null) return null
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('context 格式错误')
  const raw = value as Record<string, unknown>
  const sourceIngredients = Array.isArray(raw.ingredients) ? raw.ingredients : []
  const sourceAllergies = Array.isArray(raw.allergies) ? raw.allergies : []
  const sourceDislikes = Array.isArray(raw.dislikes) ? raw.dislikes : []
  if (sourceIngredients.length > MAX_INGREDIENTS) throw new Error('食材上下文过长')

  const ingredients = sourceIngredients.map((item): IngredientContext => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('食材上下文格式错误')
    const source = item as Record<string, unknown>
    const name = cleanText(source.name)
    const unit = cleanText(source.unit, 20)
    const quantity = source.quantity
    const freshness = source.freshness == null ? undefined : cleanText(source.freshness, 30)
    if (!name || !unit || typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 0 || freshness === null) {
      throw new Error('食材上下文格式错误')
    }
    return { name, quantity, unit, ...(freshness ? { freshness } : {}) }
  })

  const parseNames = (items: unknown[], label: string) => {
    if (items.length > 50) throw new Error(`${label}上下文过长`)
    return items.map(item => {
      const result = cleanText(item)
      if (!result) throw new Error(`${label}上下文格式错误`)
      return result
    })
  }
  return {
    ingredients,
    allergies: parseNames(sourceAllergies, '过敏'),
    dislikes: parseNames(sourceDislikes, '忌口'),
  }
}

function buildAgentPrompt(message: string, context: AgentContext | null): string {
  if (!context) return message
  const inventory = context.ingredients.length
    ? context.ingredients.map(item => `- ${item.name}：${item.quantity}${item.unit}${item.freshness ? `（${item.freshness}）` : ''}`).join('\n')
    : '- 暂无库存食材'
  const allergies = context.allergies.length ? context.allergies.map(name => `- ${name}`).join('\n') : '- 无'
  const dislikes = context.dislikes.length ? context.dislikes.map(name => `- ${name}`).join('\n') : '- 无'
  return `【家庭厨房 App 当前实时上下文】

当前库存：
${inventory}

过敏食材：
${allergies}

忌口食材：
${dislikes}

【上下文使用规则】
以上为 App 在本轮请求时读取的当前本地事实。若与历史聊天中的库存信息冲突，以本轮当前事实为准。不要声称能够直接访问用户本地数据库。

【用户本轮问题】
${message}`
}

function serializeCozeBody(prompt: string, sessionId: string, projectId: string): string {
  // project_id 超过 Number.MAX_SAFE_INTEGER，保留环境变量中的十进制精度。
  const marker = '__COZE_PROJECT_ID__'
  const body = JSON.stringify({
    content: { query: { prompt: [{ type: 'text', content: { text: prompt } }] } },
    type: 'query',
    session_id: sessionId,
    project_id: marker,
  })
  return body.replace(`"${marker}"`, projectId)
}

export async function POST(req: NextRequest) {
  const token = process.env.COZE_API_TOKEN
  const baseUrl = process.env.COZE_API_BASE_URL?.replace(/\/$/, '')
  const projectId = process.env.COZE_PROJECT_ID
  if (!token || !baseUrl || !projectId) {
    return NextResponse.json({ error: 'AI 助手未配置完整' }, { status: 503 })
  }
  if (!/^https:\/\//.test(baseUrl) || !/^\d+$/.test(projectId)) {
    return NextResponse.json({ error: 'AI 助手服务端配置无效' }, { status: 500 })
  }

  let message: string
  let sessionId: string
  let context: AgentContext | null
  try {
    const body = await req.json() as Record<string, unknown>
    message = cleanText(body.message, MAX_MESSAGE_LENGTH) ?? ''
    sessionId = cleanText(body.sessionId, 128) ?? ''
    if (!message) return NextResponse.json({ error: '请输入 1–2000 个字符的问题' }, { status: 400 })
    if (!sessionId || !/^[A-Za-z0-9_-]+$/.test(sessionId)) {
      return NextResponse.json({ error: 'sessionId 格式错误' }, { status: 400 })
    }
    context = parseContext(body.context)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '请求格式错误' }, { status: 400 })
  }

  let upstream: Response
  try {
    upstream = await fetch(`${baseUrl}/stream_run`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: serializeCozeBody(buildAgentPrompt(message, context), sessionId, projectId),
      cache: 'no-store',
      signal: req.signal,
    })
  } catch {
    return NextResponse.json({ error: '无法连接 Coze Agent' }, { status: 502 })
  }

  if (!upstream.ok || !upstream.body) {
    const detail = (await upstream.text().catch(() => '')).slice(0, 500)
    return NextResponse.json(
      { error: detail || `Coze Agent 请求失败（${upstream.status}）` },
      { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502 },
    )
  }
  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
