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
| `pnpm start` | 交互式终端 UI（备用屏幕，↑↓/⏎/a/q） |
| `pnpm run auto` | 自动播放：跑完 3 个任务并自动处理升级卡片（无需键盘） |
| `pnpm run preview` | 渲染 3 帧到 stdout 后退出（非 TTY 环境预览布局） |
| `pnpm run demo` | 无头纯文本端到端报告（录制/CI 用） |
| `pnpm test` | 96 项断言，逐条对应一个已修复缺陷或一条引擎契约 |

运行环境变量：`AETHER_SIM_LATENCY_MS=0` 可关闭模拟的模型延迟（默认 55ms，见下文"诚实声明"）。

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
 │   └─ AgentRegistry → BaseAgent → AgentBrain（可替换的认知插槽）
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

## TUI

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
可复现的评测脚本支撑**。v2.0 不再声称这些数字。可复现的只有：

- `pnpm test` 的 96 项断言（含 14 条针对 v1.0 缺陷的回归）；
- `pnpm run demo` 打印的本次运行遥测：dispatches / retries / aging promotions / 每工具调用次数与成功率 / 每 Agent token 估算。

明确的边界：

1. **没有接真实 LLM。** `AgentBrain` 是认知插槽，当前实现是确定性的离线 `Scripted` 大脑
   （`RateLimiter` 的修复策略空间）。接 DeepSeek/OpenAI 只需实现一个 `AgentBrain`，引擎无需改动。
2. **`node:vm` 不是安全边界。** 它提供故障隔离与时间隔离（能中断死循环）、不向沙箱注入宿主对象，
   但无法防御真正的恶意逃逸。生产环境需要独立进程或容器。
3. **token 数是估算**（`length / 4`），不是真实计量，UI 里标注 `estimated`。
4. **55ms 的模型延迟是模拟值**，只为让调度器的排队行为可观察；`AETHER_SIM_LATENCY_MS=0` 可关闭。
5. **没有 Web 面板。** v1.0 的方案书里画了 `WebPanel` 与 REST/WS 接口，二者都不存在。
   v2.0 交付的是 TUI；`Orchestrator` 已经通过 `subscribe()` 暴露结构化事件流，接 HTTP/SSE 前端时无需改引擎。
6. `PROPOSAL.md` / `SLIDES_OUTLINE.md` / `DEMO_SCRIPT.md` 是 v1.0 的竞赛材料，描述的是目标设计，
   其中包含上文提到的不可复现数字。**以本 README、代码与测试为准。**

---

## 目录结构

```
src/
  types/index.ts                    领域模型与契约（每个字段都被引擎消费）
  agent/brain.ts                    AgentBrain 接口 + 确定性兜底大脑
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
  orchestrator.ts                   门面：并发多任务、事件总线、升级处理
  tui/ansi.ts · keys.ts · app.ts    零依赖终端 UI
  cli.ts · demo.ts                  入口：TUI / 无头
tests/run-tests.ts                  96 项断言
```

## 许可证

MIT
