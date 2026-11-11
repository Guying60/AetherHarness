import { dashboard } from './dashboard.js';
import { CONSOLE_STYLE } from './console-style.js';

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
  <a class="brand" href="/" data-route><span class="mark" aria-hidden="true">A</span>AetherHarness</a>
  <nav aria-label="控制台导航">
    <a href="/" data-route data-nav="workbench"><span class="nav-icon" aria-hidden="true">⌂</span>工作台</a>
    <a href="/runs" data-route data-nav="execution"><span class="nav-icon" aria-hidden="true">▷</span>任务执行</a>
    <a href="/agents" data-route data-nav="agents"><span class="nav-icon" aria-hidden="true">◇</span>Agent 中心</a>
    <a href="/delivery" data-route data-nav="delivery"><span class="nav-icon" aria-hidden="true">▣</span>验收与交付</a>
    <a href="/settings" data-route data-nav="settings"><span class="nav-icon" aria-hidden="true">⚙</span>系统设置</a>
  </nav>
  <p id="storage-status" class="sidebar-footer muted small"></p>
</aside>
<div class="surface">
  <header class="top"><div class="row between">
    <strong id="current-page">工作台</strong>
    <div class="row"><span id="connection" class="badge" role="status">正在连接</span><span id="session-account" class="small muted"></span><button id="sign-out" type="button" class="link" hidden>退出登录</button></div>
  </div></header>
  <main class="shell" id="main">
    <p id="notice" class="notice" role="status"></p>
    <section data-page="workbench" aria-labelledby="heading">
      <div class="workbench-grid">
        <div class="stack">
          <div class="hero">
            <div><h1 id="heading" tabindex="-1">多 Agent 协作工作台</h1>
            <p>提交工程任务或运行预设案例，跟进协作、验证与交付。</p></div>
            <div class="hero-art" aria-hidden="true">A</div>
          </div>
          <form id="project-form" class="panel stack" aria-labelledby="project-title">
            <h3 id="project-title">创建仓库任务</h3>
            <label class="stack small" for="project-goal">任务描述
              <textarea id="project-goal" class="select" rows="3" maxlength="2000" required disabled placeholder="例如：修复限流器的无效容量和令牌参数校验。"></textarea>
            </label>
            <div class="row between">
              <label class="row small" for="project-select">项目 <select id="project-select" class="select" disabled><option>正在读取仓库配置</option></select></label>
              <button id="project-submit" class="btn primary" type="submit" disabled>创建仓库任务</button>
            </div>
            <p id="project-status" class="muted small"></p>
          </form>
          <div>
            <div class="section-title"><h2 id="scenarios-title">预设案例</h2><button id="run-all" class="btn" type="button" disabled>并发运行全部案例</button></div>
            <div id="scenario-cards" class="cards"><p class="empty">正在加载可运行的案例…</p></div>
          </div>
        </div>
        <aside class="stack">
          <div class="panel"><h3>系统概览</h3><div id="overview" class="stack"></div><p id="mode" class="muted small">正在读取推理模式…</p></div>
          <div class="panel"><div class="row between"><h3>最近任务</h3><a class="link" href="/runs" data-route>查看历史</a></div><div id="recent-runs" class="stack"></div></div>
        </aside>
      </div>
    </section>
    <section data-page="execution delivery" aria-labelledby="execution-title" hidden>
      <div class="section-title run-head">
        <div class="stack"><h1 id="execution-title" tabindex="-1">任务执行中心</h1><p id="run-caption" class="muted small"></p></div>
        <label class="row small">运行历史 <select id="run-history" class="select" disabled><option>暂无运行</option></select></label>
      </div>
      <div id="execution-body">
        <div class="tabs" aria-label="执行视图">
          <button class="tab" type="button" data-tab="flow" aria-pressed="true">执行流程</button>
          <button class="tab" type="button" data-tab="events" aria-pressed="false">实时日志</button>
          <button class="tab" type="button" data-tab="tools" aria-pressed="false">工具调用</button>
          <button class="tab" type="button" data-tab="context" aria-pressed="false">任务上下文</button>
        </div>
        <div class="workspace">
          <div class="panel">
            <div id="flow-content" class="graph-layout">
              <div class="step-column"><h3>执行步骤</h3><div id="execution-steps" class="step-list stack"></div></div>
              <div class="graph">
                <div class="row between"><h3>工作流编排</h3><span id="workflow-version" class="mono muted small"></span></div>
                <div id="pipeline-flow" class="pipeline-flow"><p class="muted small">正在加载工作流…</p></div>
                <div id="node-inspector"></div>
              </div>
            </div>
            <div id="execution-evidence" hidden></div>
          </div>
          <aside class="stack">
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
    <section data-page="agents" aria-labelledby="team-title" class="stack" hidden>
      <div><h1 id="team-title" tabindex="-1">Agent 中心</h1><p class="muted">查看角色、并发负载和真实运行记录。</p></div>
      <div id="team" class="team"></div>
      <div class="panel"><h3>动态调度</h3><div id="scheduler" class="stack"></div></div>
      <div id="system"></div>
    </section>
    <section data-page="settings" aria-labelledby="settings-title" class="stack" hidden>
      <div><h1 id="settings-title" tabindex="-1">系统设置</h1><p class="muted">查看生效配置。模型、工具与执行策略由服务启动配置和工作流模板管理。</p></div>
      <div class="tabs" aria-label="设置分类">
        <button class="tab" type="button" data-settings="model" aria-pressed="true">模型配置</button>
        <button class="tab" type="button" data-settings="tools" aria-pressed="false">工具权限</button>
        <button class="tab" type="button" data-settings="strategy" aria-pressed="false">执行策略</button>
        <button class="tab" type="button" data-settings="runtime" aria-pressed="false">运行环境</button>
      </div>
      <div id="settings-policy" class="panel stack"><p class="muted small">正在读取系统设置…</p></div>
    </section>
  </main>
</div>
<script>(${dashboard.toString()})();</script>
</body>
</html>`;
