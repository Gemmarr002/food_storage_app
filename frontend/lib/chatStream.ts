export type CozeStreamEvent = {
  type?: string
  finish?: boolean
  content?: {
    answer?: string | null
    error?: unknown
    message_end?: { code?: string; message?: string } | null
  }
}

function eventError(event: CozeStreamEvent): string | null {
  if (event.type === 'error') {
    if (typeof event.content?.error === 'string') return event.content.error
    return 'Coze Agent 执行失败'
  }
  if (event.type === 'message_end') {
    const end = event.content?.message_end
    if (end?.code && end.code !== '0') return end.message || `Coze Agent 错误（${end.code}）`
  }
  return null
}

export async function consumeCozeSse(
  response: Response,
  onAnswer: (chunk: string) => void,
): Promise<void> {
  if (!response.body) throw new Error('Agent 未返回数据流')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let completed = false

  const processBlock = (block: string) => {
    const data = block
      .split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart())
      .join('\n')
    if (!data || data === '[DONE]') return
    let event: CozeStreamEvent
    try {
      event = JSON.parse(data) as CozeStreamEvent
    } catch {
      throw new Error('Agent 返回了无法解析的事件')
    }
    const error = eventError(event)
    if (error) throw new Error(error)
    if (event.type === 'answer' && typeof event.content?.answer === 'string') {
      onAnswer(event.content.answer)
    }
    if (event.type === 'message_end') completed = true
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
  if (!completed) throw new Error('Agent 数据流意外中断')
}
