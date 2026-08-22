import type { ChatStreamEvent } from '@/lib/types'

function parseEvent(block: string): ChatStreamEvent | null {
  const data = block
    .split(/\r?\n/)
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trimStart())
    .join('\n')
  if (!data) return null

  let event: unknown
  try {
    event = JSON.parse(data)
  } catch {
    throw new Error('AI 助手返回了无法解析的事件')
  }
  if (!event || typeof event !== 'object' || !('type' in event)) {
    throw new Error('AI 助手返回了无效事件')
  }
  const candidate = event as Record<string, unknown>
  if (candidate.type === 'start' || candidate.type === 'done') return { type: candidate.type }
  if (candidate.type === 'delta' && typeof candidate.text === 'string') return { type: 'delta', text: candidate.text }
  if (candidate.type === 'error' && typeof candidate.message === 'string') return { type: 'error', message: candidate.message }
  throw new Error('AI 助手返回了未知事件')
}

export async function consumeChatSse(
  response: Response,
  onEvent: (event: ChatStreamEvent) => void,
): Promise<void> {
  if (!response.body) throw new Error('AI 助手未返回数据流')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let started = false
  let completed = false

  const processBlock = (block: string) => {
    const event = parseEvent(block)
    if (!event) return
    if (event.type === 'start') started = true
    if (event.type === 'error') throw new Error(event.message)
    if (event.type === 'done') completed = true
    onEvent(event)
  }

  while (true) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const blocks = buffer.split(/\r?\n\r?\n/)
    buffer = blocks.pop() ?? ''
    for (const block of blocks) processBlock(block)
    if (done) break
  }
  if (buffer.trim()) processBlock(buffer)
  if (!started || !completed) throw new Error('AI 助手数据流意外中断')
}
