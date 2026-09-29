# Domain Context

kanocifer.chat是一个个人阅读追踪 + 博客系统，名称源于日语 "kuro neko"（黑猫）。

> 本仓库是**开源前端**。后端为独立私有仓库 `Server-Py`（FastAPI）/ `Server-Go`（Gin）。
> 下方词汇表是**跨端真源**：前端据此理解接口语义，后端实现细节见各自仓库。

## Stack（本仓库）

- Desktop frontend: Vue 3.5 (`frontend/apps/vue-app/`)
- Mobile frontend: React 19 (`frontend/apps/react-app/`)
- Shared packages: `@readinglist/{api,brand,config,types,utils}` (`frontend/packages/`)

## Domain Glossary

| 术语              | 含义                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| User              | 系统用户，支持密码/Passkey/GitHub OAuth 三种认证方式。`ADMIN_USER_IDS`（默认 `[1, 2]`）为管理员 |
| Profile           | 用户个人资料，与 User 一对一关联（PostgreSQL）                                                  |
| Post              | 博客文章（MongoDB），Markdown 正文、分类、评论（Twikoo）、点赞、浏览量（views）                 |
| Moment (碎碎念)   | 轻量动态（MongoDB），类似 Twitter。支持图片/链接/书籍/引用附件、标签、心情、定位、可见性控制    |
| Subscription      | 付费订阅追踪（PostgreSQL），账单周期、月度费用、多渠道到期提醒（Email/Bark/飞书）               |
| Device            | 设备资产跟踪（PostgreSQL），里程碑提醒（100 天/1 年等）、成本分析                               |
| FishingRecord     | 钓鱼记录（MongoDB），天气/潮汐/用户反馈 + 专家评分（9 特征加权）+ ML 残差校准（Ridge 回归）     |
| FishingModelMeta  | 钓鱼 ML 模型元数据（MongoDB），版本/训练时间/权重持久化                                         |
| WeRead (微信读书) | 外部书源（MongoDB），用户通过 token 导入书架。`WereadBook`/`UserBook`/`Archive` 文档模型        |
| RssArticle        | RSS 订阅文章（MongoDB），聚合/已读标记                                                          |
| Changelog         | 版本更新日志（MongoDB），双端通过 API 读取                                                      |
| DevTask           | 开发任务看板（MongoDB），Kanban 三列排序                                                        |
| FriendLinks       | 友链（MongoDB），每日精选轮换                                                                   |
| GalleryImage      | 图库图片，PostgreSQL `pic` 表 + Redis 缓存，瀑布流展示                                          |
| Event             | 系统事件（PostgreSQL `event` 表），承载 startup / deploy / notify_failure 等业务事件            |
| Admin             | 非角色系统。硬编码 `user.id in ADMIN_USER_IDS` 为管理员，用于内容审核、部署触发、系统监控       |
| Learning          | AI 课程生成模块（后端 service，agno/DeepSeek agent 驱动，课程包落盘）                                              |
| LearningProgress  | 用户/课程学习进度（MongoDB `learning_progress`，`(owner, course_id)` 唯一），状态三态 pending/ready/failed，字段 sessions_done / exercise_done / session_id |
| CoursePackage     | 磁盘课程包（CoursePackageRepo 持有），布局 `<course_id>/{lessons/0001-<slug>.md, 0001-<slug>.exercise.md, resource.md, MISSION.md}`，course_id 格式 `<slug>--<8hex>` |
| DesignProvider    | 设计出图的服务商接入参数（协议 / 端点 / 鉴权 / 模型目录）。现有 `ark`（火山方舟 Seedream）与 `apiyi`（gpt-image-2-all，OpenAI 兼容协议）；换服务商＝换此参数。**服务商统一称 Provider，不称 Agent**（Agent 专指 `Learning` 的 LLM agent） |
| DesignRouter      | 设计出图的服务商路由：按请求的 `model`（展示名或上游 ID）自动选择 Provider——模型属于哪个 Provider 的目录就发给谁。全部 Provider 同时注册，`DESIGN_PROVIDER` 只表示 `model` 缺省时的默认服务商。 |
| Credit            | 积分体系（余额 + 流水），出图与课程等能力按张预扣、失败退款；admin 可发放，grant 支持 email → user_id 解析 |
| Nomu (名目)       | 云端配置同步 + blob 代理 + 多设备同步总线（`/nomu/sync/ws`），另有魔法登录落地页 `NomuLanding` |
| Mission           | 课程目标文档 `MISSION.md`：为什么学 / 成功长什么样 / 约束 / 不做范围，每门课程根目录一份，是课程 agent 每个教学决策可溯源的目标依据（task-365）。原「mission」术语 2026-08 统一改名至此，练习题改称 Exercise，勿再混用 |
| Exercise          | 练习题，`<num>-<slug>.exercise.md` front matter 的 `exercises` 列表；原「mission」术语 2026-08 统一改名至此，进度标志为 `exercise_done` |

## 存量说明（2026-08 术语统一）

- `LearningProgress.mission_done` 字段与旧 `missions:` YAML key **不迁移**：
  存量数据保持原样，需要时手动重新标记（`exercise_done`）或重新生成课程即可。
- `MISSION.md` 只在课程根目录存在一份，旧 `mission.md` / `missions:` 产物不
  自动读取或转换；重试/渐进产出由 `save_mission` 工具幂等保护，不覆盖已存在内容。

