import type { ChatStreamEvent } from '@/lib/types'

type CozeStreamEvent = {
  type?: string
  content?: {
    answer?: string | null
    error?: unknown
    message_end?: { code?: string; message?: string } | null
  }
}

export function normalizeCozeEvent(data: string): ChatStreamEvent | null {
  if (!data || data === '[DONE]') return null
  let event: CozeStreamEvent
  try {
    event = JSON.parse(data) as CozeStreamEvent
  } catch {
    return { type: 'error', message: 'Coze Agent 返回了无法解析的事件' }
  }
  if (event.type === 'answer' && typeof event.content?.answer === 'string' && event.content.answer.length > 0) {
    return { type: 'delta', text: event.content.answer }
  }
  if (event.type === 'error') {
    return {
      type: 'error',
      message: typeof event.content?.error === 'string' ? event.content.error : 'Coze Agent 执行失败',
    }
  }
  if (event.type === 'message_end') {
    const end = event.content?.message_end
    if (end?.code && end.code !== '0') {
      return { type: 'error', message: end.message || `Coze Agent 错误（${end.code}）` }
    }
    return { type: 'done' }
  }
  return null
}

const encode = (event: ChatStreamEvent) => `data: ${JSON.stringify(event)}\n\n`

export function createAppSseStream(upstream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const reader = upstream.getReader()
  let buffer = ''
  let completed = false

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(encode({ type: 'start' })))

      const emitBlock = (block: string) => {
        const data = block
          .split(/\r?\n/)
          .filter(line => line.startsWith('data:'))
          .map(line => line.slice(5).trimStart())
          .join('\n')
        if (!data) return
        const event = normalizeCozeEvent(data)
        if (!event) return
        if (event.type === 'done' || event.type === 'error') completed = true
        controller.enqueue(encoder.encode(encode(event)))
      }

      try {
        while (!completed) {
          const { value, done } = await reader.read()
          buffer += decoder.decode(value, { stream: !done })
          const blocks = buffer.split(/\r?\n\r?\n/)
          buffer = blocks.pop() ?? ''
          for (const block of blocks) {
            emitBlock(block)
            if (completed) break
          }
          if (done) break
        }
        if (!completed && buffer.trim()) emitBlock(buffer)
        if (!completed) controller.enqueue(encoder.encode(encode({ type: 'error', message: 'Coze Agent 数据流意外中断' })))
        controller.close()
      } catch {
        if (!completed) controller.enqueue(encoder.encode(encode({ type: 'error', message: '读取 Coze Agent 数据流失败' })))
        controller.close()
      } finally {
        reader.releaseLock()
      }
    },
    cancel() {
      return reader.cancel()
    },
  })
}
