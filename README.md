# AetherHarness / DSH-Orchestrator

> 面向多智能体协同的自愈编排与可信调度平台
> **Take as little human attention as possible, give as much value as possible.**

一个零运行时依赖的 TypeScript 平台：声明式 DAG 工作流 + 负载感知调度 + PDCA 自愈循环 + 三层可信验证，
自带交互式终端 UI（TUI）。

---

## 快速开始

```bash
node -v            # 需要 >= 20
pnpm install       # 或 npm install —— 只装 typescript 与 @types/node 两个 devDependency
pnpm build         # tsc → dist/
pnpm start         # 交互式 TUI
```

| 命令 | 作用 |
|:---|:---|
| `pnpm run web` | 启动 Web 控制台与实时可视化页面（浏览器访问 http://127.0.0.1:3300） |
| `pnpm start` | 交互式终端 UI（备用屏幕，↑↓/⏎/a/q） |
| `pnpm run auto` | 自动播放：跑完 3 个任务并自动处理升级卡片（无需键盘） |
| `pnpm run live` | 用 **DeepSeek API** 驱动整个智能体团队（需 `DEEPSEEK_API_KEY`） |
| `pnpm run preview` | 渲染 3 帧到 stdout 后退出（非 TTY 环境预览布局） |
| `pnpm run demo` | 无头纯文本端到端报告（录制/CI 用） |
| `pnpm test` | 验证核心引擎、LLM 降级与 Web 接口契约 |

运行环境变量：`AETHER_SIM_LATENCY_MS=0` 可关闭模拟的模型延迟（默认 55ms，见下文"诚实声明"）。

### Windows / PowerShell 常见问题

**`pnpm : 无法加载文件 …\pnpm.ps1，因为在此系统上禁止运行脚本`**

这是 PowerShell 的脚本执行策略（默认禁止跑 `.ps1`），与项目无关。三种解法任选：

```powershell
# 1) 用 .cmd shim，最省事，不改系统设置
pnpm.cmd run build
pnpm.cmd run live

# 2) 完全绕开 pnpm
node_modules\.bin\tsc.cmd -p tsconfig.json
node dist/src/cli.js --live

# 3) 放开当前用户的执行策略（一次性，永久生效）
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

**`--live` 提示 "DEEPSEEK_API_KEY is not set"，但明明设置过**

环境变量是**进程级**的：在 A 终端窗口 `$env:DEEPSEEK_API_KEY=...` 之后，B 窗口看不到它。
在当前这个窗口重新设置即可，并建议先跑无头模式确认链路：

```powershell
$env:DEEPSEEK_API_KEY="sk-..."
node dist/src/cli.js --live --headless
```

**想先确认端点能通、但不想浪费额度**

用无效 key 打一次即可：返回 `HTTP 401` 说明地址、方法、鉴权头都对（返回 404 才是路径错了）。
这也正是 `provider.ts` 的错误分类依据——401/403 立即失败、不重试。

---

## 这个版本做了什么

v1.0 是一个"内核真实、平台空壳"的竞赛原型：`SelfLoopEngine` 与 `VerificationEngine` 能跑，
但 `WorkflowEngine` / `DynamicScheduler` / `FeedbackOptimizer` 在真实链路里是死代码，
Self-Loop 的"修复"是 `iteration === 1 ? buggy : fixed` 的硬编码，且**没有任何前端或服务端**。

v2.0 把它改造成一条真实链路：**每个模块都在关键路径上**。

```
Orchestrator
 ├─ KnowledgeBase      混合检索（CJK bigram + 哈希向量）
 ├─ Scheduler          优先级老化 + 能力派发 + 依赖门控 + 重试/故障转移
 ├─ WorkflowEngine     DAG 校验（DFS 环检测）/ 7 类节点 / 超时 / 逐节点检查点
 │   └─ AgentRegistry → BaseAgent → AgentBrain  ← 离线 Scripted ｜ LlmBrain(DeepSeek) + Fallback
 │        └─ ToolRegistry → code_sandbox / test_runner / static_analyzer / git_patch_manager
 ├─ SelfLoopEngine     PDCA：结构化失败 → Critic 归因 → 反馈驱动重建
 ├─ VerificationEngine Tier-1 规则 / Tier-2 沙箱断言 / Tier-3 红蓝审计
 └─ FeedbackOptimizer  提示词自愈（幂等）+ 工具可靠性 + 路径重路由
```

一次 run 的真实调用链（可在 TUI 事件流里逐帧看到）：

```
requirement(agent) → architecture(agent) → complexity gate(condition)
  → self_loop ─┬─ develop(agent, 经调度器)  ← 失败规则 ID
               ├─ verify(verification)      ← 三层验证
               └─ critic(agent)             ← 根因归因
  → static scan(tool) → git patch(tool)
```

---

## 接真实模型（DeepSeek / 任意 OpenAI 兼容端点）

`AgentBrain` 是引擎唯一认识的认知接口。离线时它是确定性的脚本大脑；`--live` 时换成
`LlmBrain`，而工作流 / 调度 / 验证 / 自愈循环**一行都不用改**。

```bash
# PowerShell
$env:DEEPSEEK_API_KEY="sk-..."
pnpm run build
pnpm run live                       # 交互式 TUI，6 个 Agent 全部走模型
node dist/src/cli.js --live --headless   # 或纯文本报告
```

| 配置 | 默认 | 说明 |
|:---|:---|:---|
| `DEEPSEEK_API_KEY` | — | 必填。未设置时 `--live` 打印提示并**自动退回离线**，不会崩 |
| `DEEPSEEK_BASE_URL` / `--base-url` | `https://api.deepseek.com` | 换成任意 OpenAI 兼容端点（vLLM / OneAPI / Azure…） |
| `DEEPSEEK_MODEL` / `--model` | `deepseek-chat` | `deepseek-reasoner` 也可 |
| `--temperature` | 0.2 | 代码生成偏确定性 |
| `--no-fallback` | 关 | 严格实时模式，启动时要求模型配置，推理失败会显式记录 |

CPA 等兼容端点也可使用 `OPENAI_API_KEY`、`OPENAI_BASE_URL` 和 `CHAT_MODEL`。配置这些进程环境变量后，运行 `node dist/src/cli.js --web --live --no-fallback` 即可。显式参数及已有 DeepSeek/Aether 变量优先。

### 工程上做了哪些防护

真实模型的输出不可控，所以 `LlmBrain` 不是"转发请求"那么薄：

1. **分层 JSON 抽取**：精确解析 → ```json 围栏 → 扫描第一个平衡的 `{...}`（正确跳过字符串内的花括号）；`{}` 这种由 `reset() {}` 产生的假阳性会被忽略。
2. **模型不守 JSON 也能用**：developer 解析器在 JSON 里找不到 `code` 时，退而接受一个干净的 ```js 代码块。
3. **输出校验，不合格就降级**：解析失败 / 产物过短 / 缺关键字段 → 抛错 → `FallbackBrain` 立刻切回离线大脑，单次抖动不会让整条 run 失败。
4. **审核信号受白名单约束**：Tier-3 的 LLM 审计员只能引用那 7 个信号 id（每个都对应一个修复策略）。模型编造的 id 会被过滤并在评论里注明；"approve 的同时又 citing 缺陷"这种自相矛盾的回答按**驳回**处理。
5. **验收测试永不交给模型写**：`testSuiteCode` 始终取领域模块里的规范测试集。让模型同时写代码和自己的考题，自愈循环就会"对着被削弱的 oracle 收敛"。
6. **传输层**：429/5xx/网络/超时 → 指数退避重试（默认 2 次）；401/403 立即失败不浪费额度；单请求硬超时 45s；错误信息**脱敏**（`sk-***`）。
7. **用量记账**：`usage.prompt_tokens / completion_tokens` 直接进 telemetry，TUI 与无头报告打印真实调用数与 token 数（不再是估算）。

### 一次 `--live` 运行的判定逻辑

模型拿到的不是"请写个限流器"，而是**上一轮的结构化失败**：失败的规则 id、沙箱断言的原文、Critic 的归因、以及必须逐字通过的验收测试。收敛判定仍然在本地确定性沙箱里完成——**模型说它对不算数，测试通过才算数**。

不收敛也没关系：预算耗尽 → 最小注意力升级卡片 → 人决定重试 / 接受 / 中止。

模型可能一轮就过，也可能一直过不了。这正是平台存在的理由，而不是需要隐藏的事实。

---

## v1.0 缺陷 → v2.0 行为

全部有回归用例（`tests/run-tests.ts`），可 `pnpm test` 复现。

| # | v1.0 的实际行为 | v2.0 |
|:--|:---|:---|
| 1 | `validate()` 不检测环路；`timeoutMs` 声明了但从不读取 → 环路工作流永久挂死 | DFS 三色环检测，报告环路路径；`timeoutMs` / `maxSteps` 在节点间强制生效 |
| 2 | `new Function` 当沙箱，可触达 `process`；同步死循环让 `Promise.race` 超时永不触发 | `node:vm` + 硬超时，**能中断同步死循环**（实测 150ms 内） |
| 3 | 每次工具调用泄漏一个 10s 定时器，进程退不出去 | 定时器在 `finally` 中清理（实测活跃 Timeout 句柄为 0） |
| 4 | `self_loop` / `verification` / `parallel_group` 三类节点静默返回 `{status:'pass'}` | 全部真实执行；未知节点类型在**校验期**报错 |
| 5 | 优先级老化就地累加，两次调度后全部饱和到 10 → 退化成 FIFO | 只读计算 `min(10, base + floor(wait/τ))`，`basePriority` 不被改写 |
| 6 | `dependencies` 收下但从不检查；失败任务直接丢弃 | 依赖门控 + 重试重新入队 + 可能落到更健康的 Agent（故障转移） |
| 7 | Tier-3 只有 `length < 20` 和 `/eval|secret/` 两条判定 → 任何代码全票通过 | 每个审计器产出**可归因的规则信号**（REV-001 / SEC-003 / …），并回灌自愈循环 |
| 8 | `git_patch_manager` 只输出 `+` 行，`git apply` 必然失败 | LCS 统一 diff，含 `-` 行、上下文、正确 hunk 头、`\ No newline at end of file`；测试里用 `git apply --check` 验证 |
| 9 | 中文不分词 → 中文文档永远只有 1 个 chunk，中文检索等于关闭 | CJK 双字切分 + token 级分块（实测长中文文档切 10 块且可召回） |
| 10 | `rollback` 全项目零调用；快照只在 t=0 取一次 | 每个节点执行前取检查点，`rollback` 恢复到最近安全点 |
| 11 | 场景用手写顺序调用绕过了 workflow/scheduler/optimizer | 全部经 `WorkflowEngine` + `DynamicScheduler` 执行（演示里的 queue/dispatch/aging 数字都是真的） |
| 12 | 修复逻辑是 `iteration===1 ? v1 : v2` | 修复由**失败规则 ID 集合**驱动；无对应策略的规则（`DIST-001`）就真的不收敛 → 触发升级卡片 |
| 13 | 干净 clone 下 `pnpm build` 报 TS2688（缺 `@types/node`） | devDependencies 补齐，`main`/`types`/`bin` 指向构建产物 |
| 14 | 版本历史浅拷贝，改活对象会改写历史 | 深拷贝 |

---

## 可视化呈现：双呈现层（Web 控制台 + 交互式 TUI）

平台提供两套互补的可视化窗口，均具备实时观测与人在回路（HITL）决策能力：

### 1. Web 可视化控制台 (Web Dashboard)

```bash
pnpm run web       # 启动零依赖 Web 控制台（浏览器打开 http://127.0.0.1:3300）
```

Web 控制台只监听本机回环地址。运行和 Agent 接口返回用于展示的字段，模型密钥、系统提示和 Agent 内存留在进程内。

Web 启动入口默认将运行、最近 100 条运行事件、验收轮次、补丁和人工决策保存到 `.aether/runs`。可通过 `AETHER_DATA_DIR` 指定目录，每个目录由一个服务进程使用。写入采用原子替换，正常停止会等待当前运行结束。

重启后可查看历史并处理待人工卡片。中断时仍在执行的任务会标记为失败并保留中断说明。历史仓库任务的加倍重试要求当前配置匹配原基线提交和隔离镜像。直接使用库构造器时可通过 `dataDir` 启用存储，注入的 Orchestrator 由调用者负责关闭。

从工作台启动或选择运行后，地址会更新为 `/runs/:id`，刷新或直接打开可定位同一次运行。执行详情通过 `/api/runs/:id/events` 订阅事件。重连时使用 `Last-Event-ID` 续传保留窗口内的事件，游标过期时同步最新运行快照。控制台地址适用于同一台机器上的服务。

1. 点击 **运行缺陷修复**。展开「验证与自愈」的第一轮和第二轮，对照失败规则、诊断建议与通过结果，再到「代码与补丁」下载统一 diff。
2. 点击 **运行阻塞案例**。在「运行摘要」查看分布式对账规则 `DIST-001`，选择加倍轮数、保留草稿待复审或终止并回退。草稿仍会保留原验收结论。
3. 点击 **并发运行全部案例**。通过「运行历史」切换案例，在「执行日志」查看派发 Agent、优先级和等待时间，在「团队、调度与工具」查看并发负载、工具调用与提示词优化记录。
4. 打开「Agent 中心」查看注册版本和近期参与的运行。打开「系统设置」查看实际生效的模型、工具权限、超时、并发上限和重试策略。
5. 在运行摘要下载验收报告（JSON），可核对执行状态、自动验收结论、交付状态与补丁 SHA-256。人工处理可附备注，报告保留操作与证据。

工作流预览和执行状态来自同一份后端定义。离线模式便于复现演示。配置 `DEEPSEEK_API_KEY` 后运行 `pnpm run web --live` 可启用大模型推理。

#### 固定 Git 仓库修复

仓库任务支持一个管理员配置的本地仓库、固定提交及 `src/rate-limiter.js`。输入任务后，服务从 Git 提交读取基线并运行固定验收测试，再把失败证据交给需求、架构与开发 Agent。正式补丁必须通过固定测试、审查、静态检查和 `git apply --cached --check`。补丁检查使用临时索引，源仓库的工作树和索引保留原状。

基线验收测试与静态扫描并行执行。自愈通过后进入 Git 交付子流程，依次执行候选扫描、补丁生成和应用检查。点击工作流中的并行检查或交付子流程节点，可查看实际子节点状态。

准备一个获准把目标文件发给模型的仓库，启动 Docker Linux 引擎并配置模型密钥。运行时只接受已在本地缓存的固定镜像 ID。测试容器没有网络或宿主文件挂载，文件系统只读，并设有内存、CPU 和进程数限制。

```powershell
npm.cmd run build
docker pull node:24-alpine
$env:AETHER_RUNNER_IMAGE = (docker image inspect node:24-alpine --format '{{.Id}}').Trim()
$env:AETHER_PROJECT_REPO = 'D:\Projects\rate-limiter'
$env:AETHER_PROJECT_BASE = (git -C $env:AETHER_PROJECT_REPO rev-parse HEAD).Trim()
node dist/src/cli.js --web --live --no-fallback
```

如需从预置缺陷生成独立演示仓库，可在构建后运行以下命令，再按上面的步骤配置镜像和启动 Web。示例提交由 Git 在临时目录中创建。

```powershell
$env:AETHER_PROJECT_REPO = Join-Path ([IO.Path]::GetTempPath()) ('aether-project-' + [guid]::NewGuid())
$fixture = node scripts/create-demo-repository.mjs $env:AETHER_PROJECT_REPO | ConvertFrom-Json
$env:AETHER_PROJECT_BASE = $fixture.revision
```

默认测试使用可注入的本地测试适配器和模拟模型。设置 `AETHER_TEST_RUNNER_IMAGE` 为上述镜像 ID 后再运行 `npm.cmd test`，同一仓库回归用例会改用真实 Docker 执行器。

执行 `node scripts/benchmark.mjs` 可重复测量固定的离线工作负载。脚本用同一组三个案例及预算对比串行和三路并发，并输出每组 5 批的原始时延、通过率、等待和失败分布。

### 2. 交互式终端 UI (TUI)

```
┌─ AetherHarness · live orchestration ─────────────── running ─┐
│ RateLimiter · defect healing  RUNNING  ⏱ 1.2s  runs: 1..3   │
├─ agents · load ────────┬─ workflow · DAG timeline ──────────┤
│ ◐ Alex   engineer ███ 1/1│ ✔ 1 requirement   agent    62ms   │
│ · Elena  reviewer ░░░ 0/3│ ◐ 4 self-loop     self_loop 282ms │
│ queue 0 run 1 done 11   │ ✔ 7 verify        verification     │
├─ verification · three tiers ───────────────────────────────┤
│ score 90.0%  verdict BLOCKED  failed rules DIST-001         │
├─ event stream ─────────────────────────────────────────────┤
└─────────────────────────────────────────────────────────────┘
```

- 菜单：`↑↓` 选择，`⏎` 跑单个，`a` 并发跑全部，`q` 退出
- 运行视图：`←→` 切换 run，`b/esc` 返回菜单，`e` 聚焦升级卡片
- 升级卡片：`↑↓` 选（重试加倍预算 / 接受草稿转人工 / 中止回滚），`⏎` 确认

---

## 诚实声明（这是本版本最重要的一节）

上一版文档里的 `94% 成功率 / 98.5% 漏洞拦截 / 0.12 次打扰 / 1.42 轮收敛` **在仓库里没有任何
可复现的评测脚本支撑**。v2.1 不再声称这些数字。可复现的只有：

- `pnpm test` 的端到端与契约断言，覆盖核心引擎、LLM 与降级路径、Web 运行接口和人工决策；
- `pnpm run demo` 打印的本次运行遥测：dispatches / retries / aging promotions / 每工具调用次数与成功率 / 每 Agent token 数。

明确的边界：

1. **默认不联网。** 不用 `--live` 时，6 个 Agent 跑的是确定性离线大脑（`RateLimiter` 的修复策略空间），
   这样 CI 与演示都不依赖任何 API。加 `--live` 才换成 DeepSeek；两者共用同一套引擎与验证器。
   离线大脑的"智能"是写死的策略空间，不是推理——这一点不要混淆。
2. **验收测试在有超时和堆预算的子进程内运行。** 预置场景的候选源码与固定测试脚本使用独立的 VM 上下文。
   子进程提供故障隔离。执行不可信项目或开放远程访问前，还需要操作系统级权限隔离。
3. **token 数**：离线模式是按字符估算（标注 `estimated`），`--live` 模式是 API 返回的真实用量（标注 `reported`）。
4. **55ms 的模型延迟是模拟值**，只为让调度器的排队行为可观察；`AETHER_SIM_LATENCY_MS=0` 可关闭。
   使用 `--live` 时该模拟延迟仍然生效（它模拟的是"一次认知往返"，与真实网络延迟叠加）。
5. **双呈现层落地**。已实现零外部依赖的轻量 Web 服务器与响应式 SPA 控制台（`src/web/server.ts` + `client.ts`），通过 HTTP/SSE 与内部 `Orchestrator` 闭环交互，全面打通多智能体编排的可视化展示与人在回路决策。
6. `COMPETITION_REQUIREMENTS.md` / `PROPOSAL.md` / `SLIDES_OUTLINE.md` / `DEMO_SCRIPT.md` 是竞赛材料（含赛题技术规范与申报书），描述的是整体设计方案。**以本 README、代码与测试为准。**

---

## 目录结构

```
src/
  types/index.ts                    领域模型与契约（每个字段都被引擎消费）
  agent/brain.ts                    AgentBrain 接口 + 确定性离线大脑
  agent/llm/provider.ts             DeepSeek / OpenAI 兼容客户端（重试、超时、脱敏、用量）
  agent/llm/prompt.ts               分层 JSON 抽取与提示词工具
  agent/llm/llm-brain.ts            LlmBrain + FallbackBrain + 用量遥测
  agent/llm/specs.ts                6 个角色的提示词与响应校验（含审计信号白名单）
  agent/llm/index.ts                配置解析与 applyLlm（把团队换成 LLM 团队）
  agent/base-agent.ts               画像 / 滑动记忆 / 工具授权 / 名额
  agent/agent-registry.ts           注册、深拷贝版本历史、能力×负载匹配
  knowledge/knowledge-base.ts       CJK 双字 + 哈希向量混合检索
  tools/tool-registry.ts            超时清理、参数类型校验、可靠性指标
  tools/builtin-tools.ts            vm 沙箱、测试执行器、静态扫描、LCS diff
  workflow/workflow-engine.ts       DAG 校验/执行、7 类节点、检查点、超时
  scheduler/dynamic-scheduler.ts    老化公式、依赖门控、容量预留、重试
  verification/verification-engine.ts  三层验证 + 可归因信号
  selfloop/self-loop-engine.ts      PDCA 循环、失败累积、升级卡片
  optimization/feedback-optimizer.ts 幂等提示词自愈 + 工具可靠性
  scenarios/rate-limiter.ts         业务域：修复策略空间、规则、DAG
  orchestrator.ts                   门面：并发多任务、事件总线、升级处理、LLM 装配
  web/server.ts · client.ts         零依赖 Web 仪表盘与 SSE 实时服务端
  tui/ansi.ts · keys.ts · app.ts    零依赖终端 UI
  cli.ts · demo.ts                  入口：Web / TUI / 无头
tests/run-tests.ts                  端到端与契约断言
```

## 许可证

MIT
