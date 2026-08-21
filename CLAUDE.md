# 食光 - 家庭食材助手

面向家庭做饭人群的**本地优先（Local-First）PWA**：记录家里有什么、快速找到能做什么、安排哪天吃什么、整理还要买什么。

## 技术栈

- **前端**：Next.js 16（App Router + RSC）· React 19 · TypeScript 5（strict）· Tailwind CSS 4 · shadcn/ui（base-nova 风格、neutral 色）· lucide-react 图标
- **包管理**：pnpm
- **后端**：Hono 4.x（轻量 API。当前 V1.3 为本地优先、不调用 AI，`backend/` 目录预留）
- **AI 助手（可选）**：对话智能体由用户在 **Coze** 构建（指令见 `docs/coze-agent-prompt.md`），项目经 `frontend/app/api/chat/route.ts` 服务端代理转发（隐藏 API Key）；无 Key 时功能自动提示未配置、不影响核心功能
- **数据**：Local-First，IndexedDB 持久化 + 系统静态 JSON（`recipes.json`、食材字典）
- **测试**：Vitest（单元测试）+ playwright-core 移动端冒烟（`scripts/smoke.mjs`）

## 目录结构

- `frontend/` — Next.js 应用（全部前端代码）
- `backend/` — Hono 后端（预留，V1.3 暂不使用）
- `docs/` — 产品需求与设计文档（当前版本为 `V1.3_MVP.md`）
- `.claude/skills/` — 项目专属开发技能

## 关键约定

- 路径别名 `@/*` 指向 `frontend/` 根目录。
- 页面放 `frontend/app/`，业务组件放 `frontend/components/`，shadcn UI 组件放 `frontend/components/ui/`，工具函数放 `frontend/lib/`。
- 类名合并统一用 `@/lib/utils` 的 `cn()`。
- 需要浏览器交互 / 状态的组件顶部加 `'use client'`。
- 产品语言简体中文（zh-CN），UI 文案用中文。
- 移动端优先：主容器 `max-w-[390px]`，底部 5 个 Tab（食材 / 菜谱 / 计划 / 采购 / 我的）。
- 数据层已拆分：类型在 `frontend/lib/types.ts`，静态数据/常量/纯函数在 `frontend/lib/data.ts`（含食材字典、别名表、60 道系统菜谱、过敏/忌口过滤），IndexedDB 持久化在 `frontend/lib/db.ts`，日/周计划生成与缺失食材汇总在 `frontend/lib/planner.ts`。
- `frontend/components/food-app.tsx` 为应用主组件（含全部页面与弹窗），状态经 `lib/db.ts` 自动持久化到 IndexedDB；系统菜谱（`SYSTEM_RECIPES`）为静态只读，用户数据（食材/我的菜谱/收藏/计划/采购/偏好）走 IndexedDB。
- PWA：`public/manifest.webmanifest` + `public/sw.js`（Service Worker 仅生产环境注册，避免干扰 dev 热更新）；图标源文件 `public/food-icon.svg`。

## 常用命令

```bash
cd frontend && pnpm install    # 安装依赖
cd frontend && pnpm dev        # 本地开发
cd frontend && pnpm build      # 构建
cd frontend && pnpm start      # 生产模式运行（部署前验证）
cd frontend && pnpm test       # Vitest 单元测试（tests/）
# 移动端冒烟（需先 pnpm build && pnpm start，本地 Chrome）：
cd frontend && node scripts/smoke.mjs
```

## 数据架构

系统数据（静态）与用户数据（IndexedDB）分层。

- **系统数据（静态，只读）**：系统菜谱 `SYSTEM_RECIPES`（60 道）、食材字典 `INGREDIENT_DICT`、别名表 `ALIASES`，见 `frontend/lib/data.ts`。
- **用户数据（IndexedDB，单 store 整体读写）**：我的食材（库存）、我的菜谱（自定义，含图片 dataURL）、收藏、饮食计划、采购清单、偏好（过敏 / 忌口 / 口味），见 `frontend/lib/db.ts`。

## AI 助手（可选能力）

- **Coze 侧**：用户在 Coze 创建智能体并粘贴 `docs/coze-agent-prompt.md` 的「人设与回复逻辑」，拿到 `Bot ID`。智能体按「是否收到 `【本地数据】` 块」自动切两种模式：本地模式（用真实食材/忌口/过敏，优先临期、避过敏）／热门模式（网络热门菜）。
- **项目侧**：`frontend/lib/aiContext.ts` 的 `buildAiContext()` 把用户本地数据打包成带 `【本地数据】` 标记的中文摘要（`enabled:false` 时返回 `null`）；`frontend/app/api/chat/route.ts` 服务端代理 Coze Chat API，隐藏 Token。
- **开关**：前端对话弹窗内的「接入我的食材数据」开关，开＝发送本地数据上下文（本地模式），关＝不发送（热门模式）。
- **配置**：环境变量见 `frontend/.env.local.example`（`COZE_API_TOKEN` 必填，`COZE_BOT_ID`/`COZE_MODEL` 二选一）。Key 只存服务端/本地环境变量，绝不进客户端 bundle。

## 开发技能（Skills）

项目专属技能见 `.claude/skills/`，覆盖完整开发流程：

| 技能 | 职责 |
|------|------|
| `dev-flow` | 端到端开发流程（总入口） |
| `frontend` | 页面 / 组件 / UI |
| `backend` | Hono 接口（预留） |
| `data` | 数据模型 + IndexedDB 持久化 |
| `testing` | Vitest 测试 |
