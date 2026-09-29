# Environment

> 本仓库是**开源前端**。后端（Python / Go）已拆分为独立私有仓库 `Server-Py` / `Server-Go`，
> 其环境变量、部署与运维配置见各自仓库。

- Desktop: `frontend/apps/vue-app/` — Vue 3.5
- Mobile: `frontend/apps/react-app/` — React 19
- Shared API layer: `frontend/packages/api/` — `@readinglist/api`（apiClient + 拦截器 + 所有 gateway）
- Shared utils: `frontend/packages/utils/` — `@readinglist/utils`（框架无关纯工具 + 领域纯函数）
- Shared types: `frontend/packages/types/` — `@readinglist/types`
- Brand themes: `frontend/packages/brand/themes/` — shared CSS variables (4 schemes: paper / sage / mist / blush)
- Brand prose: `frontend/packages/brand/prose.css` — `.prose` article styles (shared across both frontends)

## Required Env Vars

两端前端各自在 `apps/<app>/.env` 中配置（`.env` 不入库，`.env.example` 为模板）：

| Variable                 | Description                                                              |
| ------------------------ | ------------------------------------------------------------------------ |
| `VITE_API_BASE`          | API 根地址，如 `https://api.example.com`（未设置时走 dev proxy）           |
| `VITE_JS_API`            | 站点 JS 配置标识                                                         |
| `VITE_JS_API_TOKEN`      | 站点 JS 配置 token                                                       |
| `VITE_AMAP_SECURITY_CODE` | 高德地图安全码（钓鱼点天气等地图能力需要）                                |
| `GITHUB_CLIENT_ID`       | GitHub OAuth 客户端 ID（登录用）                                          |
| `GITHUB_OAUTH_URL`       | GitHub OAuth 授权端点，如 `<API_BASE>/v3/auth/github`                     |

> 密钥只走环境变量，**不要提交 git**。`.env` 已被各 app 的 `.gitignore` 忽略。

## Dev Proxy

本地开发时前端通过 Vite proxy 转发 `/api` 与 `/v3` 到后端 dev server，避免跨域。
目标地址见 `apps/<app>/vite.config.ts` 中的 `server.proxy`。
