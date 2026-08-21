---
name: frontend
description: 前端开发规范与流程 —— Next.js/React/Tailwind/shadcn 页面、组件、UI 的实现与修改。当需要新增或修改页面、组件、样式、交互时使用。
triggers:
  - 前端
  - 页面
  - 组件
  - 界面
  - 样式
  - 布局
  - 新增页面
  - 修改页面
  - 改样式
  - shadcn
  - tailwind
  - react
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
---

# 前端开发（frontend）

## 何时使用

新增或修改页面、组件、样式、交互时。涉及数据读写配合 `data` 技能；涉及接口调用配合 `backend` 技能。

## 技术栈

Next.js 16（App Router + RSC）· React 19 · TypeScript（strict）· Tailwind CSS 4 · shadcn/ui（base-nova）· lucide-react

## 约定

- 所有前端代码在 `frontend/` 下，路径别名 `@/*` 指向 `frontend/`。
- 页面放 `frontend/app/`，业务组件放 `frontend/components/`，shadcn UI 组件放 `frontend/components/ui/`，工具函数放 `frontend/lib/`。
- 需要浏览器交互 / 状态的组件顶部加 `'use client'`。
- 类名合并一律用 `@/lib/utils` 的 `cn()`。
- UI 文案用简体中文。
- 移动端优先：主容器 `max-w-[390px]`，底部导航 5 个 Tab（食材 / 菜谱 / 计划 / 采购 / 我的）。
- 当前 `components/food-app.tsx` 是单文件原型，新增功能时优先按域拆成独立组件，避免继续膨胀。

## 工作流程

1. 明确需求与改动范围（新增还是修改？影响哪些页面 / 组件？）。
2. 先读相关现有文件，理解 `food-app.tsx` 的结构、状态与现有交互。
3. 优先复用 shadcn 组件（`components/ui/`）；缺组件用 `cd frontend && pnpm dlx shadcn@latest add <name>` 添加。
4. 实现组件 / 页面，命名、代码风格与现有代码保持一致。
5. 自检：`cd frontend && pnpm lint`，`pnpm dev` 在 390px 视口下走一遍交互。

## 验收

- 类型检查与 lint 通过；交互在 390px 视口下正常；不破坏其他 Tab 功能。
