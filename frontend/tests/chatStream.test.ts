import { describe, expect, it } from 'vitest'
import { consumeChatSse } from '@/lib/chatStream'
import type { ChatStreamEvent } from '@/lib/types'

function responseFrom(parts: string[]) {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part))
      controller.close()
    },
  }))
}

describe('consumeChatSse', () => {
  it('跨网络分片按顺序消费 App 内部事件', async () => {
    const events: ChatStreamEvent[] = []
    const response = responseFrom([
      'data: {"type":"start"}\n\n',
      'data: {"type":"delta","text":"番',
      '茄"}\n\ndata: {"type":"delta","text":"炒蛋"}\n\n',
      'data: {"type":"done"}\n\n',
    ])
    await consumeChatSse(response, event => events.push(event))
    expect(events).toEqual([
      { type: 'start' },
      { type: 'delta', text: '番茄' },
      { type: 'delta', text: '炒蛋' },
      { type: 'done' },
    ])
  })

  it('error 事件转为可重试错误', async () => {
    const response = responseFrom([
      'data: {"type":"start"}\n\ndata: {"type":"error","message":"执行失败"}\n\n',
    ])
    await expect(consumeChatSse(response, () => {})).rejects.toThrow('执行失败')
  })

  it('缺少 done 时报告流中断', async () => {
    const response = responseFrom([
      'data: {"type":"start"}\n\ndata: {"type":"delta","text":"一半"}\n\n',
    ])
    await expect(consumeChatSse(response, () => {})).rejects.toThrow('意外中断')
  })
})
