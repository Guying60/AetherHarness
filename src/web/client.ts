import { dashboard } from './dashboard.js';
import { CONSOLE_STYLE } from './console-style.js';
import { icon } from './icons.js';
import { NAV_MARKUP } from './nav.js';

/**
 * Console shell + workbench markup.
 *
 * Rendered server-side; `dashboard()` takes over in the browser. Two rules keep
 * this file honest:
 *   1. every element `dashboard.ts` reads or writes has a stable `id`
 *   2. anything the browser script needs at runtime is inlined below, because
 *      the script ships as `dashboard.toString()` (there is no module graph)
 *
 * Design: design/console-20261117 (Figma 1280×1627) — 240px aside, 56px top bar.
 */

export const DASHBOARD_HTML = /* html */ `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AetherHarness · 工作台</title>
  <style>${CONSOLE_STYLE}</style>
</head>
<body>
<aside class="sidebar">
  <div class="sidebar-head" aria-hidden="true"></div>
  <nav aria-label="控制台导航">${NAV_MARKUP}</nav>
  <div class="sidebar-foot">
    <div class="runtime-card" aria-label="运行态">
      <dl>
        <div class="row"><dt><i class="dot" style="color:#10b981"></i>运行态</dt><dd id="rt-memory">—</dd></div>
        <div class="row"><dt><i class="dot" style="color:#4338ca"></i>定义库</dt><dd id="rt-defs">—</dd></div>
        <div class="row"><dt><i class="dot" style="color:#6366f1"></i>工作流</dt><dd id="rt-flows">—</dd></div>
      </dl>
    </div>
    <p class="sidebar-note" id="storage-status"></p>
  </div>
</aside>

<div class="surface">
  <header class="topbar">
    <div class="crumbs">
      <span class="root">AetherHarness</span>
      <span class="sep" aria-hidden="true">${icon('chevronRight')}</span>
      <strong id="current-page">工作台</strong>
    </div>
    <div class="top-actions">
      <span id="connection" class="conn" role="status"><i class="dot"></i><span id="connection-label">正在连接</span></span>
      <span id="session-account" class="account">${icon('avatarChip')}<span id="session-name"></span></span>
      <a class="icon-btn" href="/settings" data-route aria-label="系统设置" title="系统设置">${icon('gearChip')}</a>
      <button id="sign-out" type="button" class="signout" hidden>${icon('signOut')}<span>退出</span></button>
    </div>
  </header>

  <main class="shell">
    <div class="page">
      <p id="notice" class="notice" role="status"></p>

      <!-- ---------------------------------------------------------- workbench -->
      <section data-page="workbench" aria-labelledby="heading" class="page">
        <header class="page-head">
          <div class="lede">
            <div class="eyebrow-row">
              <span class="eyebrow">CLUSTER OPS · ZONE 01</span>
              <span class="live" id="bus-state"><i class="dot"></i><span id="bus-label">编排总线在线</span></span>
            </div>
            <h1 id="heading" tabindex="-1">工作台</h1>
            <p class="sub">启动预设案例或提交仓库任务，实时调优自主代理编排集群</p>
          </div>
          <div class="page-actions">
            <span id="mode" class="mode-pill"></span>
            <button id="refresh-view" class="btn" type="button">${icon('refresh')}<span>刷新</span></button>
            <button id="run-all" class="btn primary" type="button" disabled>${icon('play')}<span>全部运行</span></button>
          </div>
        </header>

        <form id="project-form" class="card" aria-labelledby="project-title">
          <div class="card-head">
            <div class="title">
              ${icon('repoChip')}
              <h2 id="project-title">仓库任务编排</h2>
              <span id="repo-badge" class="badge">未配置</span>
            </div>
            <span id="schema-badge" class="badge warn"><i class="dot"></i>Awaiting Input Schema</span>
          </div>
          <div class="repo-body">
            <div class="repo-col">
              <span class="label">${icon('branch')}目标仓库与分支</span>
              <div class="repo-select-wrap">
                <span class="ico-wrap lead" aria-hidden="true">${icon('selectCaret')}</span>
                <select id="project-select" class="select repo-select" aria-label="目标仓库" disabled>
                  <option>正在读取仓库配置</option>
                </select>
                <span class="caret" aria-hidden="true">${icon('chevronDown')}</span>
              </div>
              <p class="repo-meta"><span id="repo-target">Target branch: —</span><span id="repo-tree">未配置</span></p>
            </div>
            <div class="repo-col">
              <div class="repo-meta tight"><span class="label">${icon('flag')}任务目标与验收基准</span><span class="faint">支持自然语言任务编排</span></div>
              <div class="prompt-field">
                <textarea id="project-goal" class="select" rows="3" maxlength="2000" required disabled
                  placeholder="描述你想让团队达成的目标… 例如：修复高并发下滑动窗口限流器计数漂移，并构造 5000 QPS 单元测试验证零漏桶"></textarea>
                <div class="prompt-actions">
                  <button id="project-sample" class="btn ghost sm" type="button" disabled>智能填充</button>
                  <button id="project-submit" class="btn primary sm" type="submit" disabled>${icon('send')}<span>提交任务</span></button>
                </div>
              </div>
              <p class="muted small" id="project-status"></p>
            </div>
          </div>
        </form>

        <div>
          <div class="section-title">
            <div class="row"><h2>基准压测与编排预设</h2><span id="preset-count" class="badge violet">Presets 0/0</span></div>
            <a class="link" href="/runs" data-route>查看运行记录 →</a>
          </div>
          <div id="scenario-cards" class="preset-grid"><p class="empty">正在加载可运行的案例…</p></div>
        </div>

        <div class="kpi-grid">
          <div class="kpi ok">
            <div class="kpi-top"><span>实时运行中</span><i class="dot" style="width:8px;height:8px;background:#10b981"></i></div>
            <div class="kpi-value"><b id="stat-running">0</b><em id="stat-running-note">集群负荷 0%</em></div>
          </div>
          <div class="kpi">
            <div class="kpi-top"><span>任务队列等待</span>${icon('queue')}</div>
            <div class="kpi-value"><b id="stat-queued">0</b><em id="stat-queued-note">就绪待调度</em></div>
          </div>
          <div class="kpi">
            <div class="kpi-top"><span>累计已完成</span><span class="delta">${icon('trendUp')}<b id="stat-delta">+0</b></span></div>
            <div class="kpi-value"><b id="stat-done">0</b><em id="stat-done-note">今日执行批次</em></div>
          </div>
          <div class="kpi accent">
            <div class="kpi-top"><span>平均验收分 (Bench)</span>${icon('gauge')}</div>
            <div class="kpi-value"><b id="stat-score">0.00</b><em id="stat-score-note">合格率 0%</em></div>
          </div>
        </div>

        <section class="card runs-card" aria-labelledby="runs-title">
          <div class="card-head">
            <div class="row"><h2 id="runs-title">最近任务执行</h2><span class="badge">Telemetry Feed</span></div>
            <div class="segmented" id="runs-tabs" role="group" aria-label="运行筛选">
              <button type="button" data-runs-tab="all" aria-pressed="true">全部 <b id="runs-count-all">0</b></button>
              <button type="button" data-runs-tab="active" aria-pressed="false" class="pending">进行中 <b id="runs-count-active">0</b></button>
              <button type="button" data-runs-tab="done" aria-pressed="false">已结束 <b id="runs-count-done">0</b></button>
            </div>
          </div>
          <div class="table-wrap" id="runs-table-wrap">
            <table class="runs-table">
              <thead><tr><th>运行 ID</th><th>场景名称</th><th>状态</th><th>验收得分</th><th>耗时</th><th>操作</th></tr></thead>
              <tbody id="runs-tbody"></tbody>
            </table>
          </div>
          <div id="runs-empty" class="idle" hidden>
            ${icon('terminalChip')}
            <h4>还没有运行记录</h4>
            <p>点击上方基准场景或提交仓库编排任务，首个 Agent 将自动介入并记录全链路遥测数据。</p>
            <button class="btn primary" type="button" data-run="rl-normal">${icon('playSmall')}<span>去启动</span></button>
            <p class="trace">TELEMETRY FEED · IDLE BUFFER ARCHITECTURE</p>
          </div>
        </section>
      </section>

      <!-- --------------------------------------------------- execution/delivery -->
      <section data-page="execution delivery" aria-labelledby="execution-title" hidden>
        <div class="cockpit-bar">
          <div class="ident">
            <nav class="crumbs-mini" aria-hidden="true"><span>工作台</span><i>›</i><span id="run-crumb">运行</span></nav>
            <span id="run-status-pill"></span>
            <span id="run-id" class="mono strong"></span>
            <span id="run-policy" class="chip-soft"></span>
            <span id="run-meta" class="run-time"></span>
          </div>
          <div class="bar-actions">
            <label class="sr-only" for="run-history">运行历史</label>
            <select id="run-history" class="select compact" disabled><option>暂无运行</option></select>
            <a id="run-report" class="btn sm" href="#" hidden>下载报告</a>
            <button id="run-cancel" class="btn sm danger" type="button" data-cancel hidden>取消运行</button>
          </div>
        </div>
        <h1 id="execution-title" class="sr-only" tabindex="-1">任务执行中心</h1>
        <p id="run-caption" class="sr-only"></p>
        <div id="execution-body">
          <div class="tabs" aria-label="执行视图">
            <button class="tab" type="button" data-tab="flow" aria-pressed="true">执行流程</button>
            <button class="tab" type="button" data-tab="events" aria-pressed="false">实时日志</button>
            <button class="tab" type="button" data-tab="tools" aria-pressed="false">工具调用</button>
            <button class="tab" type="button" data-tab="context" aria-pressed="false">任务上下文</button>
          </div>
          <div class="cockpit-grid">
            <aside class="panel rail-panel">
              <div class="rail-head"><h3>执行步骤序列</h3><span id="step-count" class="badge">—</span></div>
              <ol id="execution-steps" class="step-list"></ol>
            </aside>
            <div class="stack">
              <div class="panel" id="flow-panel">
                <div class="row between"><h3>编排图 (DAG Flow)</h3><span id="dag-legend" class="legend"></span></div>
                <div id="pipeline-flow" class="pipeline-flow"><p class="muted small">正在加载工作流…</p></div>
                <div id="dag-dock" class="dag-dock"></div>
              </div>
              <div id="execution-evidence" class="panel" hidden></div>
            </div>
            <aside class="stack">
              <div class="panel">
                <div class="row between"><h3>节点详情</h3><span id="workflow-version" class="mono muted small"></span></div>
                <div id="node-inspector"></div>
              </div>
              <div class="panel"><h3>运行摘要</h3><div id="run-summary" class="stack"></div></div>
              <div class="panel"><h3>本次运行的 Agent</h3><div id="run-agents" class="stack"></div></div>
            </aside>
          </div>
        </div>
        <div id="delivery-body" class="stack" hidden>
          <div class="tabs" aria-label="交付视图">
            <button class="tab" type="button" data-tab="result" aria-pressed="true">结果概览</button>
            <button class="tab" type="button" data-tab="artifact" aria-pressed="false">代码 Diff</button>
            <button class="tab" type="button" data-tab="verification" aria-pressed="false">测试与自愈</button>
            <button class="tab" type="button" data-tab="events" aria-pressed="false">执行记录</button>
          </div>
          <div id="delivery-summary" class="panel stack"></div>
          <div id="delivery-evidence" class="panel" hidden></div>
        </div>
      </section>

      <!-- --------------------------------------------------------- agent view -->
      <section data-page="agents" aria-labelledby="team-title" class="stack" hidden>
        <header class="page-head">
          <div class="lede">
            <div class="eyebrow-row"><span class="eyebrow">LIVE EXEC</span></div>
            <h1 id="team-title" tabindex="-1">Agent 运行</h1>
            <p class="sub">运行期实时视图 · 负载 / 历史 / 调度</p>
          </div>
          <div class="page-actions">
            <span class="stamp plain">SYS_ID: <span id="sys-id">—</span></span>
            <span class="mode-pill" id="poll-label">轮询间隔: —</span>
            <button id="refresh-telemetry" class="btn" type="button">${icon('refresh')}<span>刷新遥测</span></button>
            <a class="btn ghost" href="/settings" data-route>调度策略</a>
          </div>
        </header>
        <div id="scheduler" class="cockpit-card"></div>
        <section>
          <div class="card-head">
            <div class="row"><h2>Agent 团队</h2><span id="team-count" class="badge">—</span></div>
            <div id="team-legend" class="legend"></div>
          </div>
          <div id="team" class="agent-grid"></div>
        </section>
        <div class="split-2">
          <div id="system"></div>
          <div id="optimizations"></div>
        </div>
      </section>

      <!-- ----------------------------------------------------------- settings -->
      <section data-page="settings" aria-labelledby="settings-title" class="stack" hidden>
        <header class="page-head tight">
          <div class="lede"><h1 id="settings-title" tabindex="-1">系统设置</h1><span class="sub">运行环境与策略（只读展示）</span></div>
          <div class="chip-row">
            <span id="settings-stamp" class="stamp"><i class="dot"></i>STRICT_READONLY<span class="sep">|</span>ENV: —</span>
            <span id="settings-lock" class="stamp plain">启动参数加锁</span>
          </div>
        </header>
        <div class="scrim">
          <div class="lead">
            <span class="chip-icon" aria-hidden="true">${icon('navSettings')}</span>
            <p>设置由服务端环境变量与启动参数决定，本页仅展示；如需修改请调整启动参数或部署配置。</p>
          </div>
          <span class="digest"><span>FINGERPRINT</span><strong id="settings-digest">—</strong></span>
        </div>
        <div class="settings-split">
          <nav class="rail" id="settings-rail" aria-label="设置分类">
            <p class="rail-label">CONFIG SECTIONS</p>
            <button type="button" data-settings="model" aria-pressed="true">模型配置 <span class="num">01</span></button>
            <button type="button" data-settings="tools" aria-pressed="false">工具权限 <span class="num">02</span></button>
            <button type="button" data-settings="strategy" aria-pressed="false">执行策略 <span class="num">03</span></button>
            <button type="button" data-settings="runtime" aria-pressed="false">运行环境 <span class="num">04</span></button>
            <div class="rail-foot">
              <div class="row"><dt>策略时基</dt><i class="dot" style="color:#2170e4"></i></div>
              <dd id="settings-uptime">—</dd>
              <span class="meta" id="settings-memory">—</span>
            </div>
          </nav>
          <div id="settings-policy" class="stack"><p class="muted small">正在读取系统设置…</p></div>
        </div>
      </section>
    </div>
  </main>
</div>
<script>(${dashboard.toString()})();</script>
</body>
</html>`;
