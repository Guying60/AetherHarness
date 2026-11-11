# AetherHarness 参赛复现

发布版本为 [AetherHarness v2.2.0](https://github.com/Guying60/AetherHarness/releases/tag/v2.2.0)。评审也可直接使用交付包中的同版源码。

## 离线演示

在新目录解压源码，安装 Node.js 20.3+、Git 和 pnpm。以下命令在 Windows PowerShell 使用 `.cmd`，macOS 或 Linux 使用 `pnpm`。

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd run build
pnpm.cmd test
node dist/src/cli.js --web
```

打开 [本机工作台](http://127.0.0.1:3300)，用启动终端显示的临时账号和令牌登录。依次运行基础验收、边界缺陷自愈和分布式对账阻塞。边界缺陷案例会记录失败、诊断与复验，分布式案例会保留待人工处理的卡片。通过运行摘要下载验收报告。浏览器中的 Agent 历史和系统设置均来自服务当前的有效状态与已保存证据。

如需复核操作者与只读查看者的权限差异，按 README 生成两组账号配置。使用操作者提交运行并在摘要中取消，切换查看者后复查报告中的申请账号、时间和备注。查看者可读取证据，写操作由服务端拒绝。

## 严格 Live 与真实容器

准备本机 Docker Linux 引擎和已授权的模型端点。部署方从终端会话或凭据管理器设置 `OPENAI_API_KEY`、`OPENAI_BASE_URL` 和 `CHAT_MODEL`，也可使用 README 中的 DeepSeek 环境变量。目标文件和任务会发送到配置的模型端点。

```powershell
docker pull node:24-alpine
$env:AETHER_RUNNER_IMAGE = (docker image inspect node:24-alpine --format '{{.Id}}').Trim()
$env:AETHER_PROJECT_REPO = Join-Path ([IO.Path]::GetTempPath()) ('aether-project-' + [guid]::NewGuid())
$fixture = node scripts/create-demo-repository.mjs $env:AETHER_PROJECT_REPO | ConvertFrom-Json
$env:AETHER_PROJECT_BASE = $fixture.revision
node dist/src/cli.js --web --live --no-fallback
```

在仓库任务中输入「修复限流器容量、补充速率和令牌参数的边界校验，保留正常补充行为」。检查基线并行节点、候选验证、Git 交付子流程和最终报告。复现实录可直接克隆随包附带的固定基线，再用其提交启动。

```powershell
$env:AETHER_TEST_RUNNER_IMAGE = $env:AETHER_RUNNER_IMAGE
pnpm.cmd test
Remove-Item Env:AETHER_TEST_RUNNER_IMAGE
node scripts/benchmark.mjs
```

基准每组 5 批，按相同任务、预算和离线 Agent 对比串行与三路并发。报告包含每批原始记录，分布式对账按预期阻塞计数。

## 独立复核实录补丁

从包含补丁、报告与 Git bundle 的交付目录运行以下命令。目标目录需要是新目录。

```powershell
$bundle = (Resolve-Path 'AetherHarness-baseline.bundle').Path
$patch = (Resolve-Path 'AetherHarness-verified.patch').Path
$report = Get-Content 'AetherHarness-live-report.json' -Raw | ConvertFrom-Json
git clone $bundle replay-baseline
git -C replay-baseline rev-parse HEAD
git -C replay-baseline apply --check $patch
(Get-FileHash -Algorithm SHA256 $patch).Hash.ToLowerInvariant() -eq $report.delivery.sha256
```

提交号应与报告的 `project.revision` 一致，SHA-256 比对应输出 `True`。人工复审的报告保留原自动验收阻塞状态。当前版本面向单机操作员和固定单文件仓库，模型服务与 Docker 版本会影响运行耗时。
