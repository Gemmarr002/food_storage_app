# 项目技能（Skills）说明

本目录存放「食光」项目专属技能，供 Claude Code 在本项目内自动或手动调用。

## 目录结构

| 技能 | 目录 | 职责 |
|------|------|------|
| 开发流程 | `dev-flow/` | 总入口，从需求到交付 |
| 前端 | `frontend/` | 页面 / 组件 / UI |
| 后端 | `backend/` | Hono 接口（预留） |
| 数据 | `data/` | 数据模型 + IndexedDB 持久化 |
| 测试 | `testing/` | Vitest 测试 |

## 调用方式

- **手动**：输入 `/<name>`，例如 `/dev-flow`、`/frontend`、`/data`、`/testing`、`/backend`。
- **自动**：当你的描述匹配某个技能 `SKILL.md` 里的 `triggers` 时自动触发。

## 封装与路径约定

- 每个技能一个独立目录，`SKILL.md` 自包含（含 frontmatter 的 `name` / `description` / `triggers` / `allowed-tools`）。
- 项目级通用约定（技术栈、目录、命令、数据架构）统一放根目录 `CLAUDE.md`，技能内不重复，只引用。
- 领域设计文档统一放 `docs/`，技能在需要时读取。
