/**
 * AetherHarness console — light design system.
 *
 * One stylesheet for every server-rendered page (workbench, execution,
 * delivery, agent view, settings, studio). Injected as a string so the console
 * keeps a zero-build CSS path.
 *
 * Source of truth: `design/console-20261117` (Figma frame 1280×1627).
 * Palette is Tailwind Slate + Indigo; spacing/type sizes are the design's own.
 * Icons: `src/web/icons.ts` (generated from the same export).
 *
 * Naming: `.sidebar`/`.topbar`/`.shell` = chrome; `.card`/`.panel`/`.inset` =
 * surfaces; `.badge`/`.btn`/`.select`/`.pill` = controls; `.node`/
 * `.pipeline-flow` = workflow visuals.
 */

export const CONSOLE_STYLE = /* css */ `
  /* ---------------------------------------------------------------- tokens */
  :root {
    color-scheme: light;

    --bg: #f8fafc;
    --surface: #ffffff;
    --side: #ffffff;
    --sunken: #f8fafc;
    --hover: #f1f5f9;
    /* legacy aliases still referenced by flow-editor.css */
    --paper: var(--surface);
    --inset: var(--sunken);

    --ink: #0f172a;
    --ink-2: #334155;
    --ink-3: #475569;
    --muted: #64748b;
    --faint: #94a3b8;

    --line: #e2e8f0;
    --line-2: #cbd5e1;
    --line-3: #f1f5f9;

    --accent: #4338ca;
    --accent-2: #4f46e5;
    --accent-deep: #2a14b4;
    --accent-50: #eef2ff;
    --accent-100: #e0e7ff;
    --accent-200: #c7d2fe;

    --ok: #059669;
    --ok-2: #10b981;
    --ok-50: #ecfdf5;
    --ok-100: #a7f3d0;
    --ok-700: #065f46;
    --warn: #f59e0b;
    --warn-50: #fffbeb;
    --warn-100: #fde68a;
    --warn-700: #92400e;
    --bad: #ef4444;
    --bad-50: #fef2f2;
    --bad-100: #fecaca;
    --bad-700: #991b1b;
    --info: #3b82f6;
    --info-50: #eff6ff;
    --info-100: #bfdbfe;
    --info-700: #1e40af;

    --radius: 12px;
    --radius-sm: 8px;
    --radius-xs: 6px;
    --shadow: 0 1px 3px rgba(15, 23, 42, .05);
    --shadow-sm: 0 1px 2px rgba(15, 23, 42, .05);

    --font: "Inter", "WenQuanYi Zen Hei", "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, "Segoe UI", sans-serif;
    --mono: "JetBrains Mono", "Liberation Mono", ui-monospace, Consolas, "Cascadia Code", monospace;

    font: 13px/1.5 var(--font);
    color: var(--ink);
    background: var(--bg);
    -webkit-font-smoothing: antialiased;
  }

  /* ----------------------------------------------------------------- reset */
  *, *::before, *::after { box-sizing: border-box; }
  [hidden], .notice:empty { display: none !important; }
  body { display: grid; grid-template-columns: 240px minmax(0, 1fr); min-height: 100vh; margin: 0; background: var(--bg); color: var(--ink); }
  button, select, textarea, input { font: inherit; color: inherit; }
  button, select, summary { cursor: pointer; }
  button:disabled { cursor: not-allowed; opacity: .55; }
  a { color: inherit; }
  :focus-visible { outline: 2px solid var(--accent-2); outline-offset: 2px; border-radius: 4px; }
  h1, h2, h3, h4, p { margin: 0; }
  h1 { font-size: 26px; line-height: 1.5; font-weight: 700; letter-spacing: -.65px; }
  h2 { font-size: 16px; line-height: 1.5; font-weight: 600; }
  h3, h4 { font-size: 15px; line-height: 1.5; font-weight: 600; }
  small, .small { font-size: 12px; }
  code, .mono, pre { font-family: var(--mono); }
  pre { margin: 0; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; line-height: 1.6; }
  .ico-wrap { display: inline-flex; flex: 0 0 auto; align-items: center; justify-content: center; }
  .ico-wrap .ico { display: block; width: 1em; height: 1em; }
  .muted { color: var(--muted); }
  .faint { color: var(--faint); }
  .row { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
  .between { justify-content: space-between; }
  .stack { display: grid; gap: 13px; }
  .grow { flex: 1 1 auto; min-width: 0; }

  /* ---------------------------------------------------------------- chrome */
  .sidebar {
    position: sticky; top: 0; z-index: 30;
    display: flex; flex-direction: column; height: 100vh;
    background: var(--side); border-right: 1px solid var(--line);
  }
  .sidebar-head { flex: 0 0 56px; border-bottom: 1px solid var(--line); }
  .sidebar nav { display: grid; gap: 4px; padding: 12px; }
  .sidebar nav a {
    display: flex; align-items: center; gap: 12px;
    min-height: 36px; padding: 8px 12px;
    border: 1px solid transparent; border-radius: 4px;
    color: var(--muted); font-size: 13px; font-weight: 400; text-decoration: none;
    white-space: nowrap; overflow: hidden;
  }
  .sidebar nav a .ico-wrap { font-size: 15px; color: var(--muted); }
  .sidebar nav a:hover { background: var(--hover); color: var(--ink); }
  .sidebar nav a:hover .ico-wrap { color: var(--ink-2); }
  .sidebar nav a[aria-current="page"] { background: var(--accent-50); border-color: var(--accent); color: var(--accent); font-weight: 500; }
  .sidebar nav a[aria-current="page"] .ico-wrap { color: var(--accent); }
  .sidebar-foot { margin-top: auto; display: grid; gap: 8px; padding: 12px; border-top: 1px solid var(--line); }
  .runtime-card { display: grid; gap: 6px; padding: 10px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--sunken); }
  .runtime-card dl { display: grid; gap: 6px; margin: 0; }
  .runtime-card .row { justify-content: space-between; gap: 6px; }
  .runtime-card dt { display: flex; align-items: center; gap: 6px; margin: 0; color: var(--ink-3); font-size: 11px; font-weight: 400; }
  .runtime-card dd { margin: 0; color: var(--ink); font: 600 11px/1.5 var(--mono); font-variant-numeric: tabular-nums; }
  .sidebar-note { padding: 0 2px; color: var(--faint); font-size: 11px; line-height: 1.5; }

  .surface { display: flex; flex-direction: column; min-width: 0; }
  .topbar {
    position: sticky; top: 0; z-index: 25;
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    height: 56px; padding: 0 24px;
    background: rgba(255, 255, 255, .92); backdrop-filter: blur(24px);
    border-bottom: 1px solid var(--line); box-shadow: 0 1px 2px rgba(15, 23, 42, .03);
  }
  .crumbs { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .crumbs .root { color: var(--muted); font-size: 13px; }
  .crumbs .sep { display: inline-flex; color: var(--faint); font-size: 10px; }
  .crumbs strong { color: var(--ink); font-size: 13px; font-weight: 600; }
  .top-actions { display: flex; align-items: center; gap: 12px; }

  .conn { display: inline-flex; align-items: center; gap: 8px; padding: 4px 10px; border: 1px solid var(--ok-100); border-radius: 999px; background: var(--ok-50); color: var(--ok-700); font-size: 11px; font-weight: 500; white-space: nowrap; }
  .conn.warn { border-color: var(--warn-100); background: var(--warn-50); color: var(--warn-700); }
  .conn.bad { border-color: var(--bad-100); background: var(--bad-50); color: var(--bad-700); }
  .account { display: inline-flex; align-items: center; gap: 8px; padding: 4px 10px; border: 1px solid var(--line); border-radius: 999px; background: var(--hover); color: var(--ink-2); font: 500 11px/1.5 var(--mono); white-space: nowrap; }
  .account .ico-wrap { font-size: 20px; }
  .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; border: 1px solid var(--accent-200); border-radius: 999px; background: var(--accent-2); color: #fff; font-size: 12px; text-decoration: none; }
  .icon-btn:hover { background: var(--accent); }
  .signout { display: inline-flex; align-items: center; gap: 4px; padding: 6px 10px; border: 0; border-radius: 4px; background: none; color: var(--muted); font-size: 13px; }
  .signout:hover { background: var(--hover); color: var(--ink); }
  .signout .ico-wrap { font-size: 12px; }

  .shell { width: 100%; padding: 24px 24px 40px; }
  .page { display: grid; gap: 24px; max-width: 1180px; margin: 0 auto; }

  /* ----------------------------------------------------------- page header */
  .page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
  .page-head .lede { display: grid; gap: 4px; }
  .eyebrow-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .eyebrow { padding: 2px 8px; border: 1px solid var(--accent-100); border-radius: 4px; background: var(--accent-50); color: var(--accent); font: 600 11px/1.5 var(--mono); letter-spacing: .55px; }
  .live { display: inline-flex; align-items: center; gap: 6px; color: var(--ok); font-size: 11px; font-weight: 500; }
  .live.warn { color: var(--warn-700); }
  .live.bad { color: var(--bad-700); }
  .dot { flex: 0 0 auto; width: 6px; height: 6px; border-radius: 999px; background: currentColor; }
  .dot.lg { width: 8px; height: 8px; }
  .page-head h1 { margin-top: 6px; }
  .page-head .sub { color: var(--muted); font-size: 13px; }
  .page-actions { display: flex; align-items: center; gap: 8px; padding-top: 6px; }
  .mode-pill { flex: 0 0 auto; padding: 2px 8px; border: 1px solid var(--line); border-radius: 999px; background: var(--hover); color: var(--ink-3); font-size: 11px; font-weight: 500; white-space: nowrap; }
  .mode-pill.live { border-color: var(--accent-100); background: var(--accent-50); color: var(--accent); }

  /* ------------------------------------------------------------- controls */
  .btn, .select {
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    min-height: 34px; padding: 6px 12px;
    border: 1px solid var(--line); border-radius: var(--radius-sm);
    background: var(--surface); color: var(--ink-2);
    font-size: 13px; font-weight: 500; text-decoration: none;
    box-shadow: var(--shadow-sm);
  }
  .btn:hover:not(:disabled) { border-color: var(--line-2); background: var(--bg); }
  .btn .ico-wrap { font-size: 11px; color: var(--muted); }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .btn.primary .ico-wrap { color: #fff; }
  .btn.primary:hover:not(:disabled) { background: var(--accent-2); border-color: var(--accent-2); }
  .btn.ghost { background: var(--hover); border-color: var(--line); color: var(--ink-3); box-shadow: none; }
  .btn.ghost:hover:not(:disabled) { background: #e9eef6; }
  .btn.danger { border-color: var(--bad-100); background: var(--bad-50); color: var(--bad-700); box-shadow: none; }
  .draft-dialog { width: min(440px, calc(100vw - 32px)); padding: 20px; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); }
  .draft-dialog::backdrop { background: rgba(15, 23, 42, .32); }
  .draft-dialog form, .draft-dialog label { display: grid; gap: 10px; }
  .draft-dialog p { color: var(--muted); overflow-wrap: anywhere; }
  .draft-dialog-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 6px; }
  .btn.sm { min-height: 28px; padding: 4px 12px; border-radius: var(--radius-xs); font-size: 12px; }
  .btn.block { width: 100%; }
  a.btn { display: inline-flex; }
  .link { padding: 4px; border: 0; background: none; color: var(--accent); font-size: 12px; font-weight: 500; text-decoration: none; }
  .link:hover { text-decoration: underline; }
  .select { display: block; width: 100%; justify-content: flex-start; background: var(--sunken); border-color: var(--line-2); color: var(--ink); font-weight: 400; text-align: left; box-shadow: none; }
  select.select { padding-right: 32px; }
  textarea.select { min-height: 90px; padding: 12px; line-height: 1.85; resize: vertical; }
  .select::placeholder, textarea::placeholder { color: var(--faint); }
  .field { display: grid; gap: 6px; }
  .field > label, .label { display: flex; align-items: center; gap: 4px; color: var(--ink-3); font-size: 12px; font-weight: 500; }
  .label .ico-wrap { font-size: 12px; color: var(--muted); }

  /* ------------------------------------------------------------- surfaces */
  .card, .panel { min-width: 0; padding: 20px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); }
  .panel > h3 + * { margin-top: 11px; }
  .inset { min-width: 0; padding: 11px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--sunken); overflow-wrap: anywhere; }
  .badge { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; padding: 2px 8px; border: 1px solid var(--line); border-radius: 999px; background: var(--hover); color: var(--muted); font-size: 11px; font-weight: 500; }
  .badge.good { background: var(--ok-50); border-color: var(--ok-100); color: var(--ok-700); }
  .badge.active { background: var(--info-50); border-color: var(--info-100); color: var(--info-700); }
  .badge.warn { background: var(--warn-50); border-color: var(--warn-100); color: var(--warn-700); }
  .badge.bad { background: var(--bad-50); border-color: var(--bad-100); color: var(--bad-700); }
  .badge.violet { background: var(--accent-50); border-color: var(--accent-200); color: var(--accent); }
  .notice { margin-bottom: 12px; padding: 9px 12px; border: 1px solid var(--info-100); border-radius: var(--radius-sm); background: var(--info-50); color: var(--info-700); }
  .notice[data-error="true"] { border-color: var(--bad-100); background: var(--bad-50); color: var(--bad-700); }
  .empty { padding: 14px; border: 1px dashed var(--line-2); border-radius: var(--radius-sm); color: var(--muted); font-size: 12px; }
  .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 10px; }
  .metric { padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--sunken); }
  .metric span { display: block; color: var(--muted); font-size: 11px; }
  .metric strong { display: block; margin-top: 2px; font: 600 13px/1.5 var(--mono); font-variant-numeric: tabular-nums; }
  .section-title { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; margin-bottom: 12px; flex-wrap: wrap; }

  /* ------------------------------------------------------- workbench: repo */
  .card-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .card-head .title { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .card-head .title .ico-wrap { font-size: 28px; }
  .repo-body { display: grid; grid-template-columns: minmax(220px, 306px) minmax(0, 1fr); gap: 16px; padding-top: 4px; }
  .repo-col { display: grid; gap: 6px; align-content: start; }
  .repo-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 2px 4px 0; color: var(--muted); font: 400 11px/1.5 var(--mono); }
  .repo-meta.tight { padding: 0; }
  .repo-meta .ok { color: var(--ok); font-weight: 600; }
  .repo-select-wrap { position: relative; }
  .repo-select-wrap .lead { position: absolute; z-index: 1; top: 50%; left: 12px; transform: translateY(-50%); color: var(--ink-3); font-size: 18px; pointer-events: none; }
  .repo-select-wrap .caret { position: absolute; top: 50%; right: 12px; transform: translateY(-50%); color: var(--muted); font-size: 9px; pointer-events: none; }
  .repo-select {
    appearance: none; -webkit-appearance: none;
    min-height: 40px; padding: 8px 32px 8px 38px;
    border: 1px solid var(--line-2); border-radius: var(--radius-sm); background: var(--sunken);
    color: var(--ink); font: 400 12px/1.5 var(--mono); white-space: nowrap;
  }
  .prompt-field { position: relative; }
  .prompt-field textarea { min-height: 130px; padding-bottom: 48px; }
  .prompt-actions { position: absolute; right: 12px; bottom: 12px; display: flex; gap: 8px; }
  .prompt-actions .btn { min-height: 27px; box-shadow: var(--shadow-sm); }

  /* ----------------------------------------------------- workbench: presets */
  .preset-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
  .preset { display: flex; flex-direction: column; gap: 16px; min-width: 0; padding: 20px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); }
  .preset.featured { border-color: var(--accent-200); box-shadow: 0 0 0 1px var(--accent-200), 0 12px 28px -16px rgba(67, 56, 202, .55); }
  .preset-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .preset-id { display: inline-flex; align-items: center; gap: 8px; color: var(--ok); font: 600 13px/1.5 var(--mono); }
  .preset-id .dot { width: 8px; height: 8px; }
  .preset.featured .preset-id { color: var(--accent); }
  .preset[data-task="rl-hard"] .preset-id { color: #d97706; }
  .preset-body { display: grid; gap: 5px; }
  .preset-body p { color: var(--muted); font-size: 13px; line-height: 1.63; }
  .preset-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--sunken); }
  .preset-metrics dt { color: var(--muted); font-size: 11px; }
  .preset-metrics dd { margin: 2px 0 0; color: var(--ink); font: 600 13px/1.5 var(--mono); font-variant-numeric: tabular-nums; }
  .preset-metrics dd.ok { color: var(--ok); }
  .preset-metrics dd.accent { color: var(--accent); }
  .preset-metrics dd.warn { color: #d97706; }
  .preset-actions { display: flex; gap: 8px; margin-top: auto; }
  .preset-actions .btn { flex: 1 1 0; min-width: 0; border-radius: var(--radius-sm); font-size: 12px; }

  /* -------------------------------------------------------- workbench: kpi */
  .kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
  .kpi { display: grid; gap: 12px; min-width: 0; padding: 16px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); }
  .kpi-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .kpi-top > span:first-child { color: var(--muted); font-size: 12px; font-weight: 500; }
  .kpi-top .ico-wrap { color: var(--faint); font-size: 13px; }
  .kpi-value { display: flex; align-items: baseline; gap: 10px; min-width: 0; flex-wrap: wrap; }
  .kpi-value b { font: 700 28px/1 var(--mono); font-variant-numeric: tabular-nums; letter-spacing: -.5px; }
  .kpi-value em { color: var(--muted); font: 400 11px/1.5 var(--mono); font-style: normal; }
  .kpi-value em.ok { color: var(--ok); font-weight: 500; }
  .kpi.ok .kpi-value b { color: var(--ok); }
  .kpi.accent .kpi-value b { color: var(--accent); }
  .delta { display: inline-flex; align-items: center; gap: 2px; color: var(--ok); font: 600 11px/1.5 var(--mono); }
  .delta .ico-wrap { font-size: 9px; }

  /* ------------------------------------------------------ workbench: runs */
  .runs-card { display: grid; gap: 16px; }
  .segmented { display: inline-flex; align-items: center; padding: 4px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--hover); }
  .segmented button { display: inline-flex; align-items: center; gap: 4px; padding: 4px 12px; border: 0; border-radius: var(--radius-xs); background: none; color: var(--muted); font-size: 12px; }
  .segmented button b { font: 600 11px/1.5 var(--mono); }
  .segmented button[aria-pressed="true"] { background: var(--surface); color: var(--ink); font-weight: 600; box-shadow: var(--shadow-sm); }
  .segmented button[aria-pressed="true"] b { color: var(--accent); }
  .segmented button.pending b { color: var(--ok); }
  .table-wrap { overflow-x: auto; margin: 0 -20px; padding: 0 20px; }
  .runs-table { width: 100%; min-width: 840px; border-collapse: separate; border-spacing: 0; }
  .runs-table th { padding: 10px 16px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); background: var(--sunken); color: var(--muted); font-size: 12px; font-weight: 500; text-align: left; white-space: nowrap; }
  .runs-table th:first-child { border-left: 1px solid var(--line); border-top-left-radius: var(--radius-sm); }
  .runs-table th:last-child { border-right: 1px solid var(--line); border-top-right-radius: var(--radius-sm); text-align: right; }
  .runs-table td { padding: 15px 16px; border-bottom: 1px solid var(--line-3); vertical-align: middle; }
  .runs-table tbody tr:last-child td { border-bottom: 0; }
  .runs-table tbody tr:hover td { background: #fbfcfe; }
  .runs-table td:last-child { text-align: right; white-space: nowrap; }
  .run-id { padding: 0; border: 0; background: none; color: var(--accent); font: 500 12px/1.5 var(--mono); text-align: left; }
  .run-id:hover { text-decoration: underline; }
  .run-scenario { display: flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; }
  .run-scenario span { color: var(--muted); font: 400 12px/1.5 var(--mono); }
  .run-scenario strong { color: var(--ink); font-size: 13px; font-weight: 500; }
  .run-score { font: 600 12px/1.5 var(--mono); font-variant-numeric: tabular-nums; }
  .run-score.ok { color: var(--ok); }
  .run-score.warn { color: #d97706; }
  .run-score.bad { color: #dc2626; }
  .run-score.quiet { color: var(--faint); }
  .run-time { color: var(--muted); font: 400 12px/1.5 var(--mono); }
  .pill { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px; border: 1px solid var(--line); border-radius: 999px; background: var(--hover); color: var(--muted); font-size: 11px; font-weight: 500; white-space: nowrap; }
  .pill.running { background: var(--info-50); border-color: var(--info-100); color: var(--info-700); }
  .pill.running .dot { background: var(--info); }
  .pill.done { background: var(--ok-50); border-color: var(--ok-100); color: var(--ok-700); }
  .pill.done .dot { background: var(--ok-2); }
  .pill.human { background: var(--warn-50); border-color: var(--warn-100); color: var(--warn-700); }
  .pill.human .dot { background: var(--warn); }
  .pill.failed { background: var(--bad-50); border-color: var(--bad-100); color: var(--bad-700); }
  .pill.failed .dot { background: var(--bad); }
  .pill.queued .dot { background: var(--faint); }
  .row-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 28px; padding: 4px 12px; border: 1px solid var(--line); border-radius: var(--radius-xs); background: var(--hover); color: var(--ink-3); font-size: 12px; font-weight: 500; text-decoration: none; }
  .row-btn:hover { background: #e9eef6; }
  .row-btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .row-btn.primary:hover { background: var(--accent-2); }
  .row-btn.warn { background: var(--warn-50); border-color: var(--warn-100); color: var(--warn-700); font-weight: 600; }
  .row-btn.bad { background: var(--bad-50); border-color: var(--bad-100); color: var(--bad-700); }

  .idle { display: grid; justify-items: center; gap: 4px; padding: 32px 24px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--sunken); text-align: center; }
  .idle > .ico-wrap { margin-bottom: 12px; font-size: 48px; }
  .idle h4 { margin: 0; font-size: 15px; font-weight: 600; }
  .idle p { max-width: 42ch; color: var(--muted); font-size: 13px; line-height: 1.5; }
  .idle .btn { margin-top: 16px; }
  .idle .trace { max-width: none; margin-top: 4px; color: var(--faint); font: 400 10px/1.5 var(--mono); letter-spacing: .5px; }

  /* ------------------------------------------------------- execution cockpit */
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
  .cockpit-bar {
    display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
    padding: 12px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow);
  }
  .cockpit-bar .ident { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; min-width: 0; }
  .crumbs-mini { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 11px; }
  .crumbs-mini i { color: var(--faint); font-style: normal; }
  .cockpit-bar .strong { color: var(--accent); font: 600 14px/1.5 var(--mono); }
  .chip-soft { padding: 1px 8px; border-radius: 4px; background: var(--hover); color: var(--ink-3); font-size: 11px; }
  .bar-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .bar-actions .select.compact { width: auto; min-width: 168px; max-width: 240px; min-height: 30px; padding: 4px 28px 4px 10px; font-size: 12px; }
  .cockpit-grid { display: grid; grid-template-columns: 260px minmax(0, 1fr) 290px; gap: 12px; align-items: start; }
  .rail-panel { display: grid; gap: 10px; padding: 12px; }
  .rail-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--line-3); }
  .rail-head h3 { font-size: 14px; font-weight: 600; }
  .step-list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; position: relative; }
  .step-list::before { content: ''; position: absolute; top: 14px; bottom: 14px; left: 13px; width: 2px; background: var(--line); }
  .step-row { position: relative; display: flex; align-items: flex-start; gap: 12px; padding: 6px 8px; border-radius: 4px; border: 1px solid transparent; }
  .step-row .marker {
    display: grid; place-items: center; flex: 0 0 24px; height: 24px; border-radius: 999px;
    background: var(--line); color: var(--ink-3); font: 500 11px/1 var(--mono); z-index: 1;
  }
  .step-row .body { display: grid; gap: 1px; min-width: 0; flex: 1 1 auto; }
  .step-row .line { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .step-row .line strong { font-size: 12px; font-weight: 500; color: var(--ink); overflow-wrap: anywhere; }
  .step-row .dur { color: var(--muted); font: 400 11px/1.5 var(--mono); }
  .step-row .body p { color: var(--muted); font-size: 11px; line-height: 1.4; }
  .step-row.completed .marker { background: var(--ok-2); color: #fff; }
  .step-row.running { background: var(--accent-50); border-color: var(--accent-200); }
  .step-row.running .marker { background: var(--accent-2); color: #fff; }
  .step-row.running .line strong { color: var(--accent); font-weight: 600; }
  .step-row.running .dur { color: var(--accent); font-weight: 600; }
  .step-row.failed .marker, .step-row.needs_human .marker { background: var(--bad); color: #fff; }
  .step-row.skipped, .step-row.pending { opacity: .72; }
  .step-row.skipped .dur, .step-row.pending .dur { color: var(--faint); }
  .dag-dock { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-top: 10px; padding: 10px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); box-shadow: var(--shadow); }
  .dag-dock div { display: grid; gap: 1px; }
  .dag-dock dt { color: var(--muted); font-size: 11px; font-weight: 500; }
  .dag-dock dd { margin: 0; color: var(--ink); font: 600 20px/1.25 var(--mono); font-variant-numeric: tabular-nums; letter-spacing: -.33px; }
  .dag-dock dd.ok { color: var(--ok); }
  .dag-dock dd.accent { color: var(--accent); }
  .dag-dock dd small { color: var(--faint); font: 500 11px/1.5 var(--font); }
  @media (max-width: 1180px) {
    .cockpit-grid { grid-template-columns: 240px minmax(0, 1fr); }
    .cockpit-grid > aside:last-child { grid-column: 1 / -1; }
  }
  @media (max-width: 900px) {
    .cockpit-grid { grid-template-columns: minmax(0, 1fr); }
    .dag-dock { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }

  /* -------------------------------------------------------- execution view */
  .run-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 12px; flex-wrap: wrap; }
  .run-head h1 { font-size: 22px; }
  .run-head select { max-width: min(320px, 78vw); }
  .workspace, .workbench-grid { display: grid; grid-template-columns: minmax(0, 2.5fr) minmax(235px, 1fr); gap: 16px; align-items: start; }
  .tabs { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 14px; border-bottom: 1px solid var(--line); }
  .tab { padding: 8px 12px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--muted); font-size: 13px; font-weight: 500; }
  .tab:hover { color: var(--ink); }
  .tab[aria-pressed="true"] { border-color: var(--accent); border-radius: 6px 6px 0 0; background: var(--accent-50); color: var(--accent); }
  .graph-layout { display: grid; grid-template-columns: minmax(126px, .65fr) minmax(0, 2.4fr); gap: 12px; }
  .step-list { display: grid; gap: 6px; align-content: start; }
  .step-list .node { min-height: 0; }
  .graph { min-width: 0; }
  .pipeline-flow { display: grid; justify-items: center; gap: 15px; margin: 12px 0; padding: 13px; border: 1px solid var(--line); border-radius: 10px; background: linear-gradient(180deg, #f8fafc, #eef2ff); }
  .stage { position: relative; display: grid; grid-template-columns: repeat(var(--branch-count, 1), minmax(0, 1fr)); gap: 8px; width: min(100%, 304px); }
  .stage + .stage::before { content: ''; position: absolute; top: -15px; left: 50%; height: 14px; border-left: 1px solid var(--faint); }
  .graph-node { position: relative; min-width: 0; }
  .stage.fork::before { height: 7px; }
  .stage.merge::before { top: -8px; height: 8px; }
  .stage.fork::after, .stage.merge::after { content: ''; position: absolute; top: -8px; left: calc(25% - 2px); right: calc(25% - 2px); border-top: 1px solid var(--faint); }
  .stage.fork .graph-node::before, .graph-node[data-merge]::after { content: ''; position: absolute; left: 50%; height: 8px; border-left: 1px solid var(--faint); }
  .stage.fork .graph-node::before { top: -8px; }
  .graph-node[data-merge]::after { bottom: -8px; }
  .node { display: grid; align-content: start; gap: 4px; width: 100%; min-width: 0; padding: 7px 8px; border: 1px solid var(--line-2); border-radius: 7px; background: var(--surface); color: var(--ink); font-size: 12px; text-align: left; overflow-wrap: anywhere; }
  .node:hover { border-color: var(--accent-200); }
  .node strong { font-weight: 600; }
  .node[data-state="running"] { border-color: var(--accent-2); background: var(--accent-50); box-shadow: 0 0 0 3px rgba(67, 56, 202, .08); }
  .node[data-state="completed"] { border-color: var(--ok-100); background: #f6fdfa; }
  .node[data-state="failed"], .node[data-state="needs_human"] { border-color: var(--bad-100); background: var(--bad-50); }
  .node[aria-pressed="true"] { outline: 2px solid var(--accent-2); outline-offset: 1px; }
  .node .badge { justify-self: start; padding: 1px 6px; font-size: 10px; }
  .subnodes { display: flex; gap: 7px; margin-top: 6px; flex-wrap: wrap; }
  .subnodes .node { width: auto; flex: 1 1 100px; }
  .inspector { padding: 10px 12px; border-left: 3px solid var(--accent-2); border-radius: 4px 8px 8px 4px; background: var(--hover); overflow-wrap: anywhere; }
  .inspector p + p { margin-top: 5px; }
  .codeblock { max-height: 390px; padding: 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--sunken); color: var(--ink); }
  .added { background: var(--ok-50); color: #047857; }
  .removed { background: var(--bad-50); color: #be123c; }
  .plain-list, .log { padding: 0; margin: 0; list-style: none; }
  .log { max-height: 510px; overflow: auto; }
  .log li, .record-list li { padding: 8px 0; border-bottom: 1px solid var(--line-3); overflow-wrap: anywhere; }
  .record-list li:last-child { border-bottom: 0; }
  .log time { margin-right: 7px; color: var(--faint); }
  .record-list a { text-decoration: none; }
  .record-list a:hover { color: var(--accent); text-decoration: underline; }
  .tiers { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .decision { border-color: var(--warn-100); background: var(--warn-50); }
  .decision p { margin-top: 6px; }
  .round > summary, .agent > summary { font-weight: 600; }
  .round[open] > summary, .agent[open] > summary { margin-bottom: 9px; }

  /* ----------------------------------------------------------- agent view */
  .team, .cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .card.agent { padding: 15px; }
  .agent > summary { position: relative; display: block; padding-right: 18px; list-style: none; }
  .agent > summary::-webkit-details-marker { display: none; }
  .agent > summary::after { content: '›'; position: absolute; top: -2px; right: 2px; color: var(--faint); font-size: 16px; }
  .agent[open] > summary::after { transform: rotate(90deg); }
  .agent-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .agent-icon { display: inline-grid; place-items: center; flex: 0 0 29px; height: 29px; border-radius: var(--radius-sm); background: var(--accent-100); color: var(--accent); }
  .agent progress { width: 100%; height: 8px; margin-top: 10px; accent-color: var(--accent-2); }
  .agent p, .agent ul { margin-top: 7px; }
  .card.scenario { display: flex; flex-direction: column; gap: 8px; }
  .card.scenario.selected { border-color: var(--accent-200); }
  .card.scenario .actions { margin-top: auto; padding-top: 4px; }
  .card.scenario h3 { overflow-wrap: anywhere; }
  .policy-list { margin: 0; padding-left: 20px; }

  /* ----------------------------------------------- settings / calibration UI */
  .page-head.tight { align-items: center; }
  .page-head.tight .lede { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  .page-head.tight h1 { font-size: 24px; }
  .chip-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .stamp {
    display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px;
    border-radius: 3px; background: var(--accent-100); color: var(--accent-deep);
    font: 600 10px/1.2 var(--mono); letter-spacing: .4px;
  }
  .stamp .dot { width: 6px; height: 6px; background: currentColor; }
  .stamp .sep { color: var(--line-2); }
  .stamp.plain { background: var(--surface); color: var(--ink); font-family: var(--font); font-size: 11px; font-weight: 500; letter-spacing: 0; box-shadow: var(--shadow-sm); }
  .scrim {
    display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
    padding: 8px 12px; border-radius: 4px; background: var(--sunken); box-shadow: var(--shadow-sm);
  }
  .scrim .lead { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .scrim .lead .chip-icon { display: inline-grid; place-items: center; flex: 0 0 24px; height: 24px; border-radius: 3px; background: #e3dfff; color: var(--accent-deep); font-size: 13px; }
  .scrim .lead p { color: var(--ink); font-size: 13px; font-weight: 500; }
  .digest { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 3px; background: var(--surface); box-shadow: var(--shadow-sm); }
  .digest span { color: var(--faint); font: 400 10px/1.6 var(--mono); letter-spacing: .5px; }
  .digest strong { color: var(--accent-deep); font: 600 12px/1.6 var(--mono); }

  .settings-split { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 12px; align-items: start; }
  .rail { display: grid; gap: 2px; padding: 8px; background: var(--surface); border-radius: var(--radius-sm); box-shadow: var(--shadow); }
  .rail-label { padding: 6px 8px; color: var(--faint); font-size: 11px; font-weight: 600; letter-spacing: .55px; }
  .rail button {
    display: flex; align-items: center; gap: 6px; padding: 8px 10px;
    border: 0; border-radius: 4px; background: none; color: var(--ink-3);
    font-size: 13px; font-weight: 500; text-align: left;
  }
  .rail button:hover { background: var(--hover); color: var(--ink); }
  .rail button[aria-pressed="true"] { background: #e3dfff; color: var(--accent-deep); font-weight: 600; }
  .rail button .num { margin-left: auto; padding: 0 4px; border-radius: 2px; color: var(--faint); font: 500 10px/1.6 var(--mono); letter-spacing: .4px; }
  .rail button[aria-pressed="true"] .num { background: var(--surface); color: var(--accent-deep); }
  .rail-foot { display: grid; gap: 4px; margin-top: 12px; padding: 8px; border-radius: 3px; background: var(--sunken); }
  .rail-foot .row { justify-content: space-between; gap: 8px; }
  .rail-foot dt { color: var(--faint); font-size: 10px; font-weight: 500; letter-spacing: -.25px; }
  .rail-foot dd { margin: 0; color: var(--ink); font: 600 10px/1.4 var(--mono); letter-spacing: .4px; }
  .rail-foot .meta { color: var(--ink-3); font: 500 11px/1.4 var(--font); }

  .calib-card { display: grid; gap: 12px; padding: 12px; background: var(--surface); border-radius: 6px; box-shadow: var(--shadow); }
  /* settings page uses the tighter "cockpit" radii from its own design */
  .rail { border-radius: 6px; }
  .calib-body .table-wrap { margin: 0; padding: 0; }
  .calib-body .runs-table th { background: var(--bg); }
  .calib-body .caption { color: var(--muted); font-size: 11px; line-height: 1.45; }
  .calib-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .calib-head .ident { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .calib-head .chip-icon { display: inline-grid; place-items: center; flex: 0 0 28px; height: 28px; border-radius: 3px; background: var(--accent-50); color: var(--accent-deep); font-size: 14px; }
  .calib-head h3 { font-size: 15px; font-weight: 600; }
  .calib-head .caption { color: var(--muted); font-size: 12px; }
  .calib-body { display: grid; gap: 10px; }
  .kv-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .kv { display: grid; gap: 3px; padding: 10px 12px; border-radius: 3px; background: var(--sunken); }
  .kv dt { color: var(--faint); font-size: 10px; font-weight: 500; letter-spacing: .4px; }
  .kv dd { margin: 0; color: var(--ink); font: 500 13px/1.5 var(--font); overflow-wrap: anywhere; }
  .kv dd.mono { font-family: var(--mono); font-size: 12px; }
  .kv dd.ok { color: var(--ok); }
  .kv dd.accent { color: var(--accent-deep); }

  /* ------------------------------------------------ runtime telemetry (agents) */
  .cockpit-card { display: grid; gap: 12px; padding: 16px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); }
  .cockpit-card .head { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .cockpit-card .head .title { display: flex; align-items: center; gap: 10px; }
  .cockpit-card .head .chip-icon { display: inline-grid; place-items: center; flex: 0 0 32px; height: 32px; border-radius: var(--radius-sm); background: var(--accent-50); border: 1px solid var(--accent-100); color: var(--accent); font-size: 15px; }
  .cockpit-card .head h2 { font-size: 14px; font-weight: 600; }
  .cockpit-card .head .caption { color: var(--muted); font-size: 11px; }
  .stat-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
  .stat-tile { display: grid; gap: 4px; padding: 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--bg); }
  .stat-tile .label { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--muted); font-size: 11px; font-weight: 500; letter-spacing: .22px; }
  .stat-tile .value { display: flex; align-items: baseline; gap: 6px; }
  .stat-tile .value b { color: var(--ink); font: 700 28px/1.2 var(--mono); font-variant-numeric: tabular-nums; letter-spacing: -.56px; }
  .stat-tile .value em { color: var(--muted); font: 500 11px/1.5 var(--mono); font-style: normal; }
  .stat-tile.ok .value b { color: var(--ok); }
  .stat-tile.warn .value b { color: #b45309; }
  .stat-tile.accent .value b { color: var(--accent); }
  .stat-tile .bar { height: 6px; border-radius: 999px; background: var(--line); overflow: hidden; }
  .stat-tile .bar i { display: block; height: 100%; border-radius: 999px; background: var(--accent-2); }
  .stat-tile.ok .bar i { background: var(--ok); }
  .stat-tile.warn .bar i { background: var(--warn); }
  .queue-strip { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 12px; border-radius: var(--radius-sm); background: var(--bg); border: 1px solid var(--line); }
  .queue-strip .lead { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; color: var(--ink-2); font-size: 12px; font-weight: 500; }
  .queue-strip .mono { color: var(--ink); }
  .queue-strip .count { color: var(--accent); font: 600 11px/1.5 var(--mono); }

  .agent-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .agent-tile { display: grid; gap: 10px; padding: 12px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); }
  .agent-tile .top { display: flex; align-items: center; gap: 10px; }
  .agent-tile .avatar { display: grid; place-items: center; flex: 0 0 36px; height: 36px; border-radius: 999px; background: var(--hover); color: var(--ink-2); font: 700 14px/1 var(--font); }
  .agent-tile.busy .avatar { background: var(--accent); color: #fff; }
  .agent-tile .ident { display: grid; gap: 1px; min-width: 0; }
  .agent-tile .ident strong { font-size: 14px; font-weight: 600; }
  .agent-tile .ident span { color: var(--muted); font-size: 11px; }
  .agent-tile .status { margin-left: auto; }
  .agent-tile .score { display: grid; gap: 4px; }
  .agent-tile .score .row { justify-content: space-between; gap: 8px; color: var(--muted); font-size: 11px; }
  .agent-tile .score b { color: var(--accent); font: 600 11px/1.5 var(--mono); }
  .agent-tile .track { height: 6px; border-radius: 999px; background: var(--line); overflow: hidden; }
  .agent-tile .track i { display: block; height: 100%; border-radius: 999px; background: var(--accent-2); }
  .agent-tile.busy .track i { background: var(--ok); }
  .agent-tile .mini { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .agent-tile .mini div { padding: 8px; border-radius: var(--radius-xs); background: var(--bg); border: 1px solid var(--line-3); }
  .agent-tile .mini dt { color: var(--muted); font-size: 11px; }
  .agent-tile .mini dd { margin: 1px 0 0; color: var(--accent); font: 600 11px/1.5 var(--mono); }
  .agent-tile .foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 6px; border-top: 1px solid var(--accent-100); color: var(--muted); font-size: 11px; }
  .legend { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; color: var(--ink-3); font-size: 11px; }
  .legend span { display: inline-flex; align-items: center; gap: 6px; }
  .legend i { width: 8px; height: 8px; border-radius: 999px; background: var(--faint); }
  .legend i.ok { background: var(--ok-2); }
  .legend i.busy { background: var(--accent-2); }
  .verdict-bar { display: flex; height: 8px; border-radius: 999px; overflow: hidden; background: var(--line); }
  .verdict-bar i { display: block; height: 100%; }
  .legend .sw { width: 10px; height: 10px; border-radius: 2px; }
  .tier-card { display: grid; gap: 12px; padding: 16px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); }
  .tier-card .head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .tier-card .head .title { display: flex; align-items: center; gap: 8px; }
  .tier-card .head h3 { font-size: 16px; font-weight: 600; }
  .tier-card .head .score { padding: 2px 8px; border-radius: 4px; background: var(--accent-50); border: 1px solid var(--accent-100); color: var(--accent); font: 600 11px/1.6 var(--mono); }
  .tier-card .terminal { display: grid; gap: 4px; padding: 12px; border-radius: var(--radius-sm); background: var(--bg); border: 1px solid var(--line); }
  .tier-card .terminal .bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 6px; border-bottom: 1px solid var(--line); color: var(--ink-2); font: 600 11px/1.6 var(--mono); }
  .tier-card .terminal .bar span { color: var(--muted); font-weight: 400; }
  .tier-card .terminal pre { font-size: 11px; line-height: 1.75; }
  .tier-card .terminal .fail { padding: 4px 8px; border-radius: var(--radius-xs); background: var(--bad-50); border: 1px solid var(--bad-100); color: var(--bad-700); }
  .artifact-row { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: var(--radius-sm); background: var(--bg); border: 1px solid var(--line); }
  .artifact-row .glyph { display: grid; place-items: center; flex: 0 0 36px; height: 36px; border-radius: var(--radius-sm); background: var(--accent-50); border: 1px solid var(--accent-100); color: var(--accent); font-size: 14px; }
  .artifact-row .glyph.ok { background: var(--ok-50); border-color: var(--ok-100); color: var(--ok-700); }
  .artifact-row .ident { display: grid; gap: 1px; min-width: 0; }
  .artifact-row .ident b { color: var(--ink); font: 600 12px/1.5 var(--mono); }
  .artifact-row .ident span { color: var(--muted); font-size: 12px; line-height: 1.4; }
  .artifact-row .act { margin-left: auto; }
  .timeline { display: grid; gap: 8px; position: relative; padding-left: 0; list-style: none; margin: 0; }
  .timeline li { display: flex; align-items: flex-start; gap: 12px; padding: 10px; border-radius: var(--radius-sm); background: var(--bg); border: 1px solid var(--line-3); }
  .timeline time { flex: 0 0 62px; color: var(--muted); font: 400 11px/1.6 var(--mono); }
  .timeline .kind { flex: 0 0 auto; padding: 1px 8px; border-radius: 4px; background: var(--accent-50); color: var(--accent); font: 600 10px/1.7 var(--mono); letter-spacing: .4px; }
  .timeline .kind.loop { background: var(--warn-50); color: var(--warn-700); }
  .timeline .kind.human { background: var(--ok-50); color: var(--ok-700); }
  .timeline .kind.run { background: var(--accent-50); color: var(--accent); }
  .timeline .kind.node { background: var(--hover); color: var(--ink-3); }
  .timeline p { flex: 1 1 auto; min-width: 0; color: var(--ink); font-size: 12px; line-height: 1.5; }

  .runs-table.compact { min-width: 0; }
  .runs-table.compact th { padding: 8px 12px; border-left: 0; border-right: 0; border-radius: 0; font-size: 11px; }
  .runs-table.compact td { padding: 9px 12px; border-left: 0; border-right: 0; }
  .split-2 { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr); gap: 16px; align-items: start; }
  .note-row { display: grid; gap: 4px; padding: 10px; border-radius: var(--radius-sm); background: var(--bg); border: 1px solid var(--line-3); }
  .note-row .top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .note-row .top b { color: var(--ink); font-size: 12px; font-weight: 600; }
  .note-row .top span { color: var(--faint); font: 400 11px/1.5 var(--mono); }
  .note-row p { color: var(--ink-3); font-size: 12px; line-height: 1.5; }

  /* ------------------------------------------------------------- collapse */
  @media (max-width: 1180px) {
    .kpi-grid, .preset-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 1000px) {
    .workspace, .workbench-grid, .repo-body, .graph-layout, .preset-grid, .team, .cards, .tiers { grid-template-columns: minmax(0, 1fr); }
  }
  @media (max-width: 860px) {
    body { grid-template-columns: 68px minmax(0, 1fr); }
    .sidebar nav { padding: 8px; }
    .sidebar nav a { justify-content: center; gap: 0; padding: 8px; font-size: 0; }
    .sidebar nav a .ico-wrap { font-size: 18px; }
    .sidebar-foot { display: none; }
    .topbar { gap: 8px; padding: 0 16px; }
    .crumbs .root, .crumbs .sep { display: none; }
    .account { padding: 4px 8px; }
    .account .ico-wrap { display: none; }
    .signout span:not(.ico-wrap) { display: none; }
    .shell { padding: 16px 16px 32px; }
    .page { gap: 16px; }
    .page-head h1 { font-size: 22px; letter-spacing: -.4px; }
  }
  @media (max-width: 620px) {
    .kpi-grid { grid-template-columns: minmax(0, 1fr); }
    .page-actions { width: 100%; padding-top: 0; }
    .page-actions .btn { flex: 1 1 0; }
    .card, .panel, .preset { padding: 16px; }
    .runs-table th, .runs-table td { padding: 12px; }
    .table-wrap { margin: 0 -16px; padding: 0 16px; }
    .repo-body { gap: 14px; }
  }
`;
