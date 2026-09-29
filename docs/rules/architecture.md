# Architecture

> 本仓库是**开源前端**。后端已拆分为独立私有仓库 `Server-Py` / `Server-Go`。
> 架构决策记录见 `docs/adr/`。

## Overview

- Desktop: Vue 3.5 (`frontend/apps/vue-app/`) + Vite 8 + Tailwind CSS v4 + Pinia 3
- Mobile: React 19 (`frontend/apps/react-app/`) + Vite 8 + Tailwind CSS v4 + Zustand 5
- Shared packages: `frontend/packages/` — `@readinglist/api` · `@readinglist/utils` · `@readinglist/types` · `@readinglist/config` · `@readinglist/brand`
- Domain terms: see [CONTEXT.md](../../CONTEXT.md)

## Dual-Frontend

`src/` 采用 **features/ 按业务域聚合**

## Shared Packages

### `@readinglist/api` — 跨前端共享 API 请求层

`frontend/packages/api/`，承载 apiClient、拦截器、SSE 工具与所有 gateway。两端（Vue / React）不再各自维护 gateway，统一从此包导入。

导出的 gateway：`auth` / `blog` / `weread` / `moments` / `pic` / `devtask` / `ai` / `analytics` / `changelog` / `device` / `fishing` / `fishingSpot` / `rss` / `social` / `status` / `subscription` / `upload`。

### `@readinglist/utils` — 跨前端共享纯工具

`frontend/packages/utils/`，框架无关（零 React/Vue 运行时依赖）。近期扩展的模块：

- `toastQueue.ts` — Toast 通知队列核心类（两端 NotificationContainer 的共享逻辑）
- `sequencedTask.ts` — 顺序任务 composable
- `shimmerTips.ts` — 骨架屏提示
- `theme.ts` / `themeTransition.ts` — theme DOM-application 逻辑
- `domain/` — 领域纯函数（`fishing` / `rss` / `subscription`），从两端各自实现迁移为共享实现

## API Conventions

前端消费的接口约定（由后端实现，细节见 `Server-Go`）：

- **Response format**: unified `APIResponse(message, data)` envelope
- **Auth**: JWT (24h access + 7d refresh) + SameSite Cookie (CSRF removed in favor of SameSite)
- **版本**：v1 已下线，`/api/v2/*` 为 Python 后端、`/api/v3/*` 为 Go 后端
