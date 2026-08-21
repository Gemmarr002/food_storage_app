---
name: backend
description: 后端开发规范 —— 用 Hono 搭建轻量 API 接口（路由、参数校验、错误处理、密钥托管、代理第三方服务）。当前 V1.2 本地优先、后端目录预留，仅在需要服务端能力时使用。
triggers:
  - 后端
  - 接口
  - api
  - hono
  - 路由
  - 服务端
  - server
  - 代理
  - 密钥
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
---

# 后端开发（backend）

## 何时使用

需要服务端能力时（API 接口、代理第三方 AI、托管密钥）。**V1.2 为 Local-First 本地优先，默认不需要后端**；仅在后续重新引入 AI 或确有服务端需求时启用。

## 技术栈

Hono 4.12.25（版本已在 `frontend/package.json` 的 `pnpm.overrides` 中锁定）。

## 约定

- 后端代码放 `backend/`，与 `frontend/` 相互独立。
- 用 Hono 路由 + 校验（`hono/validator` 或 zod）组织接口，输入输出都校验。
- 敏感密钥（模型 API Key 等）只放服务端环境变量，**绝不进入前端 bundle**。
- 统一错误返回结构，前端可稳定解析。

## 工作流程

1. 明确接口契约（方法、路径、入参、出参、错误码）。
2. 在 `backend/` 下建 Hono 应用与路由。
3. 实现校验与统一错误处理。
4. 本地启动，用 `curl` 验证成功与失败两类返回。
5. 前端通过相对路径 `/api/*` 调用（Next.js rewrite 到后端，或后端独立部署为函数）。

## 验收

- 接口正确返回成功与错误两类结果；密钥不出现在前端产物；输入校验完整。
