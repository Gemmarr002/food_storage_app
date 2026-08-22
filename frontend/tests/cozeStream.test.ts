import { describe, expect, it } from 'vitest'
import { createAppSseStream, normalizeCozeEvent } from '@/lib/cozeStream'
import { consumeChatSse } from '@/lib/chatStream'
import type { ChatStreamEvent } from '@/lib/types'

function streamFrom(parts: string[]) {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part))
      controller.close()
    },
  })
}

describe('Coze SSE 适配器', () => {
  it('只把 Coze answer/message_end 映射为 App 事件', () => {
    expect(normalizeCozeEvent('{"type":"answer","content":{"answer":"番茄"}}')).toEqual({ type: 'delta', text: '番茄' })
    expect(normalizeCozeEvent('{"type":"message_end","content":{"message_end":{"code":"0"}}}')).toEqual({ type: 'done' })
    expect(normalizeCozeEvent('{"type":"message_start","content":{}}')).toBeNull()
  })

  it('跨分片输出稳定的 start/delta/done 事件', async () => {
    const upstream = streamFrom([
      'event: message\ndata: {"type":"answer","content":{"answer":"番',
      '茄"}}\n\ndata: {"type":"message_end","content":{"message_end":{"code":"0"}}}\n\n',
    ])
    const events: ChatStreamEvent[] = []
    await consumeChatSse(new Response(createAppSseStream(upstream)), event => events.push(event))
    expect(events).toEqual([{ type: 'start' }, { type: 'delta', text: '番茄' }, { type: 'done' }])
  })

  it('上游未完成时转换为 App error', async () => {
    const upstream = streamFrom(['data: {"type":"answer","content":{"answer":"一半"}}\n\n'])
    await expect(consumeChatSse(new Response(createAppSseStream(upstream)), () => {})).rejects.toThrow('意外中断')
  })
})
