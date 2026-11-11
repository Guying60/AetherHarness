export const CONSOLE_STYLE = /* css */ `
  :root {
    color-scheme: dark;
    --bg: #0b1120; --side: #10192b; --paper: #131e32; --inset: #101a2c;
    --ink: #eff3fc; --muted: #a9b7cf; --line: #283751; --accent: #aab9ff; --radius: 12px;
    font: 14px/1.55 "Segoe UI", "Microsoft YaHei", "PingFang SC", system-ui, sans-serif;
  }
  * { box-sizing: border-box; }
  [hidden], .notice:empty { display: none !important; }
  body { display: grid; grid-template-columns: 218px minmax(0, 1fr); min-height: 100vh; margin: 0; color: var(--ink); background: var(--bg); }
  button, select, textarea, input { font: inherit; }
  button, select, summary { cursor: pointer; }
  button:disabled { cursor: not-allowed; opacity: .55; }
  a { color: inherit; }
  :focus-visible { outline: 2px solid #91a9ff; outline-offset: 3px; }
  h1, h2, h3, h4, p { margin: 0; }
  h1 { font-size: clamp(1.85rem, 3vw, 2.8rem); line-height: 1.18; letter-spacing: -.035em; }
  h2 { font-size: 1.55rem; line-height: 1.25; }
  h3 { font-size: 1.06rem; }
  h4 { font-size: 1rem; }
  small, .small { font-size: .87rem; }
  pre, code, .mono { font-family: Consolas, ui-monospace, monospace; }
  pre { margin: 0; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
  .sidebar { position: sticky; top: 0; display: flex; flex-direction: column; gap: 32px; height: 100vh; padding: 20px 14px; background: var(--side); border-right: 1px solid var(--line); }
  .brand { display: flex; align-items: center; gap: 9px; padding-inline: 6px; text-decoration: none; font-size: 1.22rem; font-weight: 750; letter-spacing: -.035em; }
  .mark { display: grid; place-items: center; flex: 0 0 31px; height: 31px; border-radius: 8px; background: #213759; color: #83e2ff; font-size: 20px; font-weight: 800; }
  .sidebar nav { display: grid; gap: 6px; }
  .sidebar nav a { display: flex; gap: 11px; align-items: center; padding: 10px 12px; border: 1px solid transparent; border-radius: 9px; color: var(--muted); text-decoration: none; white-space: nowrap; font-weight: 600; }
  .sidebar nav a:hover { background: #1c2a45; color: var(--ink); }
  .sidebar nav a[aria-current="page"] { color: #f2f5ff; border-color: #5268b0; background: linear-gradient(110deg, #263968, #2a3d75); box-shadow: inset 2px 0 #93a6ff; }
  .nav-icon { width: 1.15em; text-align: center; font-size: 1.08rem; line-height: 1; }
  .sidebar-footer { margin-top: auto; padding: 12px 6px 0; border-top: 1px solid var(--line); }
  .surface { min-width: 0; }
  .top { min-height: 64px; padding: 11px clamp(18px, 3vw, 38px); border-bottom: 1px solid var(--line); background: #10192a; }
  .top > div { width: min(100%, 1500px); margin: auto; }
  .shell { width: min(1500px, 100%); margin-inline: auto; padding: clamp(18px, 3vw, 38px); }
  .muted { color: var(--muted); }
  .row { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
  .between { justify-content: space-between; }
  .stack { display: grid; gap: 13px; }
  .section-title { display: flex; align-items: end; justify-content: space-between; gap: 14px; margin-bottom: 13px; }
  .section-title p { margin-top: 6px; }
  .workbench-grid, .workspace { display: grid; grid-template-columns: minmax(0, 2.5fr) minmax(235px, 1fr); gap: 15px; align-items: start; }
  .hero { position: relative; isolation: isolate; overflow: hidden; display: grid; align-items: center; min-height: 154px; padding: 24px; border: 1px solid #2c3b61; border-radius: var(--radius); background: radial-gradient(ellipse at 88% 25%, #25376c 0%, #142039 43%, #111b2f 74%); }
  .hero > div:first-child { max-width: 74%; }
  .hero p { max-width: 52ch; margin-top: 10px; color: #bfcee8; }
  .hero-art { position: absolute; z-index: -1; top: 50%; right: 8%; display: grid; place-items: center; width: 118px; height: 95px; color: #b9e4ff; font-size: 80px; line-height: 1; font-weight: 750; text-shadow: 0 0 28px #8274ff, 0 0 11px #61c8ff; transform: translateY(-50%) skew(-7deg); }
  .hero-art::before { content: ''; position: absolute; inset: 31% -18%; border: 1px solid #85a2ff8c; border-radius: 50%; box-shadow: 0 0 25px #717fff65, inset 0 0 22px #6382ff56; transform: rotate(-24deg); }
  .cards, .team, .metrics, .tiers { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .metrics { grid-template-columns: repeat(auto-fit, minmax(min(110px, 100%), 1fr)); }
  .card, .panel { background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius); min-width: 0; padding: 15px; }
  .panel > .stack, .panel > .empty, .panel > .metrics { margin-top: 11px; }
  .scenario { display: flex; flex-direction: column; gap: 8px; }
  .scenario.selected { border-color: #5369a9; }
  .scenario .actions { margin-top: auto; padding-top: 4px; }
  .scenario h3 { overflow-wrap: anywhere; }
  .badge { display: inline-flex; align-items: center; max-width: 100%; padding: 2px 7px; border-radius: 6px; background: #273550; color: #d9e4f8; font-size: .79rem; font-weight: 650; }
  .badge.good { background: #153c38; color: #9af3ce; }
  .badge.active { background: #203e70; color: #b6d9ff; }
  .badge.warn { background: #4a3828; color: #ffdb9b; }
  .badge.bad { background: #4a2b38; color: #ffc1cc; }
  .badge.violet { background: #392b61; color: #ded0ff; }
  .btn, .select { min-height: 36px; padding: 7px 11px; border: 1px solid #405478; border-radius: 8px; background: #1a2843; color: var(--ink); font-size: .88rem; }
  a.btn { display: inline-flex; align-items: center; text-decoration: none; }
  .btn:hover:not(:disabled) { border-color: #7f96d5; background: #233659; }
  .btn.primary { color: #fff; background: #5949cc; border-color: #8577f5; font-weight: 650; }
  .btn.primary:hover:not(:disabled) { background: #6959dc; }
  .btn.danger { color: #ffc1cc; }
  .link { background: none; border: 0; color: var(--accent); font-size: .87rem; font-weight: 600; padding: 6px; }
  .link:hover { text-decoration: underline; }
  .select { max-width: 100%; background: #172440; }
  #project-form { background: linear-gradient(145deg, #192745, #141e33 75%); border-color: #3f5183; }
  #project-goal { width: 100%; resize: vertical; min-height: 90px; }
  .inset { padding: 11px; border: 1px solid var(--line); border-radius: 8px; background: var(--inset); min-width: 0; overflow-wrap: anywhere; }
  .decision { background: #2f2532; border-color: #654c5c; }
  .decision p { margin-top: 6px; }
  .empty { padding: 13px; border: 1px dashed #415678; border-radius: 8px; color: var(--muted); }
  .tabs { display: flex; flex-wrap: wrap; gap: 5px; border-bottom: 1px solid var(--line); margin-bottom: 14px; }
  .tab { padding: 8px 11px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--muted); font-weight: 600; }
  .tab[aria-pressed="true"] { color: #e0e7ff; border-color: #8ca1ff; background: #192849; border-radius: 7px 7px 0 0; }
  .graph-layout { display: grid; grid-template-columns: minmax(126px, .65fr) minmax(0, 2.4fr); gap: 12px; }
  .step-list { display: grid; gap: 6px; align-content: start; }
  .step-list .node { min-height: 0; }
  .graph { min-width: 0; }
  .pipeline-flow { display: grid; justify-items: center; gap: 15px; margin: 12px 0; padding: 13px; border: 1px solid var(--line); border-radius: 10px; background: radial-gradient(circle at 50% 25%, #1b2947, #0c1426 72%); }
  .stage { position: relative; display: grid; grid-template-columns: repeat(var(--branch-count, 1), minmax(0, 1fr)); gap: 8px; width: min(100%, 304px); }
  .stage + .stage::before { content: ''; position: absolute; top: -15px; left: 50%; height: 14px; border-left: 1px solid #6985ba; }
  .graph-node { position: relative; min-width: 0; }
  .stage.fork::before { height: 7px; }
  .stage.merge::before { top: -8px; height: 8px; }
  .stage.fork::after, .stage.merge::after { content: ''; position: absolute; top: -8px; left: calc(25% - 2px); right: calc(25% - 2px); border-top: 1px solid #6985ba; }
  .stage.fork .graph-node::before, .graph-node[data-merge]::after { content: ''; position: absolute; left: 50%; height: 8px; border-left: 1px solid #6985ba; }
  .stage.fork .graph-node::before { top: -8px; }
  .graph-node[data-merge]::after { bottom: -8px; }
  .node { display: grid; align-content: start; gap: 4px; width: 100%; min-width: 0; padding: 7px 8px; border: 1px solid #3c5178; border-radius: 7px; background: #1b2b49; text-align: left; color: var(--ink); font-size: .83rem; overflow-wrap: anywhere; }
  .node[data-state="running"] { border-color: #809cf1; background: #263d69; }
  .node[data-state="completed"] { border-color: #3b735f; }
  .node[data-state="failed"], .node[data-state="needs_human"] { border-color: #885966; }
  .node[aria-pressed="true"] { outline: 2px solid #9eaeff; outline-offset: 1px; }
  .node .badge { justify-self: start; padding: 1px 5px; font-size: .74rem; }
  .subnodes { display: flex; gap: 7px; margin-top: 6px; flex-wrap: wrap; }
  .subnodes .node { width: auto; flex: 1 1 100px; }
  .inspector { padding: 10px 11px; border-left: 3px solid #7890e3; background: #17243d; border-radius: 4px 8px 8px 4px; overflow-wrap: anywhere; }
  .inspector p + p { margin-top: 5px; }
  .round > summary, .agent > summary { font-weight: 650; }
  .agent > summary { position: relative; list-style: none; padding-right: 18px; }
  .agent > summary::-webkit-details-marker { display: none; }
  .agent > summary::after { content: '›'; position: absolute; top: 3px; right: 2px; font-size: 1.2rem; color: var(--accent); }
  .agent[open] > summary::after { transform: rotate(90deg); }
  .round[open] > summary, .agent[open] > summary { margin-bottom: 9px; }
  .codeblock { padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: #0b1324; color: #dce7ff; font-size: .85rem; max-height: 390px; }
  .added { color: #96ecc0; } .removed { color: #ffafbb; }
  .plain-list, .log { padding: 0; margin: 0; list-style: none; }
  .log { max-height: 510px; overflow: auto; }
  .log li, .record-list li { padding: 8px 0; border-bottom: 1px solid var(--line); overflow-wrap: anywhere; }
  .log time { margin-right: 7px; }
  .record-list li:last-child { border-bottom: 0; }
  .record-list a { text-decoration: none; }
  .record-list a:hover { color: var(--accent); text-decoration: underline; }
  .metric strong { display: block; font-size: 1.32rem; font-variant-numeric: tabular-nums; }
  .agent progress { width: 100%; height: 8px; accent-color: #8b9fff; }
  .agent p, .agent ul { margin-top: 7px; }
  .agent-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .agent-icon { display: inline-grid; place-items: center; flex: 0 0 29px; height: 29px; border-radius: 8px; color: #e0e5ff; background: #303c71; }
  .policy-list { margin: 0; padding-left: 20px; }
  .notice { padding: 9px 12px; margin-bottom: 12px; border-radius: 8px; background: #213761; color: #deebff; }
  .notice[data-error="true"] { background: #4a2b38; color: #ffc1cc; }
  .run-head { margin-bottom: 12px; }
  .run-head h1 { font-size: clamp(1.6rem, 3vw, 2.35rem); }
  .run-head select { max-width: min(320px, 78vw); }
  @media (max-width: 1160px) { body { grid-template-columns: 183px minmax(0, 1fr); } .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 930px) { .workspace, .workbench-grid { grid-template-columns: 1fr; } .cards { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (max-width: 720px) {
    body { display: block; }
    .sidebar { position: static; height: auto; padding: 11px 13px; gap: 10px; border: 0; border-bottom: 1px solid var(--line); }
    .sidebar nav { display: flex; overflow-x: auto; padding: 3px; margin: 0 -3px; }
    .sidebar nav a { padding: 7px 8px; gap: 5px; font-size: .87rem; }
    .sidebar-footer { display: none; }
    .hero > div:first-child { max-width: 100%; }
    .hero-art { opacity: .2; right: 5%; }
    .cards, .team, .tiers { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .section-title { align-items: start; flex-direction: column; }
  }
  @media (max-width: 430px) {
    .sidebar nav { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 3px; overflow: visible; }
    .sidebar nav a { justify-content: center; padding: 6px 1px; font-size: .79rem; }
    .sidebar .nav-icon { display: none; }
    .cards, .team, .tiers { grid-template-columns: 1fr; }
    .graph-layout { grid-template-columns: 1fr; }
    .step-column { display: none; }
    .hero { min-height: 130px; padding: 15px; }
  }
`;
