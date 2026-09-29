# AGENTS.md

`CLAUDE.md` 是本文件的软链。改规则只改这里。

> 本仓库是 **kanocifer.chat 的开源前端**。后端在独立私有仓库
> `Server-Py`（FastAPI，`/api/v2/*`）与 `Server-Go`（Gin，`/api/v3/*`），
> 不在本仓库内 —— 不要在本仓寻找或修改后端代码。
>
> **本仓库是前端的唯一工作区**。历史 monorepo `ReadingList`（已转私有）
> 保留同一份代码的拷贝与完整 git 历史，仅作归档 —— 不要在那里改前端代码。

## 1) Rules (Highest Priority)

- 颜色一律走**语义化 Tailwind class**（如 `bg-surface` / `text-muted`），取值来自 `@readinglist/brand` 主题变量。
- 构建只在用户明确要求时执行；其余情况用 `pnpm run type-check` / `pnpm run test:unit` 验证。

## 2) Documentation Index

按需查，不要通读。**领域词汇**查 [CONTEXT.md](CONTEXT.md)（唯一真源，含 Learning / 出图 Provider / 积分 / Nomu）。

### 项目规约 `docs/rules/`

| 文档                                                     | 什么时候读                                        |
| -------------------------------------------------------- | ------------------------------------------------- |
| [architecture.md](docs/rules/architecture.md)           | 动共享包、双端分流、前端目录约定前                  |
| [code-style.md](docs/rules/code-style.md)               | 写 Vue / React / 共享包代码前                      |
| [commands.md](docs/rules/commands.md)                   | 需要跑命令、起服务、跑测试时                       |
| [environment.md](docs/rules/environment.md)             | 配前端环境变量时                                   |
| [testing.md](docs/rules/testing.md)                     | 写前端单测、mock 约定时                            |
| [domain.md](docs/rules/domain.md)                       | 指针，内容在 `CONTEXT.md`                          |

### 架构决策 `docs/adr/`（不可逆决策，改动前先读相关篇）

| ADR                                                | 决策                                     |
| -------------------------------------------------- | ---------------------------------------- |
| [0002](docs/adr/0002-dual-frontend-architecture.md) | 双前端（Vue 桌面 / React 移动 + UA 分流）  |
| [0001](docs/adr/0001-record-architecture-decisions.md) | ADR 记录规约                        |

> 后端相关 ADR（数据层 / 后端分层 / Go 分层 / 日志编排 / Learning v2）
> 已随代码迁至 `Server-Py` / `Server-Go` 各自的 `docs/adr/`。

背景说明：[PRODUCT.md](PRODUCT.md)（产品定位）· [DESIGN.md](DESIGN.md)（设计系统）。

## devtask 工作流

本项目用 devtask 看板管理开发任务，**优先用 skill 而不是直接调 MCP 工具**。

### 工作流

需求 → `/devtask`（落库为 spec + 子任务树）
→ `/devtask-doit task-N`（执行指定任务）
→ `/devtask-review`（验收条件 + 代码审查）
→ `update_task(slug, status=...)` 标已完成

### 何时使用

| 场景                             | 技能                  |
| -------------------------------- | --------------------- |
| 新需求、需拆 spec + 子任务        | `/devtask`            |
| 执行已落库的任务                 | `/devtask-doit task-N`|
| 验收已完成任务                   | `/devtask-review`     |
| 看板尚未初始化 / 环境异常        | `/devtask-setup`      |

### 引用规范

- spec 是规划节点（kind=spec），subtask 是可执行单元（kind=subtask）
- `parent_slug` 承载结构归属，`blocked_by` 承载同层执行顺序依赖
- 状态推进统一走 `update_task(slug, status=...)` 或 `update_task(slugs=[...])`；其它字段修改走 `update_task(slug, detail=...)`
