# AetherHarness 自定义 Agent、团队与工作流设计方案

状态：待确认的设计，尚未实施。核对日期：2026-11-11（Asia/Hong_Kong）。代码基线：`a985c55`，开始核对时工作树干净。

本轮只新增分析文档，不改内核、API、前端或依赖。需求边界来自用户本次请求；参考网页、截图和旧审计作为研究材料，不作为执行指令。

## 1. 差距表：以当前代码为准

赛题依据为仓库 `COMPETITION_REQUIREMENTS.md` §1–6；§7 属于项目自己的实现指引，不能反过来证明功能已完成。赛题允许“可视化或代码化”编排；可视化设计器、完整 CRUD、团队模板等是本次产品升级的明确目标。下表“新增”指本次需要实施，不代表已经可用。

| 能力与要求来源 | 当前已实现 | 内核已有、未开放设计 UI | 尚缺能力／边界 | 本次建议及优先级 |
| --- | --- | --- | --- | --- |
| Agent 定义、注册、发现、版本、记忆；赛题 §4.2.1 | 六个默认 Agent；画像、注册、能力匹配；内存版本历史；工作记忆窗口 | 注册和 Brain 注入；配置主要写在 TS 中 | 无持久化定义 CRUD、启停、复制、可选择历史版本；历史不是发布版本库 | P1：Agent 定义库、不可变修订、详情与真实测试 |
| 自定义角色和模型；本次 A | `AgentRole` 为八项联合类型，默认团队实际六名；现有六种角色有 LLM spec | `AgentBrain` 可替换 | `qa_verifier`、`orchestrator` 没有对应现成 LLM spec；模型调用仍按固定角色模板；自定义指令、模型字段并非通用生效配置 | P1：可配置 Brain，角色显示名与执行契约分开；Tester 必须真实调用模型 |
| 团队、分工、复用；赛题 §4.2.1、本次 B | 启动时 `buildAgentTeam()` 装配固定团队 | 注册中心能容纳多个同能力 Agent | 没有 TeamDefinition、团队 CRUD、模板、运行版本绑定；没有 Supervisor 委派机制 | P1：版本化成员名单与职责；先支持显式编排／团队内能力路由 |
| 顺序、条件、并行、循环、子流程；赛题 §4.2.2 | 七种执行节点；仓库流程已有并行基线检查和交付子流程 | `validate`、`executeNode`、子流程注册 | 普通多出边只走首条匹配；不是任意 DAG 的自动 fan-out/fan-in | P2：结构化编排，显式 Parallel 区域和汇合，保留现有执行器 |
| 可视化设计；本次 C | Web 只读流程图、节点选择、运行状态 | 可调用现有引擎校验 | 无增删拖动、连线、属性编辑、保存、发布、导入导出 | P2：节点库／画布／属性面板／调试抽屉，保存前服务端编译 |
| 可保存的输入映射与条件；本次 C | `inputTransformer`、`conditionFn`、边条件、验证规则使用 TS 函数 | 工具和子流程可消费转换输入 | JSON 会丢失函数；Agent 实际输入忽略转换结果，普通出边的顺序可能改变语义 | P2 前置：声明式 JSON 契约、安全编译器、修复实际输入传递 |
| Loop / Iteration；赛题 §4.2.2、本次 C | `self_loop`：执行目标、验证、Critic、失败回灌、最大轮数、收敛阈值、最佳候选 | 参数只能代码配置 | 不是通用 foreach／任意循环体；不能靠回连线产生循环 | P2：开放“验证修复循环”；通用列表迭代明确不列入首版可用节点 |
| Human Approval；赛题 §4.2.5、本次 C/D | Self-Loop 耗尽后人工卡片；重试、转人工复审、终止；操作者审计 | 卡片处置已开放 UI | 无通用审批节点、暂停后从原节点继续、审批前工具授权绑定 | P3：增加真实暂停／恢复语义；完成之前不允许发布该节点 |
| 调度与自我优化；赛题 §4.2.3、§4.2.6 | 能力评分、优先级老化、容量控制、未知依赖阻塞、失败反馈；Prompt 修改记录 | 能力路由、预算可代码配置 | 无团队范围约束；优化会修改共享 Agent；当前 LLM spec 未读取 `profile.systemPrompt`，不能把修改记录当消费证据 | P1/P2：限定候选成员、运行隔离、运行内 Prompt 覆盖及消费记录 |
| 工具权限与集成；赛题 §4.2.4、本次工程要求 | 工具注册、参数检查、超时；Agent `callTool` 白名单；真实 Git／容器路径；MCP 回调桥 | 工具元数据可读 | 工作流 Tool 节点直接调用注册中心；无统一运行授权／危险操作审批；LLM Brain 无自主工具请求循环 | P1/P2：统一服务端授权上下文；受限工具请求协议；不宣称完整 MCP 客户端已实现 |
| 运行监控与证据；赛题 §4.2.5、本次 D | SSE、游标重连、节点状态／时间、轮次验证、最终报告、取消 | `NodeExecutionRecord` 内含输入输出 | API 去掉 state；Agent 执行结果收缩为 output；工具逐次记录不足；每 run 事件只保留最近 100 条；嵌套 loop hook 未完整转发 | P1 奠定事件字段，P3 完整持久化 attempt、tool call、每轮产物和分页证据 |
| 不可变运行快照；本次 A/B/C、赛题可追溯目标 | RunStore 原子写入、历史恢复、运行保存 workflow 展示数据 | 无正式版本锁定入口 | JSON 不保存函数语义；没有 Agent／团队／模型配置版本；子流程按可变 ID 注册 | P1 起固定引用；P2 固定递归子流程与编译版本；历史不再解析 latest |
| 真实 Live 与补丁；赛题 §5.2、本次不回退要求 | 严格 Live 配置、仓库白名单、固定 Git 基线、测试与补丁检查；现有回归通过 | 已有 Web 创建仓库任务 | 当前场景仍限定单文件限流器；本轮未重跑真实模型或 Docker | 全阶段保留旧入口，新增通用运行入口但保留可信交付模板 |
| 知识库；赛题 §1–3 | 分块、混合检索；当前命中正文、引用和版本已进入运行上下文 | 资料由代码注入 | 无用户资料管理／知识库版本编辑器 | 本次复用；完整知识库产品另行规划，不扩张本轮范围 |
| 竞赛材料与评测；赛题 §6 | 已有 DELIVERY、方案、演示脚本及 `scripts/benchmark.mjs` | 不适用 | 本轮不重新验收最终 PDF/PPT/视频和已发布资产；离线基准不代表真实 LLM 性能 | 升级完成后更新演示和证据，不能沿用旧报告“无基准脚本”的结论 |
| 产品竞争力；本次建议 | 已有可信验证、失败规则和最佳候选保留 | 可组合成默认模板 | 缺从设计到失败定位、修复到交付的连续体验 | 模板引导、按版本复跑、差异比较、校验错误定位到节点／端口；优先于模板市场或 AI 自动搭图 |

### 1.1 旧审计的修正

已重新阅读 `C:/Users/Guying60/.codex/visualizations/2026/11/10/01a1c5d7-846c-74a3-8f02-3ed1ea907c94/aetherharness-audit.html`。它对应 `d2d69b6` 加当时本地修改，不能代表当前树。

- “匿名执行、直接暴露 Agent 内部对象”：当前已有登录、operator/viewer、DTO 和相应负例测试。新增写接口必须继承这些边界。
- “历史重启归零、SSE 无游标”：已有 RunStore 和 run 级游标重放；仍存在最近 100 条截断，不能称完整追踪。
- “预设链路未使用并行／子流程”：当前仓库流程已实际使用，见 `src/scenarios/repository-repair.ts:132`、`:147`。
- “未知依赖被当完成、重试残留、统一并发和取消缺失”：当前代码和回归已覆盖修正，不能重复列为未完成。
- “候选可伪造通过、审查异常静默通过”：现有测试覆盖伪造报告拒绝；审查执行失败产生阻塞。仍应给自定义 Tester 验证输出契约，不能依靠未知输出的确定性兜底。
- “Prompt 优化已被 LLM 消费”：当前 `LlmBrain.think` 调用固定 spec，`specs.ts` 未读取 `profile.systemPrompt` 或 `ctx.memory`。失败规则／Critic 反馈确实进入开发提示，但配置指令和自动修改 Prompt 的消费链需要重新接通。
- “无性能基准脚本”：当前已有离线串行／并发基准脚本。本轮未据此推导任何新性能数字。

### 1.2 本轮证据及关键代码位置

`npm.cmd test`：构建成功，**303 项检查通过，15907 ms**。仓库套件使用 **local test adapter**，模型为测试提供者；不是本轮真实云端模型或 Docker 验收。构建只更新忽略的 `dist/`。

补充无持久副作用的断言探针验证了三件事：普通节点 A 同时连 B、C，实际记录只有 A、B；A 的映射输入为 `{mapped:42}`，Agent 实际未收到该字段；JSON 序列化后转换函数消失。后续必须将这些转成正式回归测试。

| 证据 | 位置 |
| --- | --- |
| Profile、节点类型、函数字段、WorkflowDefinition | `src/types/index.ts:25`、`:150`、`:192`、`:215` |
| 注册和历史；Agent 工具白名单 | `src/agent/agent-registry.ts:36`；`src/agent/base-agent.ts:160` |
| 引擎校验、并行、子流程、Self-Loop | `src/workflow/workflow-engine.ts:97`、`:391`、`:428`、`:496` |
| 映射记录与 Agent 输入不一致；首条后继 | `src/workflow/workflow-engine.ts:355`、`:645`、`:739` |
| RunSnapshot、截断事件、场景耦合运行入口 | `src/orchestrator.ts:56`、`:282`、`:461` |
| API 去掉 state；SSE；当前 POST 权限门 | `src/web/server.ts:40`、`:129`、`:246` |
| 工具入口；审查直接调用 Agent | `src/tools/tool-registry.ts:147`；`src/verification/verification-engine.ts:271` |
| 默认团队、真实仓库流程、原生前端装配 | `src/scenarios/rate-limiter.ts:482`；`src/scenarios/repository-repair.ts:114`；`src/web/client.ts:1` |

## 2. 参考产品带来的设计决定

已阅读用户指定的六个网页，并结合四张截图分析。以下是设计取舍，不宣称已登录这些产品完成实操。

| 参考 | 已核对的交互思路 | AetherHarness 的应用 |
| --- | --- | --- |
| [Dify Workflow Studio](https://dify.ai/zh/workflows) | 画布、单节点／全流程测试、版本和运行追踪 | 编辑图与某次运行叠加；调试抽屉显示输入、输出、路径、时间；保存、发布和运行分开 |
| [Langflow Visual Editor](https://docs.langflow.org/concepts-overview) | 分类组件、端口连线、画布平移、Playground、Logs | 分类节点库；连线决定语义，拖动只改变布局；节点配置面板与测试输入相邻 |
| [Langflow Agent](https://docs.langflow.org/agents) | 模型、指令、工具、会话记忆和结构化输出配置 | Agent 详情按同类信息分组，但模型只选服务端引用；记忆按 run 隔离 |
| [Flowise Agentflow V2](https://docs.flowiseai.com/using-flowise/agentflowv2) | 显式路径、Flow State、工具授权配置、人工输入暂停与继续 | 显式变量映射和权限摘要；审批只有具备持久检查点和继续语义才可用 |
| [CrewAI Studio](https://crewai.com/blog/enabling-domain-experts-to-build-and-deploy-agentic-workflows-without-the-need-to-write-code) | 可复用 Agent 库、职责与工具配置、组合进 crews/flows | Agent 与团队是独立资源；工作流引用团队成员，不把角色配置拷贝散落在每个节点 |
| [React Flow examples](https://reactflow.dev/examples) | 自定义节点、连接交互、保存恢复、连接校验 | 只承担编辑交互；其图数据不能代替后端 WorkflowDefinition。参考 [保存恢复](https://reactflow.dev/examples/interaction/save-and-restore) 与 [防环](https://reactflow.dev/examples/interaction/prevent-cycles) |

截图 1 的分类节点库和清晰端口、截图 2 的角色和任务关系、截图 3 的模型／消息／工具配置、截图 4 的逐节点调试，分别落实到上述模块。不复制品牌、配色或组件布局细节。

### 技术选型建议

保留 Node HTTP、TypeScript 内核、现有原生 Web 工作台与 TUI。当前只有 TypeScript／Node 类型开发依赖，没有现成图编辑器。

建议仅在 `/workflows/:id/edit` 挂载 **React Flow 编辑器模块**，本地打包交付；其余路由维持当前栈。需要新增 React、React DOM、`@xyflow/react` 及一个轻量构建入口，理由是完整的连接、拖拽、视口、键盘和可访问性交互已经超出“几行原生 SVG”的范围。实施时固定经过验证的版本与许可证，不依赖公网 CDN。

这不是全站 React 迁移。原生 SVG 方案无运行时依赖，但必须自行维护坐标变换、连接命中、键盘操作、撤销等，预计维护面更大，故不作为推荐路径。第一阶段不需要引入图编辑器依赖；第二阶段先验证隔离模块构建和现有路由兼容，再接产品功能。

## 3. 产品结构与关键交互

导航维持现有工作台、任务执行、Agent 中心、验收交付、设置；新增“团队”和“工作流”。统一深色优先主题、文字状态、键盘焦点和运行模式标识。

| 页面 | 内容与主要操作 | 必须表达的状态 |
| --- | --- | --- |
| `/agents`、`/agents/:id` | 系统／自定义筛选；职责、模型、工具、能力、版本；创建、复制、编辑、启停、删除；测试 | 系统内置只读；自定义编辑生成新修订；禁用影响新运行；历史引用保留 |
| `/teams`、`/teams/:id` | 选择成员及固定版本、设置岗位职责、能力候选、协调成员；配置允许交接；保存／复制／版本预览 | 版本漂移提示但不自动升级；没有负责人推理能力时只能叫“协调成员” |
| `/workflows` | 默认模板、自定义流程、版本、校验状态、最近运行；复制、导入导出 | 草稿、可执行修订、已发布版本分别标识 |
| `/workflows/:id/edit` | 左节点库；中画布；右属性；顶名称、版本、保存、校验、测试、发布；底调试 | 未保存、保存中、保存失败、冲突、校验失败、可运行；错误定位具体节点／端口 |
| `/runs/:id` | 固定版本的只读运行图、尝试记录、Agent 输出、工具调用、逐轮证据和人工决策 | 当前运行不随编辑漂移；运行结束不等于验收通过 |
| `/runs/:id/delivery` | 沿用验收与补丁报告，补充设计版本和证据索引 | 验收通过、草稿待审、阻塞、取消独立显示 |

Agent 配置采用“基本信息、指令、模型、能力与工具、记忆与预算、输入输出、测试与版本”分区。团队成员需要稳定 `memberId`，同一个 Agent 可承担不同岗位，但不能靠复制岗位绕过 Agent 并发上限。团队交接表定义允许的岗位交接；具体执行顺序由工作流唯一决定，避免两套互相矛盾的流程。

工作流画布：普通控制端口与数据映射分开；选节点才展开长文本。支持增删、拖动、连接和断开、缩放、平移、适配画布、键盘删除／连接替代操作、撤销重做。删除带连线节点先展示受影响连接；误操作可撤销。节点状态同时用文字和图形表示，不能只靠颜色。

桌面同时显示三区；窄屏将节点库和属性改为抽屉，调试独立页签，保留缩放和表单编辑。拖动、触屏与键盘不能触发两套不同的保存行为。未保存离开提示；保存失败保留本地编辑内容；版本冲突给“载入服务端版本”与“另存副本”，不静默覆盖。

首用模板：①原有三个案例只读运行入口；②自定义 Developer + Tester 的验证修复模板；③并行基线检查 + 交付子流程模板。创建时从模板复制自己的定义 ID，显式显示依赖的模型和授权工具，不显示空白成功状态。

## 4. 数据模型与版本规则

### 4.1 定义与运行对象分开

保留 `AgentProfile` 作为运行兼容对象；新增可序列化定义 DTO，由后端实例化 Profile/Brain。`currentLoad`、`totalTokensUsed` 是运行指标，不能作为用户可写字段或不可变定义的一部分。

| 资源 | 最小字段 | 规则 |
| --- | --- | --- |
| AgentDefinition | `id, slug, origin, enabled, archivedAt?, createdAt, createdBy, headRevision, draftEtag` | id 稳定；slug 唯一；系统资源不能被用户覆盖；删除为归档，已引用版本保留 |
| AgentRevision | `agentId, revision, name, roleLabel, role, description, systemPrompt, constraints, modelConfigRef, capabilities, toolIds, memoryPolicy, limits, inputSchema, outputSchema, behavior, createdAt, createdBy, hash` | revision 服务端单调分配；内容只增不改；行为契约和显示角色分开 |
| TeamRevision | `teamId, revision, name, members, coordinatorMemberId?, routing, handoffs, toolIds, createdAt, hash` | 每成员包含 `memberId, agentRef:{id,revision}, responsibility, eligibleCapabilities`；候选仅限本团队 |
| WorkflowDraft | `id, draftEtag, basedOnRevision?, teamRef, definition, layout, validation` | 草稿可不完整；保存草稿不代表可执行；布局不混入运行上下文 |
| WorkflowRevision | `workflowId, revision, schemaVersion, teamRef, definition, layout, dependencyLock, compilerVersion, executionHash, createdAt` | 服务端编译通过才生成；发布指针指向已验证修订；测试也固定修订 |
| ModelConfig（服务端） | `id, revision, provider, model, endpointPolicy, credentialRef, generationLimits` | secret 留在服务端；客户端只有可选引用、标签、能力和就绪状态；不返回 apiKey、凭据内容或内部连接对象 |
| RunDefinitionSnapshot | `workflowRef, workflowSource, teamSnapshot, agentSnapshots, subworkflowSnapshots, modelRefs, policySnapshot, compilerVersion, executionHash, projectRef?` | 在入队前原子固定；只存脱敏模型配置与凭据引用，不复制密钥 |
| NodeAttempt | `attemptId, runId, nodePath, iterationPath, retryIndex, agentRef?, status, inputRef, outputRef, startedAt, endedAt, error?, usage?, verificationRef?` | 不以 nodeId 单独作为唯一键；同节点多轮和嵌套不得互相覆盖 |
| ToolInvocation | `callId, attemptId, toolId, inputRef, outputRef, authorization, approvalId?, durationMs, status, error?` | 记录允许和拒绝；分别记录调用成功与业务验收通过 |
| ApprovalRequest | `id, runId, nodePath, checkpointRef, operationHash?, status, revision, expiresAt?, actor?, reason?, decisionAt?` | 待审批到批准／拒绝／过期是一次性状态转移；批准只能授权绑定的具体操作 |

### 4.2 Agent 字段的执行含义

| 用户字段 | 当前映射／新增理由 | 执行约束 |
| --- | --- | --- |
| 名称、标识、职责 | 复用 name/id/description；新增 roleLabel | 自定义岗位名不要求扩张一堆硬编码角色分支 |
| 系统指令、行为约束 | 复用 systemPrompt；新增结构化 constraints | 自定义 Brain 必须消费；平台工具策略不能被提示词覆盖 |
| 模型配置引用 | 现有 model/temperature 不足以选择独立 provider | 后端解析固定 config revision；温度、token 上限按模型支持能力校验 |
| 能力标签 | 复用 capabilities 的 0..1 评分 | 标签供发现，分数影响调度；不能当授权依据 |
| 工具白名单 | 复用 toolIds | 运行中取 Agent、团队、项目／平台策略的交集；空集即拒绝 |
| 记忆策略 | 当前固定窗口 50，BrainContext 取最近 8 条 | 首版 `none` 或 `run-window`，按 run/member 隔离；限制条数和字符／token 预算；暂不做跨运行长期记忆 |
| 最大轮数与超时 | 新增 limits；沿用节点／流程 timeout | `maxTurns` 限 Agent 模型／工具循环，`maxIterations` 限工作流修复轮次，两者不能混用；取各层预算最小值 |
| 输入输出结构 | 新增受支持 JSON Schema 子集或可信 schema 引用 | 校验实际输入及最终输出；不支持的关键字明确报错，不伪装为完整 JSON Schema 实现 |
| 启用、版本、创建时间 | 定义生命周期与修订分开 | 禁用禁止新的运行准入；已固定运行继续；紧急撤权走独立平台策略并留证据 |

可配置 Brain 复用当前 Provider、解析器和 `BaseAgent.callTool`。首版采用明确的 JSON 动作契约：模型返回最终结果，或结构化工具请求；后端检查工具、参数、轮数、输出尺寸、超时后调用，再将结果回传模型。每轮必须记录实际调用和结果。不要把现有单轮 `LlmBrain` 包一层配置表单就称为支持工具调用，也不宣称该协议已经是标准 Function Calling/MCP 会话。

保留内置六种专用 Brain 及原案例的输入输出契约；自定义 Agent 使用新配置契约。复制系统 Agent 时显式选择“继承模板行为”或“通用配置行为”，界面显示限制，例如 RateLimiter 专用代码输出，避免编辑了名字却仍暗含固定业务。

### 4.3 版本、并发和持久化

编辑草稿以 ETag 乐观锁保护；两位操作者同时保存，后保存者收到 409 和最新 revision，不能覆盖。创建新修订不改变旧修订。复制生成新 id/revision 1，并保留来源引用。

运行固定整个依赖闭包：工作流、团队、成员版本、子流程、可信验证配置、模型配置元数据和工具策略。能力路由可以在固定名单里动态选择，实际选中 Agent 写进 attempt。修改或删除某定义后，历史仍可审阅；复跑明确选择原版本或新版本。模型服务并非确定性系统，固定配置只能保证输入定义可追溯，不保证相同输出。

运行隔离不能只复制 JSON：目前 Agent 内存和 Prompt 优化共享。实施时给运行自己的 Agent 执行上下文／记忆／Prompt overlay，定义本身只读；共享调度器继续执行全局准入和容量预留。调度任务携带 run 内允许成员及实际实例映射，容量按稳定 Agent id 跨运行／版本合并，不因复制运行实例绕过上限。Critic、审查者也必须纳入相同预算与执行记录。

当前是单机文件持久化，不引入数据库迁移。新增定义存储与修订索引，复用 RunStore 的单写者锁、临时文件、fsync、原子替换模式。内存状态只在落盘成功后生效；写失败返回明确错误。运行证据扩展为存储 schema v2，读取兼容 v1，不尝试把旧 JSON 中已丢失的函数“恢复”为可执行代码。旧运行标为 legacy，保留查看及原有受控重试边界。

首版保留单机持久化，不做多进程数据库。完整证据不能再只保存最后 100 条；界面和内存展示可分页，但存储保留全量。沿用同步快照时需测量大历史写入耗时，达到实测瓶颈再改为追加日志；不能以性能优化为由静默丢证据。迁移先备份、完整验证、原子替换，失败保留旧文件。

## 5. 工作流 JSON 契约与后端编译

### 5.1 三层表示

1. **编辑数据**：节点、端口、连线、位置和视口。位置不决定执行顺序。
2. **可序列化定义**：确定的成员引用、控制关系、变量绑定、条件表达式、验证模板和预算。不允许上传 JavaScript 函数、handler、代码字符串执行器。
3. **运行定义**：服务端将可信声明编译成现有 `WorkflowDefinition`，注入安全解释器闭包，并调用现有 `WorkflowEngine.execute`。

完整路径：浏览器提交定义 → JSON/schema/权限/版本校验 → 解析固定依赖 → 结构校验与安全编译 → `WorkflowEngine.validate` → 原子保存可执行修订 → 运行准入时检查环境与撤权 → 固定快照 → 现有 WorkflowEngine／Scheduler／SelfLoop／VerificationEngine → 持久事件与产物。

编译不调用 `eval` 或 `new Function`。条件使用有限操作符树，例如 `eq/ne/gt/gte/lt/lte/exists/all/any/not`；路径只读已声明输入和上游输出，拒绝 `__proto__`、`constructor`、`prototype`，限制深度、节点数、字符串与集合大小。缺失必需路径是映射错误，不默默变成 undefined。

声明样例（拟定 DTO，当前 API 尚不接受）：

```json
{
  "schemaVersion": 1,
  "teamRef": { "id": "my-dev-test", "revision": 1 },
  "entryNodeId": "develop",
  "nodes": [
    {
      "id": "develop", "type": "agent", "memberId": "developer",
      "inputBindings": { "goal": { "source": "input", "path": ["goal"] } },
      "outputKey": "candidate", "timeoutMs": 60000
    },
    {
      "id": "test", "type": "agent", "memberId": "tester",
      "inputBindings": { "auditTarget": { "source": "node", "nodeId": "develop", "path": ["code"] } },
      "outputKey": "review", "timeoutMs": 30000
    }
  ],
  "edges": [{ "from": "develop", "to": "test" }],
  "outputBindings": { "review": { "source": "node", "nodeId": "test", "path": [] } },
  "timeoutMs": 120000,
  "maxSteps": 20
}
```

上述样例说明串行映射；不把 Tester 的一句“通过”当最终可信验收。可交付模板还必须绑定独立的 Verification 节点，具体修复循环见第 8 节。

### 5.2 节点支持矩阵与连线语义

| 设计器节点 | 当前引擎依据 | 本次处理和完成条件 |
| --- | --- | --- |
| Start / End | 无原生 start/end 类型；有 entryNodeId 和无后继终止 | 设计期边界节点；Start 编译为入口与输入 schema，End 编译为输出映射／结束；来源映射保留。不得显示伪造的 Agent 执行耗时 |
| Agent | `agent`、agentId／agentCapability | 固定团队成员或候选集合；修复映射实际传入；验证输出契约、记录执行 attempt |
| Tool | `tool`、ToolRegistry | 只能选择后端允许工具；绑定运行主体和可选 member；统一权限门，不能绕开 Agent 白名单 |
| Condition | `condition` 与函数回调 | 可声明 case/default；编译成安全闭包；必须存在默认分支或明确无匹配失败；返回目标必须属于合法出边 |
| Parallel | `parallel_group` + allSettled | 显式 fork/join 区域；每个分支编译成独立子流程，等待全部结束；首版只支持 all-success 汇合，分支失败不运行下游 |
| Loop / Iteration | `self_loop` | 开放“验证修复循环”：目标 Agent、可信验证、审查／诊断 Agent、最大轮数、通过且达到阈值。通用 foreach、任意循环体不冒充已支持 |
| Subworkflow | `subworkflow`、注册表 | 引用固定修订及输入输出契约；递归检查引用环与深度；运行子流程使用快照注册表，不能按最新 ID 重新解析 |
| Verification（补充必需） | `verification` | 暴露可信规则／测试配置引用、审查成员、验收阈值；不能上传可执行 `check` 函数；测试标准与候选内容分开 |
| Human Approval | 只有失败 escalation，无原生节点 | P3 新增 `human_approval`、持久 checkpoint 和 resume；完成前仅显示能力说明且不可插入可发布流程 |

**普通节点最多一个无条件后继。** 多条普通出边不能被解释为并行。条件的多分支是互斥选择；Parallel 是所有分支执行。节点依赖来自已编译控制关系，数据绑定必须指向一定已执行的上游；不能用画面坐标或“最近一次派发”代替依赖。

Parallel 的子流程各自读取同一输入快照，结果写到独立分支命名空间，汇合节点再明确映射。禁止多个分支写同一共享 outputKey 或跨分支读尚未产生的数据。现有 shared state 下 `lastOutput` 的竞争不作为产品语义。失败时等待有界清理后给出所有分支结果，不提前声称成功。

Loop 内的重复是容器语义，不是顶层有向环。首版仍以当前 SelfLoopEngine 的验证修复算法为准，支持通过且达到阈值、超时／取消、达到最大迭代次数等结束条件。若未来增加列表迭代或任意 body 子流程，需独立定义数组输入、结果收集、预算和失败语义，不能用当前 self_loop 名称承诺。

### 5.3 必须校验的内容

- 图：唯一 ID、一个 Start、合法 End、入口可达、无悬空边、节点类型／端口匹配、普通多出边错误、顶层环路错误。
- 容器：Parallel 成员无重复／自包含／循环包含，fork/join 成对，分支不越界；Self-Loop 引用合法目标和验证节点；子流程依赖无递归环且总深度不超过引擎限制。
- 数据：输入输出 schema、必需字段、映射路径、上游可用性、条件类型、输出冲突、分支缺失值策略。
- 资源：成员属于指定团队版本、能力存在、工具许可、模型引用可解析、超时／优先级／轮数为有限且受限的数值。
- 信任：未知字段或不支持的 schema 版本拒绝；校验模板来自服务端注册表；危险操作必须有服务端门禁，不以连了 Approval 节点作为唯一授权证明。
- 运行环境：版本可执行不等于模型／Docker 此刻可用；发布前做静态与配置校验，启动前再次检查环境，失败给具体原因。

`validate` 返回 `errors[{code,nodeId?,edgeId?,path,message}]`、warnings、dependencyLock、executionHash。前端校验用于即时反馈，服务端复验是权威。已有引擎 `validate` 继续保留，编译器补齐安全和结构检查，避免把它重写为另一套运行时。

“保存”需要明确区分：未通过校验只能保存为草稿；通过编译才能提示“可执行版本已保存”。运行按钮只能提交已编译修订，不能在客户端保存成功后另拼一份不同流程运行。若依赖撤权或外部服务故障，显示运行准入失败，不伪称保存保证所有外部调用必然成功。

## 6. API 设计

保留现有 `/api/dashboard`、`/api/status`、`/api/agents`、Agent history、`/api/tasks/run`、仓库 `POST /api/runs`、run 查询／SSE／cancel／escalate／report。新增定义资源放在 `/api/studio`，避免改变旧 Agent DTO 和仓库创建接口的语义。

| 接口（拟新增） | 用途／关键请求 | 成功结果与主要错误 |
| --- | --- | --- |
| `GET /api/studio/catalog` | 节点能力、工具参数、模型引用、验证模板、支持的 schema 版本 | 脱敏目录；每类节点标 `available`，无 handler／密钥 |
| `GET /api/studio/agents`、`GET /api/studio/agents/:id` | 定义列表／详情，revision 查询参数 | 列表不返回完整指令；编辑详情仅 operator 可读配置 |
| `POST /api/studio/agents` | 新定义或 `copyFrom:{id,revision}` | 201，id、revision、ETag；重名 409，字段错误 422 |
| `PUT /api/studio/agents/:id/draft` | If-Match + 完整草稿配置 | 新 ETag；缺前提 428，冲突 409 |
| `POST /api/studio/agents/:id/revisions` | draft ETag；提交校验后新版本 | 201，固定修订和 hash；原版本不变 |
| `PATCH /api/studio/agents/:id`、`DELETE .../:id` | 启停／归档，带 If-Match | 200／204；内置资源 403；保留旧引用，展示受影响团队 |
| `GET /api/studio/agents/:id/revisions`、`GET .../revisions/:revision` | 历史和版本预览 | 只读修订；权限控制同详情 |
| `/api/studio/teams` 及 `/:id/draft`、`/:id/revisions` | 与 Agent 相同的列表、详情、新建／复制、草稿、版本、启停／归档接口 | 校验固定 Agent 引用、职责、交接、协调者；不接受任意 Supervisor 行为脚本 |
| `/api/studio/workflows` 及 `/:id/draft`、`/:id/revisions` | 同样的定义生命周期，内容为 JSON workflow + layout | 只有编译成功创建可执行 revision；草稿返回 executable:false 及问题列表 |
| `POST /api/studio/workflows/:id/validate` | 草稿 ETag 或明确 revision | valid/errors/warnings/executionHash；无运行副作用 |
| `POST /api/studio/workflows/:id/publish` | revision + If-Match | 发布指针；发布是本地可选版本，不是公网部署 |
| `GET /api/studio/workflows/:id/export?revision=...` | 导出确定版本和必要定义依赖 | schema 化 JSON、引用清单、hash；无 secrets／运行记忆 |
| `POST /api/studio/import/validate`、`POST /api/studio/import` | 先检验导入包／重名策略，再事务导入 | 解析结果／创建的 ID 映射；不解析 URL 引用，不导入可执行代码；缺模型引用要求重新绑定 |
| `POST /api/studio/runs` | workflowRef + input + mode + Idempotency-Key | 202，runId、固定引用、executionHash；版本不存在 404，校验 422，环境不可用 503 |
| `POST /api/studio/tests` | `kind:agent/node/workflow`、revision、nodePath?、输入／上游样例 | 202 + 真实 runId；标为测试范围，使用相同引擎、权限和预算，不生成正式交付结论 |
| `GET /api/runs/:id/attempts`、`GET .../attempts/:attemptId` | 按节点／迭代查询真实记录 | 游标分页、脱敏输入输出引用、耗时、错误 |
| `GET /api/runs/:id/tool-calls`、`GET .../artifacts/:artifactId` | 调用记录／受权产物内容 | 分页／内容；按 run 核对归属，禁止路径穿越 |
| `POST /api/runs/:id/approvals/:approvalId/decision` | revision + decision + reason + Idempotency-Key | 受理一次决策并继续／拒绝；过期或并发冲突 409；无权限 403 |

`GET /api/runs/:id/events` 沿用 SSE，增加 schemaVersion／attempt 关联，不改变旧字段含义。新增子路由必须排在当前 `/api/runs/` 宽泛 GET 分支之前。

统一错误体：`{error:{code,message,fields?,nodeId?,edgeId?,currentRevision?,requestId}}`。不回显凭据、内部对象或原始异常栈。UI 显示可定位的问题；存储失败返回 5xx 并保持旧版本；启动前版本不可用必须在受理运行之前拒绝。

安全边界：沿用 operator/viewer 与同源会话；当前身份／来源检查只对 POST 生效，新增 PUT/PATCH/DELETE 时必须覆盖**全部变更方法**。viewer 可看脱敏证据，不能修改、测试、发布、审批或获取完整编辑指令。所有写动作记录认证账号、时间、资源版本和结果。模型引用只能选择服务端目录，导入包不得夹带 apiKey、任意 endpoint 或外部配置地址。

## 7. 权限、审批和执行追踪

### 7.1 服务端统一工具门

为 ToolRegistry 调用上下文增加可信的 runId、attemptId、执行主体、冻结授权策略、审批记录引用。上下文由执行器创建，不能使用用户 input 中同名字段。Agent 工具、直接 Tool 节点、验证器工具和子流程工具都经过同一授权入口。

Agent 工具有效权限 = Agent 白名单 ∩ 团队白名单 ∩ 平台／项目许可。直接 Tool 节点没有 Agent 时，使用专门的工作流主体和团队白名单；若指定 member 则再收窄到该成员。可信验证器有独立、固定的最小工具权限，用户不能冒充验证主体。工具自身的参数、项目路径和隔离检查继续执行。

危险级别由服务端工具注册元数据定义。需要审批的调用在产生副作用前暂停，审批绑定 run、节点、工具和规范化参数 hash；参数变动或重试产生新的副作用意图时重新匹配／申请。导入工作流绕过人工节点也不能绕过门禁。未批准、拒绝、过期均不得执行。凭据撤销／平台紧急禁用可覆盖快照，记录具体拒绝原因。

### 7.2 Human Approval 的最小真实实现

增加 `human_approval` 节点和执行器 continuation：暂停时保存当前控制位置、嵌套调用栈、上下文引用、已完成 attempt、依赖快照和审批请求，然后释放执行槽。收到有效决策后重建固定版本执行环境，从暂停点恢复，不重放已完成的有副作用节点。人工等待单独记时，使用明确的审批过期时间和剩余主动执行预算，不能一直占 Agent 容量。

审批嵌套在子流程时传播 waiting 状态；当前子流程将非 completed 视为失败的行为需要扩展。并行区域若允许审批，需要持久化各分支位置并可恢复；首版可明确禁止在 Parallel 内审批，校验返回具体限制，而非运行中悄悄失败。顶层和顺序子流程审批属于本次 P3 交付范围。

批准／拒绝是原子一次性转换；同幂等键重试返回原结果，不二次执行。副作用工具需要幂等或可核对结果；若进程在“已调用但未记录完成”之间崩溃，标记结果未知并要求复核，不宣称 exactly-once 或自动再次执行。现有失败升级卡片继续使用原 escalate 语义，与新审批节点区分。

### 7.3 真实事件与证据

沿用 OrchestratorEvent，追加 `schemaVersion, seq, attemptId, nodePath, iterationPath, parentAttemptId, agentRef`，旧消费端仍可读取 kind/message/runId。保留现有 node/run/scheduler 事件，增加或实际发出 `tool.started/tool.finished/tool.denied`、`agent.started/agent.finished`、`approval.requested/approval.resolved`、`loop.iteration`、`verify`。

Hook 必须带出实际输入、输出、错误、usage 和工具调用；通过受权引用访问大内容。子流程统一带完整路径并转发 loop hook；并行、重试和每一轮各有 attemptId。一次 Agent 输出对应一次真实执行，不从节点名字推断“谁执行过”。工具追踪在注册中心生成，不能相信模型自报的 toolCalls。

SSE 先持久化再广播；按 seq 去重／续传。游标不在可回放范围时发 reset，客户端读取一致的快照和证据游标再续传。UI 的时间刷新只能展示已知起止时间，不能改变运行状态。中断、排队、失败、未执行和取消必须区分。

运行中的节点输入／输出也要可读，不能等 `execute` 返回后才设置整个 state。每轮保存候选 hash、失败规则、验证结果、Tester／Critic 反馈以及下一轮使用的反馈引用。最终验收与被选中的最佳候选绑定，防止展示最后一轮日志却交付另一轮文件。

## 8. Developer + Tester 的完整验收路径

用户创建 Developer v1 与 Tester v1，配置模型引用和工具，保存双成员团队 v1。Developer 使用代码工件契约；Tester 使用审查＋诊断契约，可输出 `approved/comments/signals/feedback`，输入明确区分审查模式和诊断模式。平台的固定测试仍是独立验收来源，Tester 无权修改它。

首个模板使用现有 Self-Loop：

```text
Start（任务、固定项目基线）
  → 可选基线检查
  → 验证修复循环（最多 3 轮）
       DO：Developer 生成候选
       CHECK：可信测试工具 + Tester 审查
       ACT：未通过时 Tester 以诊断模式返回失败反馈
       下一轮 Developer 消费上一轮失败与反馈
  → Condition（真实验证通过且满足阈值）
       通过 → 已有交付子流程 → End
       未收敛 → 现有人工升级卡片
```

编译映射：循环目标是 Developer agent node；VerificationSpec 的 auditorAgentIds 指向 Tester；criticAgentId 可指向同一 Tester 的诊断契约。因此双成员团队可以完成主路径，不暗中加入第三个 Agent。失败轮 Tester 的“审查”和“诊断”是两次独立调用，UI 必须明确显示，测试分别验证。若用户希望职责独立，可显式加入默认 Critic 为第三成员。

这种路径复用当前 `SelfLoopEngine` 的算法，不声称存在通用可编辑循环体。设计器将 DO/CHECK/ACT 显示为循环容器中的具名步骤，允许指定成员与验证规则。普通无循环流程也能直接画 Developer → Tester → Verification 的串行关系。

P3 再提供“交付前人工审批”模板：真实审批节点位于验收通过与交付子流程之间，批准才继续，拒绝停止；不能把当前“转人工复审草稿”按钮改名成“批准发布”。

端到端必须证明：首轮固定失败 → Tester 给出可查看反馈 → Developer 次轮确实收到该反馈 → 固定测试通过 → 对同一候选生成可应用补丁。另有最大轮数耗尽、模型异常、越权工具、保存冲突和审批拒绝路径。记录每次模型来源，真实 Live 不降级成离线成功。

## 9. 三部分实施与验收

版本与基础证据不能全部拖到第三部分：第一部分就建立不可变修订和 run 绑定，第二部分保证编译执行一致，第三部分补齐完整调试体验、审批和跨模块端到端验收。

### 第一部分：Agent 自定义与团队管理

范围：新增定义存储、DTO、草稿／修订／启停／归档接口与页面；可配置 Brain；双成员默认模板；模型目录；运行上下文隔离；工具授权入口；通用运行装配入口初步接通。通用运行装配复用现有全局排队、取消和持久化，不另建一套任务系统。

验收：

1. UI 创建 Developer/Tester，编辑产生 v2，复制产生新 ID，禁用后禁止新运行；刷新和服务重启后定义仍在。
2. 系统 Agent 不可修改／删除；自定义定义归档后旧团队、旧 run 仍能显示当时版本。
3. 两成员团队可保存、复制、创建新版本；职责和交接可预览；不存在的成员、错误版本、缺失能力明确拒绝。
4. Agent 测试产生真实 run/attempt；断言模型实际收到配置的指令、允许的记忆、正确模型参数和映射输入；不是只验证保存成功。
5. 同一 Agent 同时参与两个运行，记忆和 Prompt 覆盖互不串扰，全局容量不超限；旧 run 始终使用原版本。
6. 非白名单工具、伪造执行主体、viewer 写入和前端提交密钥配置被拒；所有响应和存储日志不含服务端凭据。
7. 原有 303 项检查及三个预设案例预期结果保持；本部分新增的定义与权限检查通过。

### 第二部分：工作流可视化、编译与执行

范围：独立图编辑模块；声明式 schema／编译器；实际输入映射修正；运行选择固定团队；节点属性、连线和结构校验；模板保存／复制／版本／导入导出；单节点与全流程测试入口。审批节点此阶段不作为可发布能力。

验收：

1. 增删、拖动、连线／断开、缩放、撤销、重载均保留语义和布局；键盘也能操作核心流程。
2. 保存可执行版本 → 服务重启 → 运行，仍由 WorkflowEngine 执行相同控制关系；导出再导入语义 hash 一致（资源 ID 重绑定按规范化引用比较）。
3. 普通节点 A→B 且 A→C 被拒并提示使用 Parallel；显式并行实际有重叠执行，汇合只执行一次；某分支失败下游不启动。
4. Condition 每次只求值一次，默认分支有定义；环、容器自包含、递归子流程、非法输入映射、未知工具和失效版本都在服务端拒绝。
5. Developer 与 Tester 模板完成失败反馈循环；修复最多执行指定轮数；耗尽明确升级，不假报通过。
6. 单节点测试明确提供上游样例，产生独立测试 run，不污染生产上下文或直接解锁交付。
7. 非法草稿只提示“草稿已保存”，运行按钮不可用；保存冲突、磁盘失败、模型不可用分别呈现可定位错误。

### 第三部分：调试、审批、版本追溯和最终验收

范围：真实 attempt／工具事件、完整轮次产物、嵌套路径、审批暂停／恢复、版本对比和原版复跑；端到端浏览器验收与真实 Live／容器验收。

验收：

1. 设计器测试时实时显示节点状态、Agent 输出、工具输入输出、失败原因、耗时、轮次、审批和最终验收，均可对应持久事件。
2. 超过 100 条事件后重启／断线重连，关键证据不丢失、不重复渲染；嵌套子流程中的 loop 和工具记录有完整路径。
3. 人工审批前危险工具调用次数为 0；批准后按绑定参数执行；拒绝／过期不执行；并发提交只有一次有效决策。
4. 等待审批时重启后从暂停点继续；已完成副作用不重放；结果未知的崩溃窗口显式要求复核。
5. 编辑 Agent／团队／工作流新版本期间，运行图、实际提示、权限和依赖保持原快照；报告可查所有版本与 hash。
6. 严格 Live + Docker 跑通自定义 Developer/Tester、失败反馈、复验与补丁交付；模型故障不降级成功，补丁在固定基线通过 `git apply --check`。
7. 既有预设案例、仓库 Live、补丁下载、TUI／无头输出、账号权限和取消清理全套回归；桌面／窄屏、键盘导航、错误定位经过浏览器检查。

## 10. 改动范围与兼容策略

| 模块 | 预计改动 | 需要一起核对的调用方／测试 |
| --- | --- | --- |
| `src/types/`、定义存储（新增） | 定义 DTO、修订、运行快照、事件字段 | 导入导出、API 请求、恢复文件、测试 fixture |
| `src/agent/`、`src/agent/llm/` | 配置实例化、指令／记忆／工具轮次、版本隔离 | 默认 Brain、注册历史、Profile、模型 mock、真实 Live |
| `src/scheduler/` | 团队候选范围、运行实例映射、共享容量 | Agent、Critic、审查调用，优先级／取消／依赖回归 |
| `src/workflow/`（编译器新增） | JSON 编译、映射、结构校验、审批 continuation、嵌套 hook | 工具、并行、子流程、SelfLoop、单节点测试 |
| `src/tools/`、`src/verification/`、`src/selfloop/`、`src/optimization/` | 权限上下文、逐次证据、Tester 契约、运行内优化 | 可信测试、容器清理、实际诊断反馈、危险工具审批 |
| `src/orchestrator.ts`、`src/store/` | 通用固定定义运行入口；提取共用生命周期；v1/v2 兼容 | 旧 runTask、runProjectTask、队列、取消、人工升级、重试、存储失败 |
| `src/web/`、编辑模块（新增） | Studio API、所有写方法权限、页面和真实调试 | 原路由与 DTO、SSE、深链、浏览器键盘／移动端 |
| `src/index.ts`、CLI／TUI／demo、构建配置与文档 | 导出新契约；兼容新增事件；编辑资源构建 | `npm test`、headless、离线案例、打包离线资源、交付说明 |

保持原案例定义及旧 API 行为，通过适配将它们送入共用运行生命周期；不要求先将所有内置函数式模板迁移成用户 JSON。正式交付仍沿用经过验证的项目和测试约束，任意自定义工作流成功结束不能自动生成“已验收”补丁。

不在本轮增加：公网多租户、模板市场、多人实时协同、自动规划任意流程、任意脚本节点、通用 foreach、长期跨运行记忆、分布式调度、全站框架迁移。Supervisor 只评估现有能力，不虚构自主委派；若未来需要，作为新的执行契约单独设计。

## 11. 待确认的实施基线

建议确认：按上述三部分实施；保留 Harness 内核和现有 Web；仅编辑器引入独立 React Flow 模块；JSON 定义经服务端编译；首版采用结构化并行和验证修复循环；P3 增加真实人工审批；定义和运行版本从第一部分就固定。

确认后从第一部分开始，不提前改写后端或迁移全站。本轮未修改产品实现，未重跑真实模型／Docker，也未重新审计已发布竞赛材料。主要工程风险是运行隔离、并行共享上下文、审批恢复和完整证据持久化，均已列入对应阶段的阻断性验收。
