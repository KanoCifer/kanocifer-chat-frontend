# Commands

> **代码质量检查已自动化**：per-edit 由 `.claude/settings.json` 的 PostToolUse hook 触发 prettier / oxlint；commit 时由 `.git/hooks/pre-commit` 闸门跑 type-check。下方命令保留作为手动覆盖 / 调试参考。
>
> 后端（Python / Go）已拆分为独立私有仓库 `Server-Py` / `Server-Go`，其命令见各自仓库。

## Desktop (Vue)

```bash
cd frontend/apps/vue-app
pnpm install                        # install deps
pnpm run dev                        # dev server (:5173)
pnpm run build                      # tsc -b && vite build (only if user asks)
pnpm run build-only                 # vite build only
pnpm run type-check                 # vue-tsc --noEmit
pnpm run lint                       # oxlint
pnpm run lint:fix                   # oxlint auto-fix
pnpm run format                     # prettier (auto-sorts tailwind classes)
pnpm run test:unit                  # vitest
pnpm run test:unit -- --run         # single run (not watch mode)
```

## Mobile (React)

```bash
cd frontend/apps/react-app
pnpm install                        # install deps
pnpm run dev                        # dev server (:5174)
pnpm run build                      # tsc -b && vite build (only if user asks)
pnpm run build-only                 # vite build only
pnpm run type-check                 # tsc --noEmit
pnpm run lint                       # oxlint
pnpm run lint:fix                   # oxlint auto-fix
pnpm run format                     # prettier
pnpm run test:unit                  # vitest run
```

## 共享包（packages/）

```bash
cd frontend/packages/utils
pnpm run test                # @readinglist/utils 单测（vitest）
pnpm run type-check          # @readinglist/utils 类型检查

cd frontend/packages/api
pnpm run type-check          # @readinglist/api 类型检查
```

## 跨端快捷命令（在 frontend/ 下执行）

```bash
cd frontend
pnpm install                        # 一次性安装所有依赖
pnpm run dev:vue                    # 启动 Vue dev server
pnpm run dev:react                  # 启动 React dev server
pnpm run build                      # 构建两端
pnpm run type-check                 # 类型检查两端
pnpm run test                       # 运行两端单测
pnpm run lint                       # 检查两端 lint
```
