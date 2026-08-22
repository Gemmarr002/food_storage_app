# Coze Coding Agent API 契约

本文档记录食光 V1.4 服务端代理所使用的集成边界，不包含 Token、真实项目 ID 或用户数据。

## 服务端配置

- `COZE_API_BASE_URL`：已部署 Agent 的 HTTPS 基础地址，不含末尾斜杠。
- `COZE_PROJECT_ID`：Coze 项目 ID，仅由服务端读取。
- `COZE_API_TOKEN`：Bearer Token，仅由服务端读取。

浏览器请求不得包含上述字段。

## 上游请求

- 方法：`POST`
- 地址：`${COZE_API_BASE_URL}/stream_run`
- 请求头：`Authorization: Bearer <token>`、`Content-Type: application/json`、`Accept: text/event-stream`
- 请求体：Coze Coding Agent 的 `query` 内容、服务端注入的 `project_id`，以及当前会话复用的 UUID `session_id`。

用户问题与结构化本地上下文由服务端包装为相互隔离的 `<user_query>` 和 `<app_context>`。上下文中的 `<` 会转义，避免用户自定义食材文本突破数据边界。

## 上游 SSE

当前部署使用以下事件：

- `answer`：增量文本位于 `content.answer`。
- `message_end`：`content.message_end.code` 为 `0` 表示正常结束，非零表示失败。
- `error`：Agent 执行失败。

服务端将上游事件标准化后再发送给浏览器。浏览器只依赖：

```ts
type ChatStreamEvent =
  | { type: 'start' }
  | { type: 'delta'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string }
```

## 超时与数据边界

- Route Handler 的最大运行时间为 60 秒，上游连接在 55 秒时中止。
- App 请求体上限为 64 KiB，问题上限 2,000 字符。
- 每轮最多发送 100 条 active 食材、50 条过敏和 50 条忌口。
- App 不发送菜谱库、图片、data URL、计划或采购历史。
- 当前进程按客户端 IP 实施每 10 分钟 30 次的基础限流；多实例生产环境如需全局精确限流，应接入共享存储。
