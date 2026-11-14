# 第一部分：Agent 自定义与团队管理

验收日期：2026-11-12（Asia/Hong_Kong）。本文件记录第一部分的实现范围；可视化工作流设计器不在本次交付中。

## 可用能力

| 验收目标 | 实现与证据 |
| --- | --- |
| 系统角色与自定义角色 | 六个只读系统定义；Developer／Tester 模板；角色、职责、指令、约束、模型引用、能力、工具、记忆、预算和输入输出结构可编辑 |
| 生命周期 | 创建、复制指定版本、编辑草稿、保存固定版本、启用、停用、删除／归档；历史版本保留 |
| 团队构建 | 固定成员版本、成员顺序、职责、协调成员、顺序交接；也可按能力选择一名成员；团队复制及新版本 |
| 真实执行 | StudioService 将选定配置编译为现有 WorkflowDefinition；Orchestrator 共用运行队列与 DynamicScheduler；WorkflowEngine 实际派发 |
| 配置实际生效 | 新 ConfiguredBrain 消费系统指令、职责、约束、模型设置、记忆策略和 Schema；受限模型／工具循环，无离线降级 |
| 版本追溯 | 接收运行时固定团队、成员版本、完整配置、内容哈希、模型引用、编译器版本和执行指纹；排队后的编辑及停用不改写快照 |
| 多运行隔离 | 每次运行使用独立 Agent 实例；调度名额以定义 ID 共享，防止每次实例化绕过并发限制；能力匹配局限于选定团队 |
| 权限 | operator 管理与测试；viewer 只读目录与公开运行证据；服务端实施成员、团队、平台工具权限交集；跨站写请求拒绝 |
| 持久化与冲突 | 复用原子文件写入与单进程所有权锁；If-Match 防止覆盖他人编辑；保存失败不更新内存；损坏文件保留并退出 |
| 运行证据 | 实际节点输入／输出、成功或失败、工具调用、Token 与耗时；SSE 驱动更新；运行详情及历史可追溯固定版本 |
| 兼容性 | 原预设、真实仓库执行链路、验收和补丁接口保留；无新运行时依赖、无技术栈迁移 |

## API 契约

以下路径均在已有登录和角色校验之后处理。`agents` 路径可替换为 `teams`。

| 方法与路径 | 行为 |
| --- | --- |
| `GET /api/studio/catalog` | 当前安全模型引用、工具目录、能力边界和创建模板；没有 API Key |
| `GET /api/studio/agents` | 目录摘要，viewer 可访问 |
| `POST /api/studio/agents` | `{slug, config}` 创建，或 `{slug, copyFrom:{id,revision}}` 复制；初次创建固定 v1 |
| `GET /api/studio/agents/:id` | 配置、草稿、版本列表及 ETag；operator |
| `PUT /api/studio/agents/:id/draft` | 完整配置；必须携带 `If-Match` |
| `POST /api/studio/agents/:id/revisions` | `{}`；将当前草稿固定为下一版本，必须携带 `If-Match` |
| `GET /api/studio/agents/:id/revisions[/:revision]` | 历史不可变版本 |
| `PATCH /api/studio/agents/:id` | `{enabled:boolean}`；必须携带 `If-Match` |
| `DELETE /api/studio/agents/:id` | 归档；必须携带 `If-Match` |
| `POST /api/studio/tests` | `{agentRef:{id,revision}, input:{...}}`；返回 `202 {runId}` |
| `POST /api/studio/runs` | `{kind:"team", teamRef:{id,revision}, input:{...}, capability?}`；返回 `202 {runId}` |
| `GET /api/studio/runs/:runId` | 完整版本快照、节点尝试、结果与错误；operator |

执行接口支持 `Idempotency-Key`：同一账号与相同请求返回已有运行；同键不同输入返回 `409`。沿用 `/api/runs/:id/events`、`/api/runs/:id/cancel`、运行详情和报告接口。

常见错误：`422 INVALID_CONFIG`、`428 ETAG_REQUIRED`、`409 VERSION_CONFLICT`、`409 DISABLED`、`409 MODEL_REVISION_UNAVAILABLE`、`503 MODEL_UNAVAILABLE`、`503 STORAGE_FAILED`。保存冲突不清空浏览器编辑内容。

## 执行边界

- `sequence` 要求交接恰好覆盖相邻成员，缺失、倒序或额外边均在保存时拒绝；不会静默忽略关系。`capability` 每次运行只选择一位成员，不允许同时声明交接。
- 最大模型轮数包含工具请求；Studio 不自动重试整个 Agent，避免绕过轮数和重复副作用。底层网络重试仍服从既有 Provider 配置。
- 输入输出 Schema 是显式支持的子集：type、properties、required、additionalProperties、items、enum；拒绝不支持的关键字。
- 记忆为无记忆或本次运行窗口，不跨运行共享。固定版本不存储 API Key；模型配置变更后旧模型引用不可运行，自定义 Agent 需新建版本绑定当前模型；系统模板自动追加新版本，保留旧版本及原运行证据。
- 平台只开放 `static_analyzer` 和 `git_patch_manager`（仅生成 diff，不应用补丁）。`test_runner`、`code_sandbox` 及仓库操作没有接通审批前均被服务端禁止，不能通过直接 API 或模型请求绕过。
- 系统模板继承现有限流器专用角色行为；通用任务应使用自定义 Developer／Tester。系统工程团队是可复制的分工模板，并不代替原有含验收与自愈的预设工作流。
- 模型返回 `approved: true` 仅是 Agent 输出；没有正式 VerificationEngine 验收的运行不发布已验证补丁。
- 文件存储适用于本地单服务，不支持多个服务同时写入同一数据目录；未指定 dataDir 的嵌入式使用是内存模式，页面明确提示。

## 验证方式

本轮结果：`npm.cmd test` 通过原有 **303** 项检查与新增 **81** 项 Studio 检查，共 **384** 项；TypeScript 编译及 `git diff --check` 通过。浏览器完整流程、历史证据恢复、版本冲突保留输入和窄屏布局检查通过。

`npm.cmd test`：原有回归 + `tests/studio-tests.ts`。新增检查覆盖版本、复制、停启用、归档、Schema、指令实际生效、上下游输入映射、服务端工具拒绝、模型轮数、内存隔离、并发容量、取消、超时、授权、跨站写保护、幂等请求、持久化和写入失败。

浏览器使用本机 Edge headless 与临时测试服务完成：登录 → 创建 Developer／Tester → 草稿及 v2 → 历史版本只读 → Agent 测试 → 团队固定版本 → 真实引擎交接与静态工具调用 → 390px 窄屏无横向溢出 → 冲突保留本地输入。检查页面无 JavaScript 错误，另检查运行历史追溯。

自动化和浏览器验收采用注入模型响应，调用的调度器、工作流引擎、工具、API、SSE 和存储均为实际实现。未以外部模型或真实 Docker 环境做新增 Live 验收；不能将测试响应当作模型能力证明。
