---
name: testing
description: 测试规范 —— 用 Vitest + React Testing Library 编写单元/组件测试，覆盖数据逻辑与关键交互。新增功能或修改核心逻辑后需要补测试时使用。
triggers:
  - 测试
  - 单元测试
  - vitest
  - 用例
  - 补测试
  - 写测试
  - 回归
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
---

# 测试（testing）

## 何时使用

为新增功能补测试、验证核心逻辑（过滤、计划、采购统计）或做回归验证。

## 技术栈

Vitest + React Testing Library（+ `@testing-library/user-event`）。首次使用需初始化：

```bash
cd frontend && pnpm add -D vitest @testing-library/react @testing-library/user-event jsdom
# 并在 package.json 增加脚本："test": "vitest run"
```

## 约定

- 测试文件与源文件同目录，或放 `frontend/__tests__/`，命名 `*.test.ts(x)`。
- 优先测**纯逻辑**（过滤规则、新鲜度计算、计划生成、采购统计），再测关键组件交互。
- 不测第三方（shadcn 组件、Next.js 框架本身）。

## 关键被测逻辑

- **过敏 / 忌口过滤**：菜谱 `needs` / `ingredients` 命中过敏或忌口项即被排除。
- **新鲜度状态**：按 `daysLeft` 计算（新鲜 / 尽快食用 / 临期）。
- **采购统计**：完成数 / 总数、进度。

## 工作流程

1. 确定要测的行为（先纯逻辑，后交互）。
2. 写测试用例与断言。
3. `cd frontend && pnpm test` 运行；失败则修复实现或断言。
4. 确保不破坏已有测试。

## 验收

- 测试全部通过；关键逻辑有覆盖；测试可重复运行、不依赖环境。
