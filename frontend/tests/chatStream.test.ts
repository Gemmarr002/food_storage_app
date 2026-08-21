import { describe, expect, it } from 'vitest'
import { consumeCozeSse } from '@/lib/chatStream'

function responseFrom(parts: string[]) {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part))
      controller.close()
    },
  }))
}

describe('consumeCozeSse', () => {
  it('跨网络分片按顺序拼接 answer', async () => {
    const chunks: string[] = []
    const response = responseFrom([
      'event: message\ndata: {"type":"message_start","content":{}}\n\n',
      'event: message\ndata: {"type":"answer","content":{"answer":"番',
      '茄"}}\n\nevent: message\ndata: {"type":"answer","content":{"answer":"炒蛋"}}\n\n',
      'event: message\ndata: {"type":"message_end","content":{"message_end":{"code":"0","message":""}}}\n\n',
    ])
    await consumeCozeSse(response, chunk => chunks.push(chunk))
    expect(chunks.join('')).toBe('番茄炒蛋')
  })

  it('message_end 非零状态转为错误', async () => {
    const response = responseFrom([
      'event: message\ndata: {"type":"message_end","content":{"message_end":{"code":"500","message":"执行失败"}}}\n\n',
    ])
    await expect(consumeCozeSse(response, () => {})).rejects.toThrow('执行失败')
  })

  it('缺少 message_end 时报告流中断', async () => {
    const response = responseFrom(['event: message\ndata: {"type":"answer","content":{"answer":"一半"}}\n\n'])
    await expect(consumeCozeSse(response, () => {})).rejects.toThrow('意外中断')
  })
})
