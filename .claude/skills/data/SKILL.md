---
name: data
description: 数据层规范 —— 数据模型、类型定义、IndexedDB 本地持久化、系统静态数据（recipes.json/食材字典）。涉及食材库存、菜谱、采购清单、饮食计划、偏好等数据的存储与读写时使用。
triggers:
  - 数据
  - 持久化
  - indexeddb
  - 存储
  - 数据模型
  - schema
  - 类型定义
  - 食材库存
  - 菜谱数据
  - 本地存储
  - 数据库
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
---

# 数据层（data）

## 何时使用

新增 / 修改数据模型、类型定义、本地持久化（IndexedDB）或系统静态数据时。

## 架构

四层：**系统基础数据（静态 JSON）+ 用户数据（IndexedDB）+ 规则过滤 + 本地持久化**。详见 `docs/数据架构与本地持久化设计规范.md`。

- **系统数据（静态，只读，代码内置）**：基础菜谱库 `recipes.json`、食材字典。随应用发布，用户不可改。
- **用户数据（IndexedDB）**：我的食材（库存）、我的菜谱（自定义）、饮食偏好（过敏 / 忌口 / 口味）。

## 核心模型（TypeScript type）

```ts
type Ingredient = { id: string; name: string; icon: string; quantity: number; unit: string; storage: string; daysLeft: number; status: string }   // 库存
type Recipe = { id: string; title: string; category: string; flavor: string; time: number; difficulty: string; needs: string[]; prep: string; seasoning: string; steps: string[]; allergens?: string[] }  // 菜谱
type ShopItem = { id: string; name: string; quantity: number; unit: string; checked: boolean; source: string }   // 采购项
type MealPlan = Record<string, Record<'早餐' | '午餐' | '晚餐', string[]>>                                                  // 饮食计划
type Prefs = { allergy: string[]; avoid: string[]; flavors: string[]; time: string; difficulty: string[]; people: string }  // 偏好
```

## 约定

- 类型定义统一放 `frontend/lib/types.ts`（或按域拆分），用 TypeScript `type`，不散落在组件里。
- 用户数据读写统一封装到 storage 模块（如 `frontend/lib/db.ts`），页面组件不直接碰 IndexedDB。
- 系统静态数据放 `frontend/lib/data/`（`recipes.json` 等），只读。
- 当前 `food-app.tsx` 用 useState + 硬编码种子数据，重构时逐步迁移到 storage 模块，**保持 UI 行为不变**。

## 工作流程

1. 明确是新增系统数据还是用户数据。
2. 定义 / 更新类型（`lib/types.ts`）。
3. 系统数据：编辑 `lib/data/*.json`；用户数据：扩展 `lib/db.ts` 的读写函数。
4. 页面层只调用 storage 模块函数，不直接操作 IndexedDB。
5. 自检：刷新页面数据不丢失（IndexedDB 生效）。

## 验收

- 类型集中、可复用；持久化数据刷新后保留；过敏 / 忌口过滤逻辑仍正确。
