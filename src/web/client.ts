import { dashboard } from './dashboard.js';

export const DASHBOARD_HTML = /* html */ `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AetherHarness · Agent 编排工作台</title>
<style>
  :root {
    color-scheme: light;
    --bg: #f2f5f2; --paper: #fff; --ink: #172922; --muted: #52665d;
    --line: #dbe4de; --accent: #166348; --mint: #dff4e5; --radius: 16px;
    font-family: "Segoe UI", "Microsoft YaHei", "PingFang SC", system-ui, sans-serif;
    font-size: 15px; line-height: 1.55;
  }
  * { box-sizing: border-box; }
  body { margin: 0; color: var(--ink); background: var(--bg); }
  button, select, textarea, input { font: inherit; }
  button, select, summary { cursor: pointer; }
  button:disabled { cursor: wait; opacity: .63; }
  a { color: inherit; }
  button:focus-visible, a:focus-visible, select:focus-visible, textarea:focus-visible, input:focus-visible, summary:focus-visible { outline: 3px solid #389173; outline-offset: 3px; }
  h1, h2, h3, h4, p { margin: 0; }
  h1 { font-size: clamp(1.95rem, 4vw, 3.2rem); letter-spacing: -.04em; line-height: 1.14; }
  h2 { font-size: 1.48rem; letter-spacing: -.025em; }
  h3 { font-size: 1.1rem; }
  h4 { font-size: 1rem; }
  small, .small { font-size: .84rem; }
  pre, code, .mono { font-family: Consolas, ui-monospace, monospace; }
  pre { margin: 0; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
  .shell { width: min(1320px, calc(100% - 64px)); margin-inline: auto; }
  .top { background: var(--paper); border-bottom: 1px solid var(--line); }
  .top .shell { min-height: 66px; display: flex; align-items: center; justify-content: space-between; gap: 18px; }
  .brand { display: flex; align-items: center; gap: 10px; text-decoration: none; font-weight: 750; font-size: 1.14rem; }
  .mark { display: grid; place-items: center; color: #c8f6d6; background: #113b2c; width: 32px; height: 32px; border-radius: 9px; }
  .top nav { display: flex; gap: 24px; color: var(--muted); font-size: .88rem; }
  .top nav a { text-decoration: none; }
  .top nav a:hover, .link:hover { text-decoration: underline; }
  main { padding-block: 24px 44px; }
  section[id] { scroll-margin-top: 18px; }
  .hero { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(230px, .85fr); gap: 30px; align-items: center; padding: clamp(22px, 4vw, 46px); border-radius: 22px; color: #f3fff7; background: radial-gradient(ellipse at 100% 0%, #236349 0%, #143a2e 48%, #102d25 100%); }
  .hero .eyebrow { color: #a4dfb6; margin-bottom: 12px; }
  .hero p { color: #d0e5d8; margin-top: 12px; max-width: 54ch; }
  .hero-aside { display: grid; gap: 8px; padding: 15px 18px; background: #0c271e65; border: 1px solid #9bd4af49; border-radius: 15px; }
  .hero-aside li { display: flex; align-items: center; gap: 10px; color: #e3f3e8; font-size: .91rem; }
  .hero-aside b { font-family: Consolas, monospace; font-weight: 400; color: #b8eac6; border: 1px solid #a4dfb65c; border-radius: 6px; padding: 0 5px; }
  .eyebrow { display: block; color: var(--accent); font-weight: 750; font-size: .75rem; letter-spacing: .08em; }
  .muted { color: var(--muted); }
  .section-title { display: flex; align-items: end; justify-content: space-between; gap: 14px; margin: 26px 0 12px; }
  .section-title p { margin-top: 3px; }
  .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .between { justify-content: space-between; }
  .stack { display: grid; gap: 12px; }
  .cards, .team, .metrics, .tiers { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .card, .panel { background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius); min-width: 0; }
  .card { padding: 16px; }
  .scenario { display: flex; flex-direction: column; gap: 9px; }
  .scenario.selected { border-color: #61a585; box-shadow: inset 0 3px #52a27a; }
  .scenario .actions { margin-top: auto; padding-top: 4px; }
  .badge { display: inline-flex; align-items: center; max-width: 100%; padding: 3px 8px; border-radius: 6px; background: #ecf0ee; color: #465950; font-size: .78rem; font-weight: 650; }
  .badge.good { background: #dff4e5; color: #176344; }
  .badge.active { background: #deebfc; color: #174c88; }
  .badge.warn { background: #fff0d1; color: #794a0d; }
  .badge.bad { background: #ffe7e3; color: #8c362d; }
  .badge.violet { background: #ece6fb; color: #634398; }
  .btn, .select { min-height: 36px; padding: 6px 12px; background: var(--paper); border: 1px solid #bdcec3; border-radius: 8px; color: var(--ink); font-size: .86rem; font-weight: 650; }
  a.btn { display: inline-flex; align-items: center; text-decoration: none; }
  .btn:hover:not(:disabled) { border-color: #5d8b73; background: #eef7f0; }
  .btn.primary { color: #fff; background: #176348; border-color: #176348; }
  .btn.primary:hover:not(:disabled) { background: #124e38; }
  .btn.danger { color: #8c362d; }
  .link { background: none; border: 0; color: var(--accent); font-size: .85rem; font-weight: 650; padding: 6px; }
  .workspace { display: grid; grid-template-columns: minmax(0, 2.25fr) minmax(260px, 1fr); gap: 12px; align-items: start; }
  .panel { padding: 17px; }
  #project-form { margin-top: 12px; }
  #project-goal { width: 100%; resize: vertical; font-weight: 400; }
  .panel > .stack, .panel > .empty, .panel > .metrics, .panel > .team { margin-top: 12px; }
  .pipeline-flow { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 15px; align-items: center; margin: 15px 0; padding: 13px 11px; border-radius: 11px; background: #f3f7f4; }
  .stage { position: relative; display: grid; gap: 6px; min-width: 0; }
  .stage + .stage::before { content: '›'; position: absolute; left: -13px; top: 50%; transform: translateY(-50%); color: #5c7a69; font-size: 1.2rem; }
  .node { display: grid; gap: 4px; width: 100%; padding: 7px; min-height: 63px; background: #fff; border: 1px solid #cfddd4; border-radius: 8px; text-align: left; color: var(--ink); font-size: .81rem; overflow-wrap: anywhere; }
  .node[aria-pressed="true"] { outline: 2px solid #388767; outline-offset: 1px; }
  .node .badge { justify-self: start; padding: 1px 5px; font-size: .73rem; }
  .subnodes { display: flex; gap: 7px; margin-top: 6px; flex-wrap: wrap; }
  .subnodes .node { width: auto; flex: 1 1 135px; }
  .inspector { padding: 10px 12px; border-left: 3px solid #64a585; background: #f3f7f4; border-radius: 3px 8px 8px 3px; margin-top: 13px; overflow-wrap: anywhere; }
  .inspector p + p { margin-top: 5px; }
  .inset { padding: 12px; border: 1px solid var(--line); border-radius: 10px; background: #f7faf8; min-width: 0; overflow-wrap: anywhere; }
  .decision { background: #fffbef; border-color: #edd7a8; }
  .decision p, .decision .row { margin-top: 8px; }
  .empty { padding: 15px; border: 1px dashed #bfcfc5; border-radius: 9px; color: var(--muted); }
  .evidence { margin-top: 12px; }
  .tabs { border-bottom: 1px solid var(--line); margin: 10px 0 13px; }
  .tab { padding: 7px 10px; color: var(--muted); background: none; border: 0; border-bottom: 2px solid transparent; font-size: .9rem; font-weight: 650; }
  .tab[aria-pressed="true"] { color: var(--accent); border-color: var(--accent); }
  .round > summary, .agent > summary { font-weight: 650; }
  .round[open] > summary, .agent[open] > summary { margin-bottom: 10px; }
  .round > .stack { margin-top: 7px; }
  .codeblock { padding: 12px; border-radius: 9px; background: #132a22; color: #e6f4e9; font-size: .83rem; max-height: 330px; }
  .added { color: #a5f3bb; } .removed { color: #ffb6ac; }
  .log { padding: 0; margin: 0; list-style: none; max-height: 330px; overflow: auto; }
  .log li { padding: 6px 0; border-bottom: 1px solid var(--line); overflow-wrap: anywhere; }
  .log time { margin-right: 7px; }
  .metric strong { display: block; font-size: 1.28rem; font-variant-numeric: tabular-nums; }
  .metrics { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .team { margin-top: 12px; }
  .agent progress { width: 100%; height: 8px; accent-color: var(--accent); }
  .agent p, .agent ul { margin-top: 7px; }
  .agent .link { padding-left: 0; }
  .policy-list { margin: 0; padding-left: 20px; }
  .plain-list { padding: 0; margin: 0; list-style: none; }
  .notice { padding: 10px 13px; margin-top: 12px; border-radius: 8px; background: #deebfc; color: #174c88; }
  .notice:empty, [hidden] { display: none; }
  .notice[data-error="true"] { background: #ffe7e3; color: #8c362d; }
  .footer { border-top: 1px solid var(--line); padding-top: 16px; margin-top: 24px; }
  @media (max-width: 990px) { .workspace { grid-template-columns: 1fr; } }
  @media (max-width: 720px) {
    .shell { width: calc(100% - 28px); }
    .top nav { display: none; }
    .hero { grid-template-columns: 1fr; gap: 14px; }
    .hero-aside { grid-template-columns: 1fr 1fr; }
    .cards, .team, .tiers { grid-template-columns: 1fr; }
    .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .section-title { align-items: start; flex-direction: column; }
  }
  @media (max-width: 560px) {
    .pipeline-flow { grid-auto-flow: row; gap: 14px; }
    .stage { grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); }
    .stage + .stage::before { content: '⌄'; top: -17px; left: 50%; transform: translateX(-50%); }
    .node { min-height: 46px; }
  }
</style>
</head>
<body>
<header class="top">
  <div class="shell">
    <a class="brand" href="/"><span class="mark" aria-hidden="true">◈</span>AetherHarness</a>
    <nav aria-label="工作台导航"><a href="#scenarios">选择案例</a><a href="#execution">运行详情</a><a href="#team-title">Agent 中心</a><a href="#settings">系统设置</a></nav>
    <span id="connection" class="badge" role="status">正在连接</span>
  </div>
</header>
<main id="top" class="shell">
  <section class="hero" aria-labelledby="heading">
    <div>
      <span class="eyebrow">赛题 01 · AGENT 编排创新应用</span>
      <h1 id="heading">多 Agent 协作修复限流器</h1>
      <p>选择一个工程案例，观察需求分析、开发与审查 Agent 如何协作。每轮验证都有记录，达到交付条件时可下载 Git 补丁。</p>
    </div>
    <ol class="hero-aside plain-list" aria-label="演示路径">
      <li><b>01</b> 选择工程案例</li><li><b>02</b> 观察工作流调度</li>
      <li><b>03</b> 检查验证和修复过程</li><li><b>04</b> 获取补丁或处理阻塞</li>
    </ol>
  </section>
  <section id="scenarios" aria-labelledby="scenarios-title">
    <div class="section-title">
      <div><span class="eyebrow">01 / 场景</span><h2 id="scenarios-title">选择一个案例运行</h2><p id="mode" class="muted small">正在获取推理模式…</p></div>
      <button id="run-all" class="btn" type="button" disabled>并发运行全部案例</button>
    </div>
    <div id="scenario-cards" class="cards"><p class="empty">正在加载可运行的案例…</p></div>
    <form id="project-form" class="panel stack" aria-labelledby="project-title">
      <h3 id="project-title">仓库修复任务</h3>
      <p id="project-status" class="muted small">正在获取仓库配置…</p>
      <p class="muted small">运行仅验证限流器固定测试套件。目标文件会发送给已配置的模型端点。</p>
      <label for="project-goal">任务描述</label>
      <textarea id="project-goal" class="select" rows="3" maxlength="2000" required disabled
        placeholder="例如：修复限流器的无效容量和令牌参数校验。"></textarea>
      <div class="row"><button id="project-submit" class="btn primary" type="submit" disabled>创建仓库任务</button></div>
    </form>
    <p id="notice" class="notice" role="status"></p>
  </section>
  <section id="execution" aria-labelledby="execution-title">
    <div class="section-title">
      <div><span class="eyebrow">02 / 执行</span><h2 id="execution-title" tabindex="-1">工作流与运行证据</h2></div>
      <label class="row small">运行历史 <select id="run-history" class="select" disabled><option>暂无运行</option></select></label>
    </div>
    <div class="workspace">
      <div class="panel">
        <div class="row between"><h3>工作流编排</h3><span id="workflow-version" class="mono muted small"></span></div>
        <div id="pipeline-flow" class="pipeline-flow"><p class="muted small">正在加载工作流…</p></div>
        <div id="node-inspector"></div>
      </div>
      <aside class="panel" aria-labelledby="run-title">
        <h3 id="run-title">运行摘要</h3>
        <div id="run-summary" class="stack"><p class="muted small">案例运行后，这里会显示验证结果和下一步操作。</p></div>
      </aside>
    </div>
    <div class="panel evidence">
      <h3>运行证据</h3>
      <div class="tabs row" aria-label="运行证据视图">
        <button class="tab" type="button" data-tab="verification" aria-pressed="true" aria-controls="evidence">验证与自愈</button>
        <button class="tab" type="button" data-tab="artifact" aria-pressed="false" aria-controls="evidence">代码与补丁</button>
        <button class="tab" type="button" data-tab="events" aria-pressed="false" aria-controls="evidence">执行日志</button>
      </div>
      <div id="evidence"><p class="empty">启动案例后可查看逐轮验证、诊断和产物。</p></div>
    </div>
  </section>
  <section id="operations" aria-labelledby="operations-title">
    <div class="section-title">
      <div><span class="eyebrow">03 / 运行监控</span><h2 id="operations-title">团队、调度与工具</h2><p class="muted small">这里的指标汇总当前服务进程内的全部运行。</p></div>
    </div>
    <div class="panel">
      <h3>动态调度</h3>
      <div id="scheduler" class="stack"><p class="muted small">正在获取调度数据…</p></div>
    </div>
    <h3 id="team-title" style="margin-top:16px">Agent 中心</h3>
    <div id="team" class="team" aria-labelledby="team-title"></div>
    <div id="system" class="stack" style="margin-top:12px"></div>
  </section>
  <section id="settings" aria-labelledby="settings-title">
    <div class="section-title"><div><h2 id="settings-title">系统设置</h2><p class="muted small">当前生效的配置。模型和仓库由服务启动参数配置。</p></div></div>
    <div id="settings-policy" class="panel stack"><p class="muted small">正在读取系统设置…</p></div>
  </section>
  <footer id="storage-status" class="footer muted small">正在读取运行存储状态…</footer>
</main>
<script>(${dashboard.toString()})();</script>
</body>
</html>`;
