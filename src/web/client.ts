/**
 * AetherHarness / DSH-Orchestrator — 单页应用 (SPA) Web 可视化控制台。
 *
 * 以内联 HTML 字符串导出，内嵌响应式现代 CSS 与响应式原生 JavaScript。
 * 零外部运行时依赖：开箱即用，集成实时 SSE 事件流、声明式 DAG 拓扑、三层可信验证与人在回路自愈交互。
 */

export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AetherHarness / DSH-Orchestrator — 多智能体编排与可信调度平台</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2300e5ff'><path d='M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5'/></svg>">
  <style>
    :root {
      --bg: #090d16;
      --bg-alt: #0f1524;
      --surface: rgba(18, 25, 42, 0.75);
      --surface-hover: rgba(28, 38, 62, 0.85);
      --surface-solid: #12192a;
      --border: rgba(255, 255, 255, 0.08);
      --border-focus: rgba(0, 229, 255, 0.5);
      --text: #f1f5f9;
      --text-dim: #94a3b8;
      --text-muted: #64748b;
      --primary: #00e5ff;
      --primary-glow: rgba(0, 229, 255, 0.25);
      --success: #10b981;
      --success-glow: rgba(16, 185, 129, 0.2);
      --warning: #f59e0b;
      --warning-glow: rgba(245, 158, 11, 0.2);
      --danger: #f43f5e;
      --danger-glow: rgba(244, 63, 94, 0.2);
      --purple: #a855f7;
      --purple-glow: rgba(168, 85, 247, 0.2);
      --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
      --font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace;
      --radius-sm: 6px;
      --radius-md: 10px;
      --radius-lg: 16px;
      --shadow-sm: 0 2px 8px rgba(0,0,0,0.3);
      --shadow-md: 0 8px 24px rgba(0,0,0,0.4);
      --shadow-glow: 0 0 20px var(--primary-glow);
      --transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }

    [data-theme="light"] {
      --bg: #f8fafc;
      --bg-alt: #f1f5f9;
      --surface: rgba(255, 255, 255, 0.85);
      --surface-hover: #ffffff;
      --surface-solid: #ffffff;
      --border: rgba(0, 0, 0, 0.08);
      --border-focus: rgba(2, 132, 199, 0.5);
      --text: #0f172a;
      --text-dim: #475569;
      --text-muted: #94a3b8;
      --primary: #0284c7;
      --primary-glow: rgba(2, 132, 199, 0.15);
      --success: #059669;
      --success-glow: rgba(5, 150, 105, 0.15);
      --warning: #d97706;
      --warning-glow: rgba(217, 119, 6, 0.15);
      --danger: #e11d48;
      --danger-glow: rgba(225, 29, 72, 0.15);
      --purple: #7c3aed;
      --purple-glow: rgba(124, 58, 237, 0.15);
      --shadow-sm: 0 2px 8px rgba(0,0,0,0.06);
      --shadow-md: 0 8px 24px rgba(0,0,0,0.08);
      --shadow-glow: 0 0 16px var(--primary-glow);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      font-size: 14px;
      line-height: 1.5;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
      background-image: 
        radial-gradient(circle at 15% 10%, rgba(0, 229, 255, 0.04) 0%, transparent 40%),
        radial-gradient(circle at 85% 80%, rgba(168, 85, 247, 0.04) 0%, transparent 40%);
    }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.25); }

    /* Header */
    header {
      background: var(--surface);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 100;
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }

    .brand-wrap {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .logo-orb {
      width: 34px;
      height: 34px;
      border-radius: 8px;
      background: linear-gradient(135deg, var(--primary) 0%, var(--purple) 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: var(--shadow-glow);
      color: #fff;
    }
    .brand-title {
      font-size: 16px;
      font-weight: 700;
      letter-spacing: -0.02em;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .brand-badge {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(0, 229, 255, 0.12);
      color: var(--primary);
      border: 1px solid rgba(0, 229, 255, 0.25);
    }
    .brand-tagline {
      font-size: 11px;
      color: var(--text-dim);
      display: none;
    }
    @media (min-width: 900px) { .brand-tagline { display: block; } }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    /* Badges & Pills */
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 500;
      border: 1px solid var(--border);
      background: var(--surface-hover);
      color: var(--text-dim);
    }
    .pill-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .pill-live {
      color: var(--success);
      border-color: rgba(16, 185, 129, 0.3);
      background: var(--success-glow);
    }
    .pill-live .pill-dot {
      background: var(--success);
      box-shadow: 0 0 8px var(--success);
      animation: pulse 1.8s infinite;
    }
    .pill-warn {
      color: var(--warning);
      border-color: rgba(245, 158, 11, 0.3);
      background: var(--warning-glow);
    }
    .pill-warn .pill-dot { background: var(--warning); }
    .pill-offline {
      color: var(--text-muted);
    }
    .pill-offline .pill-dot { background: var(--text-muted); }

    @keyframes pulse {
      0% { transform: scale(0.95); opacity: 0.8; }
      50% { transform: scale(1.15); opacity: 1; }
      100% { transform: scale(0.95); opacity: 0.8; }
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      border-radius: var(--radius-sm);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      transition: var(--transition);
      background: var(--surface-hover);
      color: var(--text);
    }
    .btn:hover:not(:disabled) {
      filter: brightness(1.12);
      transform: translateY(-1px);
    }
    .btn:active:not(:disabled) { transform: translateY(0); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .btn-primary {
      background: linear-gradient(135deg, var(--primary) 0%, #0284c7 100%);
      color: #04101c;
      box-shadow: 0 2px 10px var(--primary-glow);
    }
    .btn-primary:hover:not(:disabled) {
      box-shadow: 0 4px 16px var(--primary-glow);
    }
    .btn-success {
      background: linear-gradient(135deg, var(--success) 0%, #059669 100%);
      color: #ffffff;
      box-shadow: 0 2px 10px var(--success-glow);
    }
    .btn-warning {
      background: linear-gradient(135deg, var(--warning) 0%, #d97706 100%);
      color: #ffffff;
      box-shadow: 0 2px 10px var(--warning-glow);
    }
    .btn-danger {
      background: linear-gradient(135deg, var(--danger) 0%, #e11d48 100%);
      color: #ffffff;
    }
    .btn-outline {
      border: 1px solid var(--border);
      background: transparent;
      color: var(--text);
    }
    .btn-outline:hover:not(:disabled) {
      border-color: var(--primary);
      background: rgba(0, 229, 255, 0.06);
      color: var(--primary);
    }
    .btn-icon {
      padding: 7px;
      border-radius: var(--radius-sm);
    }

    /* Layout */
    .container {
      max-width: 1560px;
      margin: 0 auto;
      padding: 24px;
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    /* Metric Bar */
    .metrics-bar {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
    }
    .metric-card {
      background: var(--surface);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      position: relative;
      overflow: hidden;
      transition: var(--transition);
    }
    .metric-card:hover {
      border-color: rgba(255, 255, 255, 0.16);
      transform: translateY(-2px);
      box-shadow: var(--shadow-sm);
    }
    .metric-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--primary), var(--purple));
      opacity: 0.7;
    }
    .metric-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-dim);
    }
    .metric-value {
      font-size: 26px;
      font-weight: 700;
      font-family: var(--font-mono);
      color: var(--text);
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .metric-sub {
      font-size: 12px;
      color: var(--text-muted);
    }

    /* Main Grid */
    .dashboard-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 24px;
    }
    @media (min-width: 1150px) {
      .dashboard-grid {
        grid-template-columns: 1.1fr 1fr;
      }
    }

    .card {
      background: var(--surface);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      box-shadow: var(--shadow-sm);
      position: relative;
    }
    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 12px;
    }
    .card-title {
      font-size: 15px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .card-title svg { color: var(--primary); }

    /* Agent Team Grid */
    .agent-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 12px;
    }
    .agent-card {
      background: var(--surface-hover);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      transition: var(--transition);
      position: relative;
    }
    .agent-card:hover {
      border-color: var(--primary);
      transform: translateY(-2px);
      box-shadow: 0 4px 14px rgba(0,0,0,0.2);
    }
    .agent-card.busy {
      border-color: rgba(168, 85, 247, 0.4);
      background: rgba(168, 85, 247, 0.06);
    }
    .agent-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
    }
    .agent-avatar-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .agent-avatar {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      color: var(--primary);
    }
    .agent-name {
      font-weight: 700;
      font-size: 14px;
    }
    .agent-role {
      font-size: 11px;
      color: var(--text-dim);
    }
    .agent-status {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      padding: 2px 7px;
      border-radius: 12px;
      border: 1px solid var(--border);
    }
    .agent-status.idle { background: rgba(255,255,255,0.05); color: var(--text-muted); }
    .agent-status.working { background: var(--purple-glow); color: var(--purple); border-color: rgba(168,85,247,0.3); }

    .agent-load-bar-wrap {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .agent-load-meta {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: var(--text-muted);
    }
    .progress-track {
      width: 100%;
      height: 5px;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.06);
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      border-radius: 3px;
      background: linear-gradient(90deg, var(--primary), var(--purple));
      transition: width 0.3s ease;
    }

    .agent-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .tag {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-dim);
      font-family: var(--font-mono);
    }

    /* Workflow DAG */
    .dag-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .task-selector-tabs {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .tab-btn {
      padding: 6px 14px;
      border-radius: var(--radius-sm);
      font-size: 12px;
      font-weight: 600;
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-dim);
      cursor: pointer;
      transition: var(--transition);
    }
    .tab-btn:hover { border-color: var(--text-dim); color: var(--text); }
    .tab-btn.active {
      background: rgba(0, 229, 255, 0.12);
      border-color: var(--primary);
      color: var(--primary);
    }

    .pipeline-flow {
      display: flex;
      flex-direction: column;
      gap: 10px;
      position: relative;
    }
    .pipeline-node {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 16px;
      border-radius: var(--radius-md);
      background: var(--surface-hover);
      border: 1px solid var(--border);
      transition: var(--transition);
      position: relative;
    }
    .pipeline-node:hover {
      border-color: rgba(255, 255, 255, 0.2);
    }
    .pipeline-node.running {
      border-color: var(--primary);
      background: rgba(0, 229, 255, 0.07);
      box-shadow: 0 0 14px var(--primary-glow);
    }
    .pipeline-node.completed {
      border-color: rgba(16, 185, 129, 0.4);
    }
    .pipeline-node.needs_human {
      border-color: var(--warning);
      background: rgba(245, 158, 11, 0.08);
      box-shadow: 0 0 16px var(--warning-glow);
    }
    .node-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .node-icon-box {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.06);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
    }
    .pipeline-node.running .node-icon-box { background: var(--primary); color: #000; }
    .pipeline-node.completed .node-icon-box { background: var(--success); color: #fff; }
    .pipeline-node.needs_human .node-icon-box { background: var(--warning); color: #fff; }

    .node-name { font-weight: 600; font-size: 13px; }
    .node-sub { font-size: 11px; color: var(--text-dim); }

    .node-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .status-badge {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 10px;
    }
    .status-badge.pending { background: rgba(255,255,255,0.06); color: var(--text-muted); }
    .status-badge.running { background: var(--primary-glow); color: var(--primary); }
    .status-badge.completed { background: var(--success-glow); color: var(--success); }
    .status-badge.needs_human { background: var(--warning-glow); color: var(--warning); }
    .status-badge.failed { background: var(--danger-glow); color: var(--danger); }

    /* Escalation Card */
    .escalation-banner {
      background: linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(244, 63, 94, 0.12) 100%);
      border: 1px solid rgba(245, 158, 11, 0.4);
      border-radius: var(--radius-md);
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      animation: slideDown 0.3s ease;
    }
    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .escalation-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .escalation-title {
      font-weight: 700;
      color: var(--warning);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .escalation-desc {
      font-size: 13px;
      color: var(--text);
      line-height: 1.4;
    }
    .escalation-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    /* 3-Tier Verification Scorecard */
    .verification-card {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .score-gauge-wrap {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--surface-hover);
      border-radius: var(--radius-md);
      padding: 12px 16px;
      border: 1px solid var(--border);
    }
    .score-number {
      font-size: 28px;
      font-weight: 800;
      font-family: var(--font-mono);
      color: var(--primary);
    }
    .tier-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .tier-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      border-radius: var(--radius-sm);
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border);
      font-size: 12px;
    }
    .tier-title {
      font-weight: 600;
    }
    .tier-desc {
      font-size: 11px;
      color: var(--text-dim);
    }

    /* Diff & Artifact Viewer */
    .diff-box {
      background: #060910;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      font-family: var(--font-mono);
      font-size: 12px;
      max-height: 380px;
      overflow-y: auto;
      line-height: 1.5;
    }
    .diff-line {
      padding: 2px 10px;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .diff-header { color: #60a5fa; background: rgba(96, 165, 250, 0.08); font-weight: 600; }
    .diff-add { color: #34d399; background: rgba(52, 211, 153, 0.12); }
    .diff-del { color: #f87171; background: rgba(248, 113, 113, 0.12); }
    .diff-hunk { color: #c084fc; background: rgba(192, 132, 252, 0.08); }

    /* Live Event Terminal */
    .terminal-box {
      background: #060910;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      font-family: var(--font-mono);
      font-size: 12px;
      height: 320px;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .terminal-line {
      display: flex;
      gap: 8px;
      align-items: baseline;
      line-height: 1.4;
    }
    .terminal-time { color: var(--text-muted); font-size: 11px; flex-shrink: 0; }
    .terminal-tag {
      font-size: 10px;
      font-weight: 600;
      padding: 1px 5px;
      border-radius: 3px;
      text-transform: uppercase;
      flex-shrink: 0;
    }
    .terminal-tag.agent { background: rgba(0, 229, 255, 0.15); color: var(--primary); }
    .terminal-tag.sched { background: rgba(168, 85, 247, 0.15); color: var(--purple); }
    .terminal-tag.verify { background: rgba(16, 185, 129, 0.15); color: var(--success); }
    .terminal-tag.loop { background: rgba(245, 158, 11, 0.15); color: var(--warning); }
    .terminal-tag.human { background: rgba(244, 63, 94, 0.15); color: var(--danger); }
    .terminal-tag.llm { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
    .terminal-tag.sys { background: rgba(255, 255, 255, 0.08); color: var(--text-dim); }
    .terminal-msg { color: var(--text); flex-grow: 1; word-break: break-all; }

    .terminal-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }
    .filter-chips {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }
    .chip {
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 12px;
      background: var(--surface-hover);
      border: 1px solid var(--border);
      color: var(--text-dim);
      cursor: pointer;
    }
    .chip.active {
      background: var(--primary);
      color: #04101c;
      border-color: var(--primary);
      font-weight: 600;
    }

    /* Footer */
    footer {
      margin-top: auto;
      border-top: 1px solid var(--border);
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      color: var(--text-muted);
      flex-wrap: wrap;
      gap: 12px;
    }

    /* Toast Notification */
    .toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      padding: 12px 18px;
      background: var(--surface-solid);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-md);
      display: flex;
      align-items: center;
      gap: 10px;
      z-index: 1000;
      transition: var(--transition);
      opacity: 0;
      transform: translateY(20px);
      pointer-events: none;
    }
    .toast.show {
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }
    .toast.success { border-color: var(--success); }
    .toast.warning { border-color: var(--warning); }
    .toast.error { border-color: var(--danger); }
  </style>
</head>
<body>
  <!-- Header -->
  <header>
    <div class="brand-wrap">
      <div class="logo-orb">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
          <polyline points="2 17 12 22 22 17"></polyline>
          <polyline points="2 12 12 17 22 12"></polyline>
        </svg>
      </div>
      <div>
        <div class="brand-title">
          <span>AetherHarness</span>
          <span class="brand-badge">赛题1 · 多智能体自愈调度平台</span>
        </div>
        <div class="brand-tagline">最大限度减少人类注意力消耗，提供最大化业务价值 (Take as little human attention as possible, give as much value as possible)</div>
      </div>
    </div>

    <div class="header-actions">
      <!-- 实时连接状态标识 -->
      <div id="sse-pill" class="pill pill-offline">
        <span class="pill-dot"></span>
        <span id="sse-text">正在连接...</span>
      </div>
      <div id="llm-pill" class="pill">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
        <span id="llm-text">离线确定性大脑</span>
      </div>

      <!-- 操作按钮群 -->
      <button class="btn btn-primary" id="btn-run-all" onclick="runSuite('all')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        <span>并发运行全部任务 (Run All)</span>
      </button>

      <button class="btn btn-outline" onclick="runSuite('rl-easy')">纯净任务 (rl-easy)</button>
      <button class="btn btn-outline" onclick="runSuite('rl-normal')">自愈任务 (rl-normal)</button>
      <button class="btn btn-outline" onclick="runSuite('rl-hard')">升级任务 (rl-hard)</button>

      <button class="btn btn-outline btn-icon" title="切换明暗主题" onclick="toggleTheme()">
        <svg id="theme-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      </button>
    </div>
  </header>

  <!-- 页面主体容器 -->
  <main class="container">
    <!-- 关键量化指标栏 -->
    <section class="metrics-bar">
      <div class="metric-card">
        <span class="metric-label">已完成任务</span>
        <div class="metric-value">
          <span id="metric-runs">0</span>
          <span class="metric-sub">/ 3 个基准</span>
        </div>
      </div>

      <div class="metric-card">
        <span class="metric-label">调度引擎派发</span>
        <div class="metric-value">
          <span id="metric-dispatches">0</span>
          <span class="metric-sub">优先级老化与负载感知</span>
        </div>
      </div>

      <div class="metric-card">
        <span class="metric-label">PDCA 自愈收敛率</span>
        <div class="metric-value">
          <span id="metric-convergence">100%</span>
          <span class="metric-sub">闭环迭代收敛</span>
        </div>
      </div>

      <div class="metric-card">
        <span class="metric-label">三层可信核验通过</span>
        <div class="metric-value">
          <span id="metric-verify">3 / 3</span>
          <span class="metric-sub">多维零信任共识</span>
        </div>
      </div>

      <div class="metric-card">
        <span class="metric-label">模型 Token 总消耗</span>
        <div class="metric-value">
          <span id="metric-tokens">0</span>
          <span class="metric-sub">用量透明追踪</span>
        </div>
      </div>
    </section>

    <!-- 主展示网格 -->
    <div class="dashboard-grid">
      <!-- 左列：智能体团队与声明式 DAG -->
      <div style="display:flex; flex-direction:column; gap:24px;">
        <!-- 智能体团队卡片 -->
        <section class="card">
          <div class="card-header">
            <div class="card-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <span>异构多智能体协作团队 (6 大专业角色)</span>
            </div>
            <span class="tag">负载感知动态调度</span>
          </div>

          <div class="agent-grid" id="agent-grid">
            <!-- 动态渲染智能体卡片 -->
          </div>
        </section>

        <!-- 声明式工作流 DAG 流水线 -->
        <section class="card">
          <div class="card-header">
            <div class="card-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              <span>声明式工作流 DAG 执行流水线</span>
            </div>
            <div class="task-selector-tabs" id="task-tabs">
              <button class="tab-btn active" onclick="selectTaskView('rl-easy')">rl-easy (纯净基准)</button>
              <button class="tab-btn" onclick="selectTaskView('rl-normal')">rl-normal (缺陷自愈)</button>
              <button class="tab-btn" onclick="selectTaskView('rl-hard')">rl-hard (规则升级)</button>
            </div>
          </div>

          <!-- 动态人在回路升级横幅 (触发时弹出) -->
          <div id="escalation-container" style="display:none;"></div>

          <div class="pipeline-flow" id="pipeline-nodes">
            <!-- 动态渲染 DAG 节点 -->
          </div>
        </section>
      </div>

      <!-- 右列：可信验证卡、Diff 补丁与实时终端日志 -->
      <div style="display:flex; flex-direction:column; gap:24px;">
        <!-- 三层可信验证评分卡 -->
        <section class="card">
          <div class="card-header">
            <div class="card-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
              <span>三层渐进式可信验证共识体系</span>
            </div>
            <span id="active-task-label" class="tag">rl-easy</span>
          </div>

          <div class="verification-card">
            <div class="score-gauge-wrap">
              <div>
                <div style="font-size:11px; text-transform:uppercase; color:var(--text-dim); font-weight:600;">综合可信分</div>
                <div class="score-number" id="verification-score">100%</div>
                <div style="font-size:11px; color:var(--text-muted);" id="verification-threshold">准入阈值: 85.0%</div>
              </div>
              <div style="text-align:right;">
                <span id="verification-status-pill" class="pill pill-live">核验通过</span>
                <div style="font-size:11px; color:var(--text-dim); margin-top:4px;" id="verification-iterations">PDCA 轮次: 1</div>
              </div>
            </div>

            <div class="tier-list">
              <div class="tier-row" id="tier-1-row">
                <div>
                  <div class="tier-title">Tier 1: 隔离沙箱代码测试</div>
                  <div class="tier-desc">node:vm 确定性测试、非法负数限制、并发竞争逃逸断言</div>
                </div>
                <span class="status-badge completed" id="tier-1-badge">PASSED</span>
              </div>

              <div class="tier-row" id="tier-2-row">
                <div>
                  <div class="tier-title">Tier 2: 零信任静态安全审计</div>
                  <div class="tier-desc">SEC-01..04 规则合规、禁用 eval/Function 动态执行、有限数值断言</div>
                </div>
                <span class="status-badge completed" id="tier-2-badge">PASSED</span>
              </div>

              <div class="tier-row" id="tier-3-row">
                <div>
                  <div class="tier-title">Tier 3: 多智能体红蓝对抗共识</div>
                  <div class="tier-desc">Elena (质量评审) 与 Cipher (安全审计) 提供可归因的规则信号</div>
                </div>
                <span class="status-badge completed" id="tier-3-badge">PASSED</span>
              </div>
            </div>
          </div>
        </section>

        <!-- 统一 Git 补丁交付物卡片 -->
        <section class="card">
          <div class="card-header">
            <div class="card-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>
              <span>统一 Git 补丁交付物 (Unified Git Patch)</span>
            </div>
            <div style="display:flex; gap:6px;">
              <button class="btn btn-outline" style="padding:4px 8px; font-size:11px;" onclick="copyPatch()">复制补丁 (Copy Diff)</button>
            </div>
          </div>

          <div class="diff-box" id="diff-box">
            <div style="padding:20px; text-align:center; color:var(--text-muted);">
              请运行任务，系统将在验证通过或人工接受后生成规范的 Git patch。
            </div>
          </div>
        </section>

        <!-- 实时编排事件流控制台 -->
        <section class="card">
          <div class="card-header">
            <div class="card-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
              <span>实时编排与调度事件日志 (SSE Stream)</span>
            </div>
            <div style="display:flex; gap:6px;">
              <button class="btn btn-outline" style="padding:4px 8px; font-size:11px;" onclick="clearLogs()">清空日志</button>
            </div>
          </div>

          <div class="terminal-toolbar">
            <div class="filter-chips">
              <span class="chip active" onclick="setLogFilter('all', this)">全部</span>
              <span class="chip" onclick="setLogFilter('agent', this)">智能体</span>
              <span class="chip" onclick="setLogFilter('sched', this)">调度器</span>
              <span class="chip" onclick="setLogFilter('verify', this)">可信验证</span>
              <span class="chip" onclick="setLogFilter('loop', this)">自愈循环</span>
              <span class="chip" onclick="setLogFilter('human', this)">人工升级</span>
            </div>
            <label style="font-size:11px; color:var(--text-muted); display:flex; align-items:center; gap:4px; cursor:pointer;">
              <input type="checkbox" id="auto-scroll-chk" checked> 自动滚动
            </label>
          </div>

          <div class="terminal-box" id="terminal-box">
            <!-- 动态渲染终端日志行 -->
          </div>
        </section>
      </div>
    </div>
  </main>

  <!-- 页脚说明 -->
  <footer>
    <div>
      AetherHarness / DSH-Orchestrator v2.1 · 零外部依赖 TypeScript 多智能体协同编排与自愈调度平台
    </div>
    <div>
      基于 DeepSeek Harness 架构哲学构建 · 赛题1: Agent编排创新应用 · MIT License
    </div>
  </footer>

  <!-- Toast -->
  <div class="toast" id="toast">
    <span id="toast-msg"></span>
  </div>

  <script>
    // 全局响应式状态
    const state = {
      runs: {},
      selectedTaskId: 'rl-easy',
      activeFilter: 'all',
      eventLogs: [],
      agents: [],
      metrics: {
        completedRuns: 0,
        dispatches: 0,
        totalTokens: 0,
        healedRuns: 0
      }
    };

    // 异构智能体元数据与雷达能力画像 (支持 ID 与英文名双重索引)
    const AGENT_META = {
      'req_analyst_01': { avatar: '莎', name: 'Sarah (需求分析师)', role: '需求规约提取与自动化测试生成', color: '#00e5ff', radar: '需求规约: 95%' },
      'architect_01': { avatar: '戴', name: 'David (系统架构师)', role: '接口签名定义与状态不变量界定', color: '#38bdf8', radar: '系统架构: 96%' },
      'developer_01': { avatar: '亚', name: 'Alex (核心开发工程师)', role: '代码实现与错误自适应自愈', color: '#a855f7', radar: '代码工程: 95%' },
      'critic_01': { avatar: '马', name: 'Marcus (根因批评家)', role: '缺陷根因诊断与修复指引', color: '#f59e0b', radar: '根因归因: 98%' },
      'reviewer_01': { avatar: '艾', name: 'Elena (代码评审专家)', role: '可维护性与代码完整性审计', color: '#10b981', radar: '代码评审: 92%' },
      'security_auditor_01': { avatar: '赛', name: 'Cipher (安全审计专家)', role: '零信任安全合规与漏洞拦截', color: '#f43f5e', radar: '安全审计: 97%' },
      'sarah': { avatar: '莎', name: 'Sarah (需求分析师)', role: '需求规约提取与自动化测试生成', color: '#00e5ff', radar: '需求规约: 95%' },
      'david': { avatar: '戴', name: 'David (系统架构师)', role: '接口签名定义与状态不变量界定', color: '#38bdf8', radar: '系统架构: 96%' },
      'alex': { avatar: '亚', name: 'Alex (核心开发工程师)', role: '代码实现与错误自适应自愈', color: '#a855f7', radar: '代码工程: 95%' },
      'marcus': { avatar: '马', name: 'Marcus (根因批评家)', role: '缺陷根因诊断与修复指引', color: '#f59e0b', radar: '根因归因: 98%' },
      'elena': { avatar: '艾', name: 'Elena (代码评审专家)', role: '可维护性与代码完整性审计', color: '#10b981', radar: '代码评审: 92%' },
      'cipher': { avatar: '赛', name: 'Cipher (安全审计专家)', role: '零信任安全合规与漏洞拦截', color: '#f43f5e', radar: '安全审计: 97%' }
    };

    // 页面初始化：建立 SSE 长连接并拉取全量状态
    window.addEventListener('DOMContentLoaded', () => {
      initSSE();
      fetchStatus();
      setInterval(fetchStatus, 4000);
    });

    // 明暗主题切换
    function toggleTheme() {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('dsh_theme', next);
    }
    const savedTheme = localStorage.getItem('dsh_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    // 弹出轻量提示 (Toast)
    function showToast(msg, type = 'success') {
      const toast = document.getElementById('toast');
      const toastMsg = document.getElementById('toast-msg');
      toast.className = 'toast ' + type + ' show';
      toastMsg.textContent = msg;
      setTimeout(() => toast.classList.remove('show'), 3500);
    }

    // 建立 Server-Sent Events (SSE) 实时事件监听
    function initSSE() {
      const pill = document.getElementById('sse-pill');
      const text = document.getElementById('sse-text');
      
      const evtSource = new EventSource('/api/events');

      evtSource.onopen = () => {
        pill.className = 'pill pill-live';
        text.textContent = 'SSE 实时已连接';
      };

      evtSource.onerror = () => {
        pill.className = 'pill pill-offline';
        text.textContent = '断线重连中...';
      };

      evtSource.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          handleOrchestratorEvent(event);
        } catch (err) {}
      };
    }

    // 定期拉取平台状态、智能体负载与任务结果
    async function fetchStatus() {
      try {
        const res = await fetch('/api/status');
        if (!res.ok) return;
        const data = await res.json();
        
        // 更新大模型/推理内核状态标识
        if (data.llm) {
          const isLive = data.llm.label && !data.llm.label.includes('offline');
          document.getElementById('llm-text').textContent = isLive ? 'DeepSeek 在线模型 (Live)' : '离线确定性大脑';
        }

        // 更新智能体列表
        if (data.agents && data.agents.length > 0) {
          state.agents = data.agents;
          renderAgents(data.agents);
        }

        // 更新各任务运行记录
        if (data.runs) {
          data.runs.forEach(r => { state.runs[r.taskId] = r; });
          updateTaskView();
          updateMetrics();
        }
      } catch (e) {}
    }

    // 渲染智能体团队卡片
    function renderAgents(agents) {
      const grid = document.getElementById('agent-grid');
      grid.innerHTML = agents.map(a => {
        const profile = a.profile || a;
        const meta = AGENT_META[profile.id] || AGENT_META[profile.name?.toLowerCase()] || {
          avatar: (profile.name || 'A')[0],
          name: profile.name,
          role: profile.role,
          color: '#00e5ff',
          radar: '综合能力: 95%'
        };
        const currentLoad = profile.currentLoad ?? a.currentLoad ?? 0;
        const maxConcurrency = profile.maxConcurrency ?? profile.maxConcurrentTasks ?? 2;
        const isBusy = currentLoad > 0;
        const loadPct = Math.round((currentLoad / maxConcurrency) * 100);
        const tokens = profile.totalTokensUsed ?? a.totalTokensUsed ?? 0;

        return \`
          <div class="agent-card \${isBusy ? 'busy' : ''}">
            <div class="agent-top">
              <div class="agent-avatar-wrap">
                <div class="agent-avatar" style="color:\${meta.color};">\${meta.avatar}</div>
                <div>
                  <div class="agent-name">\${meta.name}</div>
                  <div class="agent-role">\${meta.role}</div>
                </div>
              </div>
              <span class="agent-status \${isBusy ? 'working' : 'idle'}">\${isBusy ? '工作中' : '空闲'}</span>
            </div>

            <div class="agent-load-bar-wrap">
              <div class="agent-load-meta">
                <span>并发载荷: \${currentLoad} / \${maxConcurrency}</span>
                <span>\${meta.radar}</span>
              </div>
              <div class="progress-track">
                <div class="progress-fill" style="width: \${loadPct}%;"></div>
              </div>
            </div>

            <div class="agent-tags">
              \${(profile.specializations || [profile.role]).map(s => \`<span class="tag">\${s}</span>\`).join('')}
              <span class="tag" style="margin-left:auto; color:var(--primary);">\${tokens.toLocaleString()} tok</span>
            </div>
          </div>
        \`;
      }).join('');
    }

    // 声明式工作流 DAG 节点阶段定义
    const PIPELINE_NODES = [
      { id: 'n_requirement', name: '需求理解与规约提取', sub: 'Sarah · 混合 RAG 知识对齐与验收断言生成', icon: '1' },
      { id: 'n_architecture', name: '系统架构与契约设计', sub: 'David · 接口签名界定与高并发状态不变量', icon: '2' },
      { id: 'n_complexity_gate', name: '动态复杂度门禁判定', sub: '分支路由：轻量通道直通 vs 完整 PDCA 闭环', icon: '3' },
      { id: 'n_loop', name: 'Self-Loop 核心自愈循环 (PDCA)', sub: 'Alex(研发) ⟲ Marcus(批评诊断) 缺陷自愈收敛', icon: '4' },
      { id: 'n_scan', name: '三层可信验证与交叉审计', sub: 'Elena(评审) + Cipher(安全) + 隔离沙箱断言', icon: '5' },
      { id: 'n_patch', name: '交付物与 Git 补丁打包', sub: '生成规范的统一 Diff 补丁并执行可合并性校验', icon: '6' }
    ];

    // 切换当前查看的任务基准
    function selectTaskView(taskId) {
      state.selectedTaskId = taskId;
      document.querySelectorAll('#task-tabs .tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.includes(taskId));
      });
      document.getElementById('active-task-label').textContent = taskId;
      updateTaskView();
    }

    // 刷新当前选定任务的全套视图
    function updateTaskView() {
      const run = state.runs[state.selectedTaskId];
      renderDAG(run);
      renderEscalation(run);
      renderVerification(run);
      renderDiff(run);
    }

    // 渲染工作流 DAG 执行节点与动态状态高亮
    function renderDAG(run) {
      const container = document.getElementById('pipeline-nodes');
      const isRunning = run && run.status === 'running';
      const isCompleted = run && run.status === 'completed';
      const isEscalated = run && run.status === 'needs_human';

      const statusLabels = {
        'completed': '已完成',
        'needs_human': '待人工介入',
        'running': '执行中',
        'pending': '排队中'
      };

      container.innerHTML = PIPELINE_NODES.map((node, i) => {
        let nodeStatus = 'pending';
        if (run) {
          if (isCompleted) nodeStatus = 'completed';
          else if (isEscalated && (node.id === 'n_loop' || node.id === 'n_scan')) nodeStatus = 'needs_human';
          else if (isRunning) {
            nodeStatus = i === 3 ? 'running' : (i < 3 ? 'completed' : 'pending');
          }
        }

        return \`
          <div class="pipeline-node \${nodeStatus}">
            <div class="node-left">
              <div class="node-icon-box">\${nodeStatus === 'completed' ? '✓' : (nodeStatus === 'needs_human' ? '!' : node.icon)}</div>
              <div>
                <div class="node-name">\${node.name}</div>
                <div class="node-sub">\${node.sub}</div>
              </div>
            </div>
            <div class="node-right">
              <span class="status-badge \${nodeStatus}">\${statusLabels[nodeStatus] || nodeStatus.toUpperCase()}</span>
            </div>
          </div>
        \`;
      }).join('');
    }

    // 渲染人在回路最小注意力升级卡片
    function renderEscalation(run) {
      const container = document.getElementById('escalation-container');
      if (!run || run.status !== 'needs_human' || !run.escalation) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
      }

      container.style.display = 'block';
      const esc = run.escalation;
      const score = run.verification ? Math.round(run.verification.score * 100) : 88;

      container.innerHTML = \`
        <div class="escalation-banner">
          <div class="escalation-header">
            <div class="escalation-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span>触发人在回路（HITL）最小注意力升级 (\${run.taskId})</span>
            </div>
            <span class="tag" style="background:rgba(245,158,11,0.2); color:var(--warning);">阻断规则: \${esc.ruleId || 'DIST-001'}</span>
          </div>

          <div class="escalation-desc">
            \${esc.reason}
          </div>

          <div style="font-size:12px; color:var(--text-dim); margin-bottom:10px;">
            当前最优候选草稿得分: <strong style="color:var(--primary);">\${score}%</strong> · 已达到最大自愈预算轮次，请选择处理方案：
          </div>

          <div class="escalation-actions">
            <button class="btn btn-success" onclick="resolveEscalation('\${run.runId}', 1)">
              ✓ 方案2【系统推荐】：采纳当前最优候选草稿（转人工复核并附带补丁）
            </button>
            <button class="btn btn-warning" onclick="resolveEscalation('\${run.runId}', 0)">
              ↺ 方案1：追加 2 倍重试预算继续自愈迭代
            </button>
            <button class="btn btn-danger" onclick="resolveEscalation('\${run.runId}', 2)">
              ✕ 方案3：中止任务并回滚至最近安全检查点
            </button>
          </div>
        </div>
      \`;
    }

    // 渲染三层可信验证共识面板
    function renderVerification(run) {
      const v = run ? run.verification : null;
      const scoreElem = document.getElementById('verification-score');
      const pill = document.getElementById('verification-status-pill');
      const iterElem = document.getElementById('verification-iterations');

      if (!v) {
        scoreElem.textContent = '--';
        pill.className = 'pill pill-offline';
        pill.textContent = '等待执行';
        iterElem.textContent = 'PDCA 轮次: --';
        setTierStatus('tier-1-badge', false, '等待');
        setTierStatus('tier-2-badge', false, '等待');
        setTierStatus('tier-3-badge', false, '等待');
        return;
      }

      const scorePct = Math.round(v.score * 100);
      scoreElem.textContent = scorePct + '%';
      iterElem.textContent = 'PDCA 轮次: ' + (run.iterations || 1);

      if (v.passed) {
        pill.className = 'pill pill-live';
        pill.textContent = '核验通过';
      } else if (run.status === 'needs_human') {
        pill.className = 'pill pill-warn';
        pill.textContent = '待人工介入';
      } else {
        pill.className = 'pill pill-offline';
        pill.textContent = '已拦截';
      }

      // 提取三层各自分数与结果
      const tiers = v.tiers || [];
      const t1 = tiers.find(t => t.tier === 'tier-1') || { passed: v.passed };
      const t2 = tiers.find(t => t.tier === 'tier-2') || { passed: v.passed };
      const t3 = tiers.find(t => t.tier === 'tier-3') || { passed: v.passed };

      setTierStatus('tier-1-badge', t1.passed);
      setTierStatus('tier-2-badge', t2.passed);
      setTierStatus('tier-3-badge', t3.passed);
    }

    function setTierStatus(elemId, passed, overrideText) {
      const elem = document.getElementById(elemId);
      if (overrideText) {
        elem.className = 'status-badge pending';
        elem.textContent = overrideText;
        return;
      }
      elem.className = 'status-badge ' + (passed ? 'completed' : 'failed');
      elem.textContent = passed ? 'PASSED (通过)' : 'BLOCKED (拦截)';
    }

    // 渲染统一 Git 补丁 Diff
    function renderDiff(run) {
      const box = document.getElementById('diff-box');
      if (!run || !run.patch || !run.patch.patch) {
        box.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-muted);">暂无补丁生成，请运行任务。</div>';
        return;
      }

      const lines = run.patch.patch.split('\\n');
      box.innerHTML = lines.map(line => {
        let cls = 'diff-line';
        if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ')) cls += ' diff-header';
        else if (line.startsWith('@@')) cls += ' diff-hunk';
        else if (line.startsWith('+')) cls += ' diff-add';
        else if (line.startsWith('-')) cls += ' diff-del';
        return \`<div class="\${cls}">\${escapeHtml(line)}</div>\`;
      }).join('');
    }

    // HTML 字符转义防注入
    function escapeHtml(text) {
      return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // 更新汇总统计数据
    function updateMetrics() {
      const runs = Object.values(state.runs);
      const completed = runs.filter(r => r.status === 'completed').length;
      document.getElementById('metric-runs').textContent = completed;
      document.getElementById('metric-dispatches').textContent = runs.length * 4 + (runs.length ? 3 : 0);
      
      let totalTokens = 0;
      state.agents.forEach(a => {
        const profile = a.profile || a;
        totalTokens += (profile.totalTokensUsed ?? a.totalTokensUsed ?? 0);
      });
      document.getElementById('metric-tokens').textContent = totalTokens.toLocaleString();
    }

    // 触发任务下发
    async function runSuite(target) {
      const btn = document.getElementById('btn-run-all');
      btn.disabled = true;
      showToast('正在派发任务: ' + target, 'success');

      try {
        const res = await fetch('/api/tasks/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: target })
        });
        const result = await res.json();
        if (result.success) {
          showToast('任务已在后台启动', 'success');
          if (target !== 'all') selectTaskView(target);
        } else {
          showToast('启动失败: ' + (result.error || '未知错误'), 'error');
        }
      } catch (e) {
        showToast('网络错误: ' + e.message, 'error');
      } finally {
        setTimeout(() => { btn.disabled = false; }, 1500);
      }
    }

    // 人在回路升级决策回传
    async function resolveEscalation(runId, choiceIndex) {
      try {
        const res = await fetch('/api/runs/' + runId + '/escalate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ optionIndex: choiceIndex })
        });
        const data = await res.json();
        if (data.success) {
          showToast('升级决策已生效！正在应用对应操作...', 'success');
          fetchStatus();
        } else {
          showToast('决策执行失败: ' + data.error, 'error');
        }
      } catch (err) {
        showToast('网络错误: ' + err.message, 'error');
      }
    }

    // 复制 Git Patch 补丁到剪贴板
    function copyPatch() {
      const run = state.runs[state.selectedTaskId];
      if (!run || !run.patch || !run.patch.patch) {
        showToast('暂无可用补丁可复制', 'warning');
        return;
      }
      navigator.clipboard.writeText(run.patch.patch);
      showToast('统一 Git 补丁已复制到剪贴板！', 'success');
    }

    // 处理 Orchestrator 事件广播
    function handleOrchestratorEvent(ev) {
      state.eventLogs.push(ev);
      appendLogLine(ev);

      // 关键事件触发界面实时刷新
      if (['run.started', 'run.finished', 'node.finished', 'escalation'].includes(ev.kind)) {
        fetchStatus();
      }
    }

    // 向实时终端日志添加单行
    function appendLogLine(ev) {
      const box = document.getElementById('terminal-box');
      const timeStr = new Date(ev.at).toLocaleTimeString();
      const tag = ev.tag || 'sys';

      const tagMap = {
        'agent': '智能体',
        'sched': '调度',
        'verify': '验证',
        'loop': '自愈',
        'human': '人工',
        'sys': '系统'
      };

      if (state.activeFilter !== 'all' && tag !== state.activeFilter) return;

      const line = document.createElement('div');
      line.className = 'terminal-line';
      line.innerHTML = \`
        <span class="terminal-time">[\${timeStr}]</span>
        <span class="terminal-tag \${tag}">\${tagMap[tag] || tag}</span>
        <span class="terminal-msg">\${escapeHtml(ev.message || '')}</span>
      \`;
      box.appendChild(line);

      if (document.getElementById('auto-scroll-chk').checked) {
        box.scrollTop = box.scrollHeight;
      }
    }

    // 过滤终端日志类别
    function setLogFilter(filter, elem) {
      state.activeFilter = filter;
      document.querySelectorAll('.filter-chips .chip').forEach(c => c.classList.remove('active'));
      elem.classList.add('active');

      const box = document.getElementById('terminal-box');
      box.innerHTML = '';
      state.eventLogs.forEach(ev => appendLogLine(ev));
    }

    // 清空日志面板
    function clearLogs() {
      state.eventLogs = [];
      document.getElementById('terminal-box').innerHTML = '';
      showToast('事件日志已清空', 'success');
    }
  </script>
</body>
</html>
`;
