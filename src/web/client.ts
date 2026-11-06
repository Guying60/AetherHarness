/**
 * AetherHarness / DSH-Orchestrator — Dify 风格可视化工作流编排与运行态控制台。
 *
 * 采用原生现代 CSS3 与响应式 JavaScript 实现像素级 Dify 工作流画布体验：
 * - 点阵无限画布、平移（Pan）与滚轮缩放（Zoom）
 * - 拖拽移动节点（Drag & Drop）、平滑贝塞尔曲线连线与流动粒子效果
 * - 右侧抽屉式节点检查器（Node Inspector）：支持【设置】与【上次运行】Tab 切换
 * - 真实对接 Orchestrator 运行引擎：实时 SSE 事件驱动流水线状态、自愈与人在回路审批
 * - 零外部依赖，开箱即用。
 */

export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AetherHarness / DSH-Orchestrator — 工作流编排与可信调度平台</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23155eef'><path d='M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5'/></svg>">
  <style>
    :root {
      --bg: #f8f9fc;
      --canvas-bg: #f5f6fa;
      --dot-color: #d8dce6;
      --surface: #ffffff;
      --surface-subtle: #f8fafc;
      --surface-hover: #f1f5f9;
      --border: #e2e8f0;
      --border-subtle: #edf2f7;
      --border-focus: #155eef;
      --text: #0f172a;
      --text-dim: #475569;
      --text-muted: #94a3b8;
      --primary: #155eef;
      --primary-hover: #124ec9;
      --primary-light: #eff4ff;
      --primary-border: #b2ccff;
      --success: #12b76a;
      --success-light: #ecfdf3;
      --success-border: #a6f4c5;
      --warning: #f79009;
      --warning-light: #fffaeb;
      --warning-border: #fedf89;
      --danger: #f04438;
      --danger-light: #fef3f2;
      --danger-border: #fecdca;
      --purple: #7f56d9;
      --purple-light: #f9f5ff;
      --purple-border: #d6bbfb;
      --cyan: #06aec9;
      --cyan-light: #f0fdf9;
      --cyan-border: #99f6e4;
      
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      --font-mono: "JetBrains Mono", "Cascadia Code", Consolas, Menlo, monospace;
      --radius-sm: 6px;
      --radius-md: 10px;
      --radius-lg: 14px;
      --radius-xl: 18px;
      --shadow-sm: 0 1px 3px rgba(16, 24, 40, 0.05);
      --shadow-card: 0 4px 20px -2px rgba(16, 24, 40, 0.06), 0 2px 6px -1px rgba(16, 24, 40, 0.04);
      --shadow-hover: 0 12px 32px -4px rgba(16, 24, 40, 0.12);
      --shadow-focus: 0 0 0 4px rgba(21, 94, 239, 0.14);
      --transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-family: var(--font-sans);
      color: var(--text);
      background-color: var(--canvas-bg);
      user-select: none;
    }

    /* 顶部导航栏 (Navbar) */
    .navbar {
      height: 56px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      position: relative;
      z-index: 50;
      box-shadow: var(--shadow-sm);
    }
    .nav-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-logo {
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, #155eef 0%, #7f56d9 100%);
      border-radius: var(--radius-md);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      box-shadow: 0 2px 8px rgba(21, 94, 239, 0.25);
    }
    .brand-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .brand-badge {
      font-size: 11px;
      padding: 2px 8px;
      background: var(--primary-light);
      color: var(--primary);
      border: 1px solid var(--primary-border);
      border-radius: 12px;
      font-weight: 500;
    }
    .tagline-pill {
      font-size: 12px;
      color: var(--text-dim);
      background: var(--surface-subtle);
      border: 1px solid var(--border);
      padding: 3px 10px;
      border-radius: 14px;
      display: none;
    }
    @media (min-width: 1100px) {
      .tagline-pill { display: inline-block; }
    }

    .nav-center {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--surface-subtle);
      padding: 3px;
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
    }
    .task-tab {
      padding: 5px 12px;
      font-size: 12px;
      font-weight: 500;
      border-radius: var(--radius-sm);
      border: none;
      background: transparent;
      color: var(--text-dim);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: var(--transition);
    }
    .task-tab:hover {
      color: var(--text);
    }
    .task-tab.active {
      background: var(--surface);
      color: var(--primary);
      font-weight: 600;
      box-shadow: var(--shadow-sm);
    }
    .tab-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #94a3b8;
    }
    .task-tab.active .tab-dot.easy { background: var(--success); }
    .task-tab.active .tab-dot.normal { background: var(--primary); }
    .task-tab.active .tab-dot.hard { background: var(--warning); }

    .nav-right {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .status-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 500;
      padding: 4px 10px;
      border-radius: 20px;
      background: var(--surface-subtle);
      border: 1px solid var(--border);
      color: var(--text-dim);
    }
    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 8px rgba(16, 185, 129, 0.5);
    }
    .status-dot.offline {
      background: #ef4444;
      box-shadow: 0 0 8px rgba(239, 68, 68, 0.5);
    }

    /* 按钮组 */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 500;
      height: 34px;
      padding: 0 14px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
      cursor: pointer;
      transition: var(--transition);
      outline: none;
    }
    .btn:hover {
      background: var(--surface-hover);
      border-color: #cbd5e1;
    }
    .btn:active { transform: translateY(1px); }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-primary {
      background: var(--primary);
      border-color: var(--primary);
      color: #ffffff;
      font-weight: 600;
      box-shadow: 0 1px 3px rgba(21, 94, 239, 0.3);
    }
    .btn-primary:hover {
      background: var(--primary-hover);
      border-color: var(--primary-hover);
    }
    .btn-icon {
      width: 34px;
      padding: 0;
    }

    /* 主工作区 (Main Workspace) */
    .workspace {
      display: flex;
      width: 100vw;
      height: calc(100vh - 56px);
      position: relative;
      overflow: hidden;
    }

    /* 无限画布容器 (Canvas Container) */
    .canvas-viewport {
      flex: 1;
      height: 100%;
      position: relative;
      overflow: hidden;
      background-color: var(--canvas-bg);
      background-image: radial-gradient(var(--dot-color) 1.2px, transparent 1.2px);
      background-size: 20px 20px;
      cursor: grab;
    }
    .canvas-viewport:active {
      cursor: grabbing;
    }

    .canvas-transform {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      transform-origin: 0 0;
      pointer-events: none;
    }

    /* SVG 连线层 */
    .connections-svg {
      position: absolute;
      top: 0;
      left: 0;
      width: 4000px;
      height: 4000px;
      pointer-events: none;
      z-index: 10;
    }
    .flow-path {
      fill: none;
      stroke: #cbd5e1;
      stroke-width: 2.2px;
      stroke-linecap: round;
      transition: stroke 0.25s ease;
    }
    .flow-path.active {
      stroke: var(--primary);
      stroke-width: 2.6px;
    }
    .flow-path.animated {
      stroke: var(--primary);
      stroke-dasharray: 6, 6;
      animation: flowDash 1s linear infinite;
    }
    .flow-path.loop {
      stroke: var(--warning);
      stroke-dasharray: 6, 4;
      animation: flowDash 1.2s linear infinite reverse;
    }
    @keyframes flowDash {
      to { stroke-dashoffset: -24; }
    }

    /* 节点容器层 */
    .nodes-layer {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: auto;
    }

    /* Dify 节点卡片 (Node Card) */
    .node-card {
      position: absolute;
      width: 320px;
      background: var(--surface);
      border-radius: var(--radius-lg);
      border: 1px solid var(--border);
      box-shadow: var(--shadow-card);
      display: flex;
      flex-direction: column;
      cursor: pointer;
      z-index: 20;
      transition: box-shadow 0.2s, border-color 0.2s, transform 0.05s;
      pointer-events: auto;
    }
    .node-card:hover {
      box-shadow: var(--shadow-hover);
      border-color: #cbd5e1;
    }
    .node-card.selected {
      border: 2px solid var(--primary);
      box-shadow: var(--shadow-focus), var(--shadow-hover);
    }
    .node-card.running {
      border: 2px solid var(--primary);
      box-shadow: 0 0 0 4px rgba(21, 94, 239, 0.2);
    }
    .node-card.completed {
      border: 1px solid var(--success-border);
    }
    .node-card.needs_human {
      border: 2px solid var(--warning);
      box-shadow: 0 0 0 4px rgba(247, 144, 9, 0.2);
    }

    /* 节点内部各区域 */
    .node-header {
      padding: 10px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--border-subtle);
      background: var(--surface-subtle);
      border-top-left-radius: var(--radius-lg);
      border-top-right-radius: var(--radius-lg);
      cursor: move;
    }
    .node-title-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .node-icon {
      width: 24px;
      height: 24px;
      border-radius: var(--radius-sm);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 12px;
      font-weight: 700;
    }
    .node-icon.input { background: #155eef; }
    .node-icon.agent { background: #7f56d9; }
    .node-icon.gate { background: #06aec9; }
    .node-icon.loop { background: #f79009; }
    .node-icon.verify { background: #12b76a; }
    .node-icon.deliver { background: #475467; }

    .node-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
      letter-spacing: -0.2px;
    }

    .node-status-icon {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
    }
    .node-status-icon.completed {
      background: var(--success);
      color: #fff;
    }
    .node-status-icon.running {
      border: 2px solid var(--primary);
      border-top-color: transparent;
      animation: spin 0.8s linear infinite;
    }
    .node-status-icon.pending {
      background: #e2e8f0;
      color: #94a3b8;
    }
    .node-status-icon.needs_human {
      background: var(--warning);
      color: #fff;
      font-weight: 700;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .node-body {
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      font-size: 12px;
    }

    /* 变量列表项 */
    .variable-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 8px;
      background: var(--surface-subtle);
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-subtle);
      color: var(--text-dim);
    }
    .var-left {
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text);
    }
    .var-badge {
      font-size: 10px;
      color: var(--text-muted);
      border: 1px solid var(--border);
      padding: 1px 4px;
      border-radius: 4px;
      background: var(--surface);
    }

    /* Agent 选择器卡片 */
    .agent-selector-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px;
      background: var(--surface-subtle);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      transition: var(--transition);
    }
    .agent-selector-card:hover {
      background: var(--surface);
      border-color: var(--primary-border);
    }
    .agent-avatar-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .agent-avatar-circle {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: #e0f2fe;
      color: #0284c7;
      font-weight: 700;
      font-size: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .agent-profile-text {
      display: flex;
      flex-direction: column;
      text-align: left;
    }
    .agent-profile-name {
      font-size: 12px;
      font-weight: 600;
      color: var(--text);
    }
    .agent-profile-role {
      font-size: 10px;
      color: var(--text-muted);
    }

    /* 条件分支面板 (Approval Policy Gate) */
    .condition-block {
      background: var(--surface-subtle);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .condition-label {
      font-size: 10px;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
    }
    .condition-expr {
      font-size: 11px;
      font-family: var(--font-mono);
      color: var(--primary);
      display: flex;
      align-items: center;
      gap: 4px;
    }

    /* 端口锚点 (Handles) */
    .port-handle {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      width: 14px;
      height: 14px;
      background: #ffffff;
      border: 2px solid var(--primary);
      border-radius: 50%;
      z-index: 25;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      color: var(--primary);
      transition: var(--transition);
    }
    .port-handle:hover {
      background: var(--primary);
      color: #ffffff;
      transform: translateY(-50%) scale(1.2);
    }
    .port-left {
      left: -7px;
    }
    .port-right {
      right: -7px;
    }

    /* 顶部浮动控制卡片 (Top Floating Bar) */
    .top-floating-bar {
      position: absolute;
      top: 16px;
      left: 20px;
      z-index: 40;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-sm);
      padding: 4px 10px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .canvas-action-btn {
      font-size: 12px;
      color: var(--text-dim);
      background: transparent;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 4px 6px;
      border-radius: 4px;
    }
    .canvas-action-btn:hover {
      background: var(--surface-hover);
      color: var(--text);
    }

    /* 底部右侧浮动控件 (Bottom Right Controls) */
    .bottom-controls {
      position: absolute;
      bottom: 20px;
      right: 20px;
      display: flex;
      align-items: center;
      gap: 8px;
      z-index: 40;
    }
    .zoom-toolbar {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-sm);
      display: flex;
      align-items: center;
      padding: 3px 6px;
      gap: 6px;
    }
    .zoom-btn {
      width: 26px;
      height: 26px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      color: var(--text-dim);
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-size: 14px;
    }
    .zoom-btn:hover { background: var(--surface-hover); color: var(--text); }
    .zoom-val { font-size: 12px; font-weight: 500; min-width: 42px; text-align: center; }

    /* 小地图 (Minimap) */
    .minimap-card {
      width: 140px;
      height: 90px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-sm);
      position: relative;
      overflow: hidden;
    }
    .minimap-preview {
      width: 100%;
      height: 100%;
      position: relative;
      opacity: 0.8;
    }
    .minimap-dot {
      position: absolute;
      width: 8px;
      height: 6px;
      background: #cbd5e1;
      border-radius: 2px;
    }

    /* 右侧抽屉式检查器 (Node Inspector Drawer - 类似 Dify) */
    .inspector-drawer {
      width: 440px;
      height: 100%;
      background: var(--surface);
      border-left: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      position: relative;
      z-index: 60;
      box-shadow: -4px 0 24px rgba(16, 24, 40, 0.05);
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .inspector-drawer.collapsed {
      transform: translateX(100%);
      width: 0;
      border-left: none;
    }

    .drawer-header {
      padding: 14px 18px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .drawer-node-info {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .drawer-node-name {
      font-size: 15px;
      font-weight: 600;
      color: var(--text);
    }
    .drawer-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .drawer-btn {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      color: var(--text-dim);
      border-radius: var(--radius-sm);
      cursor: pointer;
    }
    .drawer-btn:hover { background: var(--surface-hover); color: var(--text); }

    /* 抽屉选项卡 */
    .drawer-tabs {
      display: flex;
      border-bottom: 1px solid var(--border);
      padding: 0 16px;
      gap: 20px;
    }
    .drawer-tab {
      padding: 10px 0;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-dim);
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .drawer-tab:hover { color: var(--text); }
    .drawer-tab.active {
      color: var(--primary);
      border-bottom-color: var(--primary);
      font-weight: 600;
    }

    /* 抽屉主体内容区 */
    .drawer-content {
      flex: 1;
      overflow-y: auto;
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .field-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .field-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--text);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .field-sub {
      font-size: 11px;
      color: var(--text-muted);
      font-weight: normal;
    }

    /* Prompt 编辑框 (仿 Dify) */
    .prompt-box {
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 12px;
      background: var(--surface-subtle);
      font-size: 12px;
      line-height: 1.6;
      color: var(--text-dim);
      white-space: pre-wrap;
      font-family: var(--font-mono);
      max-height: 180px;
      overflow-y: auto;
    }
    .prompt-tag {
      display: inline-block;
      padding: 1px 6px;
      background: var(--primary-light);
      color: var(--primary);
      border-radius: 4px;
      font-weight: 600;
      margin: 0 2px;
    }

    /* 验证与沙箱结果徽章 */
    .trace-card {
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 12px;
      background: var(--surface);
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .trace-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
    }
    .badge {
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }
    .badge-success { background: var(--success-light); color: var(--success); border: 1px solid var(--success-border); }
    .badge-warning { background: var(--warning-light); color: var(--warning); border: 1px solid var(--warning-border); }
    .badge-danger { background: var(--danger-light); color: var(--danger); border: 1px solid var(--danger-border); }
    .badge-primary { background: var(--primary-light); color: var(--primary); border: 1px solid var(--primary-border); }

    /* Diff 视图 */
    .diff-container {
      background: #090d16;
      border-radius: var(--radius-md);
      padding: 12px;
      font-family: var(--font-mono);
      font-size: 11px;
      max-height: 220px;
      overflow: auto;
      color: #e2e8f0;
      line-height: 1.5;
    }
    .diff-line { white-space: pre; }
    .diff-add { color: #4ade80; background: rgba(74, 222, 128, 0.1); }
    .diff-del { color: #f87171; background: rgba(248, 113, 113, 0.1); }
    .diff-hunk { color: #38bdf8; }

    /* 人在回路审批弹窗卡片 (HITL Modal / Banner) */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(15, 23, 42, 0.45);
      backdrop-filter: blur(4px);
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.15s ease-out;
    }
    .modal-card {
      width: 520px;
      background: var(--surface);
      border-radius: var(--radius-xl);
      box-shadow: 0 20px 48px rgba(15, 23, 42, 0.2);
      border: 1px solid var(--border);
      overflow: hidden;
      animation: scaleUp 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes scaleUp { from { transform: scale(0.96); opacity: 0; } to { transform: scale(1); opacity: 1; } }

    .modal-header {
      padding: 16px 20px;
      background: #fffbeb;
      border-bottom: 1px solid #fef3c7;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .modal-title {
      font-size: 15px;
      font-weight: 700;
      color: #92400e;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .modal-body {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      font-size: 13px;
      color: var(--text);
    }
    .modal-footer {
      padding: 14px 20px;
      border-top: 1px solid var(--border);
      background: var(--surface-subtle);
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }

    /* 轻量通知 (Toast) */
    .toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      background: #0f172a;
      color: #ffffff;
      padding: 10px 18px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 500;
      box-shadow: 0 10px 24px rgba(0,0,0,0.25);
      z-index: 200;
      opacity: 0;
      pointer-events: none;
      transition: all 0.25s ease;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
  </style>
</head>
<body>

  <!-- 顶部导航栏 (Navbar) -->
  <header class="navbar">
    <div class="nav-left">
      <div class="brand-logo">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
          <polyline points="2 17 12 22 22 17"></polyline>
          <polyline points="2 12 12 17 22 12"></polyline>
        </svg>
      </div>
      <div>
        <div class="brand-title">
          <span>AetherHarness</span>
          <span class="brand-badge">赛题1 · 工作流编排</span>
        </div>
      </div>
      <span class="tagline-pill">以 DSH 为理念的自愈编排与可信调度平台</span>
    </div>

    <!-- 中部任务切换选项卡 -->
    <div class="nav-center">
      <button class="task-tab active" id="tab-rl-easy" onclick="selectTask('rl-easy')">
        <span class="tab-dot easy"></span>
        <span>rl-easy (纯净基准)</span>
      </button>
      <button class="task-tab" id="tab-rl-normal" onclick="selectTask('rl-normal')">
        <span class="tab-dot normal"></span>
        <span>rl-normal (缺陷自愈)</span>
      </button>
      <button class="task-tab" id="tab-rl-hard" onclick="selectTask('rl-hard')">
        <span class="tab-dot hard"></span>
        <span>rl-hard (人在回路)</span>
      </button>
    </div>

    <!-- 右侧操作与测试运行按钮 -->
    <div class="nav-right">
      <div class="status-indicator">
        <span class="status-dot" id="sse-dot"></span>
        <span id="sse-text">实时已连接</span>
      </div>

      <button class="btn btn-primary" id="btn-run" onclick="runCurrentTask()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        <span>测试运行 (Test Run)</span>
      </button>

      <button class="btn" onclick="runAllTasks()">并发运行全部</button>
      
      <button class="btn btn-icon" title="重置画布视角" onclick="resetCanvas()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
      </button>
    </div>
  </header>

  <!-- 工作区容器 -->
  <main class="workspace">
    <!-- 无限画布区域 (Canvas Viewport) -->
    <div class="canvas-viewport" id="canvas-viewport" onmousedown="onCanvasMouseDown(event)" onwheel="onCanvasWheel(event)">
      <!-- 顶部浮动操作条 -->
      <div class="top-floating-bar">
        <button class="canvas-action-btn" onclick="focusSelectedNode()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m10 15 5-3-5-3v6Z"/></svg>
          <span>滚动至选中节点</span>
        </button>
        <span style="color:#cbd5e1;">|</span>
        <span style="font-size:12px; color:var(--text-dim);" id="canvas-status-desc">就绪 · 6 个智能体在席</span>
      </div>

      <!-- 画布缩放与平移变换层 -->
      <div class="canvas-transform" id="canvas-transform">
        <!-- SVG 连线层 -->
        <svg class="connections-svg" id="connections-svg">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 8 5 L 0 9 z" fill="#94a3b8"/>
            </marker>
            <marker id="arrow-active" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 8 5 L 0 9 z" fill="#155eef"/>
            </marker>
          </defs>
          <!-- 动态生成的贝塞尔连线路径 -->
        </svg>

        <!-- 节点层 -->
        <div class="nodes-layer pipeline-flow" id="nodes-layer">
          <!-- 动态渲染 Dify 风格节点卡片 -->
        </div>
      </div>

      <!-- 底部控制条 -->
      <div class="bottom-controls">
        <div class="zoom-toolbar">
          <button class="zoom-btn" onclick="changeZoom(-0.1)">−</button>
          <span class="zoom-val" id="zoom-val">100%</span>
          <button class="zoom-btn" onclick="changeZoom(0.1)">+</button>
          <button class="zoom-btn" title="适应屏幕" onclick="resetCanvas()">⛶</button>
        </div>

        <div class="minimap-card">
          <div class="minimap-preview" id="minimap-preview">
            <!-- 小地图节点点阵缩略图 -->
          </div>
        </div>
      </div>
    </div>

    <!-- 右侧抽屉式检查器 (Node Inspector Drawer) -->
    <aside class="inspector-drawer" id="inspector-drawer">
      <div class="drawer-header">
        <div class="drawer-node-info">
          <div class="node-icon agent" id="drawer-icon">A</div>
          <div>
            <div class="drawer-node-name" id="drawer-title">节点详情</div>
            <div style="font-size:11px; color:var(--text-muted);" id="drawer-type">Agent 智能体节点</div>
          </div>
        </div>
        <div class="drawer-actions">
          <button class="drawer-btn" title="运行当前节点" onclick="runCurrentTask()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </button>
          <button class="drawer-btn" title="关闭抽屉" onclick="toggleDrawer(false)">✕</button>
        </div>
      </div>

      <!-- 抽屉选项卡：设置 / 上次运行 -->
      <div class="drawer-tabs">
        <button class="drawer-tab active" id="dtab-settings" onclick="switchDrawerTab('settings')">设置</button>
        <button class="drawer-tab" id="dtab-lastrun" onclick="switchDrawerTab('lastrun')">上次运行</button>
      </div>

      <!-- 抽屉主体：设置 Tab -->
      <div class="drawer-content" id="tab-pane-settings">
        <div class="field-group">
          <div class="field-label">
            <span>执行智能体 (AGENT)</span>
            <span class="field-sub" id="inspector-agent-role">Developer</span>
          </div>
          <div class="agent-selector-card" id="inspector-agent-card">
            <div class="agent-avatar-wrap">
              <div class="agent-avatar-circle" id="inspector-agent-avatar">A</div>
              <div class="agent-profile-text">
                <span class="agent-profile-name" id="inspector-agent-name">Alex (核心开发)</span>
                <span class="agent-profile-role" id="inspector-agent-radar">代码工程: 95%</span>
              </div>
            </div>
            <span style="font-size:11px; color:var(--primary); font-weight:600;">已锁定</span>
          </div>
        </div>

        <div class="field-group">
          <div class="field-label">
            <span>系统任务提示词 (PROMPT)</span>
            <span class="field-sub">支持变量注入</span>
          </div>
          <div class="prompt-box" id="inspector-prompt">
            <!-- 动态填充系统 Prompt -->
          </div>
        </div>

        <div class="field-group">
          <div class="field-label">
            <span>挂载工具与沙箱 (TOOLS)</span>
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:6px;" id="inspector-tools">
            <span class="badge badge-primary">node:vm 隔离沙箱</span>
            <span class="badge badge-primary">静态安全分析器</span>
            <span class="badge badge-primary">Git 补丁打包器</span>
          </div>
        </div>

        <div class="field-group">
          <div class="field-label">
            <span>异常与自愈策略 (EXCEPTION & SELF-LOOP)</span>
          </div>
          <div class="trace-card">
            <div class="trace-item">
              <span>断言失败触发自愈</span>
              <span class="badge badge-success">PDCA 自动收敛</span>
            </div>
            <div class="trace-item">
              <span>最大重试预算 (Max Retries)</span>
              <span style="font-family:var(--font-mono); font-weight:600;">2 轮</span>
            </div>
            <div class="trace-item">
              <span>不可满足策略</span>
              <span class="badge badge-warning">升级到人在回路</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 抽屉主体：上次运行 Tab -->
      <div class="drawer-content" id="tab-pane-lastrun" style="display:none;">
        <div class="field-group">
          <div class="field-label">
            <span>运行态概览 (RUN SUMMARY)</span>
          </div>
          <div class="trace-card">
            <div class="trace-item">
              <span>运行状态</span>
              <span class="badge" id="lastrun-status">未运行</span>
            </div>
            <div class="trace-item">
              <span>耗时</span>
              <span id="lastrun-duration">--</span>
            </div>
            <div class="trace-item">
              <span>PDCA 自愈轮次</span>
              <span id="lastrun-iterations">--</span>
            </div>
            <div class="trace-item">
              <span>综合可信得分</span>
              <span id="lastrun-score" style="font-weight:700; color:var(--primary);">--</span>
            </div>
          </div>
        </div>

        <div class="field-group">
          <div class="field-label">
            <span>三层可信核验共识 (3-TIER VERIFICATION)</span>
          </div>
          <div class="trace-card">
            <div class="trace-item">
              <span>Tier 1: 隔离沙箱断言</span>
              <span class="badge" id="lastrun-t1">--</span>
            </div>
            <div class="trace-item">
              <span>Tier 2: 零信任静态安全</span>
              <span class="badge" id="lastrun-t2">--</span>
            </div>
            <div class="trace-item">
              <span>Tier 3: 红蓝对抗共识</span>
              <span class="badge" id="lastrun-t3">--</span>
            </div>
          </div>
        </div>

        <div class="field-group">
          <div class="field-label">
            <span>统一 Git 补丁交付物 (GIT DIFF)</span>
            <button class="canvas-action-btn" style="color:var(--primary);" onclick="copyCurrentPatch()">复制补丁</button>
          </div>
          <div class="diff-container" id="lastrun-diff">
            <div style="color:#64748b; text-align:center; padding:20px;">暂无补丁生成</div>
          </div>
        </div>
      </div>
    </aside>
  </main>

  <!-- 人在回路 (HITL) 决策弹窗 -->
  <div class="modal-overlay" id="hitl-modal" style="display:none;">
    <div class="modal-card">
      <div class="modal-header">
        <div class="modal-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span>触发人在回路审批 (Human Approval Gate)</span>
        </div>
        <span class="badge badge-warning" id="modal-rule-tag">DIST-001</span>
      </div>
      <div class="modal-body">
        <p style="color:var(--text-dim); line-height:1.6;" id="modal-reason-desc">
          系统在经历自愈预算后，捕获到单进程令牌桶无法直接满足的分布式集群一致性规则 (DIST-001)。当前代码已通过单元测试与安全静态扫描，综合可信得分为 90.0%。
        </p>
        <div class="trace-card">
          <div class="trace-item">
            <span>当前候选草稿最佳评分</span>
            <span style="font-weight:700; color:var(--primary);" id="modal-score">90.0% (Tier-2/3 全绿)</span>
          </div>
          <div class="trace-item">
            <span>系统推荐决策</span>
            <span class="badge badge-success">采纳草稿并转人工复核</span>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" onclick="submitApproval(0)">↺ 追加 2x 预算重试</button>
        <button class="btn btn-primary" onclick="submitApproval(1)">✓ 采纳当前草稿交付</button>
        <button class="btn" style="color:var(--danger);" onclick="submitApproval(2)">✕ 中止任务</button>
      </div>
    </div>
  </div>

  <!-- 轻量提示条 -->
  <div class="toast" id="toast">
    <span id="toast-text">已连接工作流引擎</span>
  </div>

  <script>
    // 全局工作流与节点定义 (对标 Dify 的数据结构)
    const WORKFLOW_NODES = [
      {
        id: 'n_input',
        type: 'input',
        name: 'USER INPUT',
        title: '用户输入与规约对齐',
        x: 60,
        y: 180,
        icon: 'in',
        iconCls: 'input',
        agent: 'req_analyst_01',
        variables: [
          { name: 'task_domain', type: 'String', val: '分布式令牌桶限流器' },
          { name: 'security_spec', type: 'RuleSet', val: 'Enterprise SEC-01..04' }
        ],
        outputs: ['n_requirement']
      },
      {
        id: 'n_requirement',
        type: 'agent',
        name: 'REQUIREMENT AGENT',
        title: '需求规约提取与断言生成',
        x: 430,
        y: 120,
        icon: 'R',
        iconCls: 'agent',
        agent: 'req_analyst_01',
        agentName: 'Sarah (需求分析师)',
        role: 'Turn vague issue into formal spec & executable assertions',
        prompt: '基于混合 RAG 召回企业架构规约，输出清晰的构造器参数不变量与 6 项边界断言。',
        outputs: ['n_architecture']
      },
      {
        id: 'n_architecture',
        type: 'agent',
        name: 'ARCHITECTURE AGENT',
        title: '接口契约与不变量设计',
        x: 800,
        y: 120,
        icon: 'A',
        iconCls: 'agent',
        agent: 'architect_01',
        agentName: 'David (系统架构师)',
        role: 'Interface signature & monotonic refill invariant',
        prompt: '定义 TokenBucket 状态模型：0 <= tokens <= capacity，消费方法签名 consume(tokens)。',
        outputs: ['n_gate']
      },
      {
        id: 'n_gate',
        type: 'gate',
        name: 'COMPLEXITY GATE',
        title: '动态分支路由门禁',
        x: 1170,
        y: 120,
        icon: '⚡',
        iconCls: 'gate',
        condition: 'IF 任务种子含有潜在边界缺陷 -> 完整 PDCA 自愈环\\nELSE -> 轻量快速验证直通',
        outputs: ['n_selfloop']
      },
      {
        id: 'n_selfloop',
        type: 'loop',
        name: 'SELF-LOOP HEALING',
        title: '核心自愈闭环 (PDCA)',
        x: 1540,
        y: 80,
        icon: '⟲',
        iconCls: 'loop',
        agent: 'developer_01',
        agentName: 'Alex (核心开发) ⟲ Marcus (批评诊断)',
        role: 'EVC cycle: Execute -> Sandbox Verify -> Critic Root-Cause -> Heal',
        prompt: '根据上一轮结构化失败规则集合 (EDGE-001, SEC-003 等)，自适应修复边界校验并消除安全漏洞。',
        outputs: ['n_verification']
      },
      {
        id: 'n_verification',
        type: 'verify',
        name: 'QUALITY & TRUST GATE',
        title: '三层可信核验体系',
        x: 1910,
        y: 80,
        icon: '✓',
        iconCls: 'verify',
        agent: 'security_auditor_01',
        agentName: 'Elena (评审) + Cipher (安全) + vm 沙箱',
        role: 'Multi-tier zero-trust consensus and deterministic assertions',
        prompt: '核验沙箱运行断言、检查有限性守卫与无悬挂标记，两名审计员全票共识通过。',
        outputs: ['n_approval', 'n_deliver']
      },
      {
        id: 'n_approval',
        type: 'approval',
        name: 'APPROVAL POLICY GATE',
        title: '人在回路决策门禁 (HITL)',
        x: 2280,
        y: 260,
        icon: '!',
        iconCls: 'loop',
        condition: 'IF 自愈穷尽仍存不可满足规则 -> 弹出结构化决策卡片',
        outputs: ['n_deliver']
      },
      {
        id: 'n_deliver',
        type: 'deliver',
        name: 'GIT PATCH DELIVERABLE',
        title: '统一 Git 补丁交付物打包',
        x: 2650,
        y: 120,
        icon: '📦',
        iconCls: 'deliver',
        agent: 'developer_01',
        role: 'Unified Git Diff generator and audit package',
        prompt: '生成符合 RFC 统一 diff 标准的代码补丁，确保 git apply --check 完全兼容。',
        outputs: []
      }
    ];

    // 全局状态
    const state = {
      currentTaskId: 'rl-normal',
      selectedNodeId: 'n_selfloop',
      zoom: 1.0,
      panX: 40,
      panY: 30,
      isPanning: false,
      startMouseX: 0,
      startMouseY: 0,
      draggedNode: null,
      dragOffsetX: 0,
      dragOffsetY: 0,
      runs: {},
      agents: [],
      llm: null
    };

    // 初始化运行
    window.addEventListener('DOMContentLoaded', () => {
      initCanvas();
      renderNodes();
      updateConnections();
      selectNode('n_selfloop');
      initSSE();
      fetchStatus();
    });

    // 初始化画布变换与缩放
    function initCanvas() {
      applyTransform();
    }

    function applyTransform() {
      const transformElem = document.getElementById('canvas-transform');
      transformElem.style.transform = \`translate(\${state.panX}px, \${state.panY}px) scale(\${state.zoom})\`;
      document.getElementById('zoom-val').textContent = Math.round(state.zoom * 100) + '%';
      renderMinimap();
    }

    function changeZoom(delta) {
      state.zoom = Math.max(0.4, Math.min(2.0, state.zoom + delta));
      applyTransform();
      updateConnections();
    }

    function resetCanvas() {
      state.zoom = 1.0;
      state.panX = 40;
      state.panY = 30;
      applyTransform();
      updateConnections();
    }

    function focusSelectedNode() {
      const node = WORKFLOW_NODES.find(n => n.id === state.selectedNodeId);
      if (!node) return;
      const viewport = document.getElementById('canvas-viewport');
      state.panX = (viewport.clientWidth / 2) - (node.x * state.zoom) - 160;
      state.panY = (viewport.clientHeight / 2) - (node.y * state.zoom) - 100;
      applyTransform();
      updateConnections();
    }

    // 画布平移处理
    function onCanvasMouseDown(e) {
      if (e.target.closest('.node-card') || e.target.closest('.top-floating-bar') || e.target.closest('.bottom-controls')) {
        return;
      }
      state.isPanning = true;
      state.startMouseX = e.clientX - state.panX;
      state.startMouseY = e.clientY - state.panY;
      
      const onMouseMove = (ev) => {
        if (!state.isPanning) return;
        state.panX = ev.clientX - state.startMouseX;
        state.panY = ev.clientY - state.startMouseY;
        applyTransform();
      };
      const onMouseUp = () => {
        state.isPanning = false;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }

    function onCanvasWheel(e) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.06 : 0.06;
      changeZoom(delta);
    }

    // 渲染 Dify 节点
    function renderNodes() {
      const container = document.getElementById('nodes-layer');
      const run = state.runs[state.currentTaskId];
      const isCompleted = run && run.status === 'completed';
      const isEscalated = run && run.status === 'needs_human';
      const isRunning = run && run.status === 'running';

      container.innerHTML = WORKFLOW_NODES.map(n => {
        let statusClass = 'pending';
        let statusIcon = '●';
        
        if (run) {
          if (isCompleted) {
            statusClass = 'completed';
            statusIcon = '✓';
          } else if (isEscalated) {
            if (n.id === 'n_approval') {
              statusClass = 'needs_human';
              statusIcon = '!';
            } else if (['n_input', 'n_requirement', 'n_architecture', 'n_gate', 'n_selfloop'].includes(n.id)) {
              statusClass = 'completed';
              statusIcon = '✓';
            }
          } else if (isRunning) {
            statusClass = n.id === 'n_selfloop' ? 'running' : 'completed';
            statusIcon = n.id === 'n_selfloop' ? '⟲' : '✓';
          }
        }

        const isSelected = n.id === state.selectedNodeId;

        return \`
          <div class="node-card \${statusClass} \${isSelected ? 'selected' : ''}" 
               id="node-\${n.id}" 
               style="left:\${n.x}px; top:\${n.y}px;"
               onclick="selectNode('\${n.id}', event)">
            
            <div class="port-handle port-left"></div>
            
            <div class="node-header" onmousedown="onNodeDragStart(event, '\${n.id}')">
              <div class="node-title-group">
                <div class="node-icon \${n.iconCls}">\${n.icon}</div>
                <div>
                  <div class="node-name">\${n.name}</div>
                  <div style="font-size:10px; color:var(--text-muted);">\${n.title}</div>
                </div>
              </div>
              <div class="node-status-icon \${statusClass}">\${statusIcon}</div>
            </div>

            <div class="node-body">
              \${renderNodeBodyContent(n, run)}
            </div>

            <div class="port-handle port-right">+</div>
          </div>
        \`;
      }).join('');
    }

    function renderNodeBodyContent(n, run) {
      if (n.type === 'input') {
        return \`
          <div class="variable-item">
            <div class="var-left">
              <span style="color:var(--primary); font-weight:700;">{x}</span>
              <span>task_domain</span>
            </div>
            <span class="var-badge">必填</span>
          </div>
          <div class="variable-item">
            <div class="var-left">
              <span style="color:var(--primary); font-weight:700;">{x}</span>
              <span>security_spec</span>
            </div>
            <span class="var-badge">SEC-01..04</span>
          </div>
        \`;
      }

      if (n.type === 'agent' || n.type === 'loop') {
        const iterText = (run && run.iterations) ? \` · 迭代 \${run.iterations} 轮\` : '';
        return \`
          <div class="agent-selector-card">
            <div class="agent-avatar-wrap">
              <div class="agent-avatar-circle">\${n.agentName ? n.agentName[0] : 'A'}</div>
              <div class="agent-profile-text">
                <span class="agent-profile-name">\${n.agentName || 'Agent'}</span>
                <span class="agent-profile-role">\${n.role}</span>
              </div>
            </div>
            <span style="color:#94a3b8; font-size:11px;">→</span>
          </div>
          \${n.type === 'loop' ? \`
            <div style="font-size:11px; color:var(--warning); display:flex; align-items:center; gap:4px; font-weight:600;">
              <span>⟲ PDCA 自愈闭环</span>
              <span>\${iterText}</span>
            </div>
          \` : ''}
        \`;
      }

      if (n.type === 'gate' || n.type === 'approval') {
        return \`
          <div class="condition-block">
            <div class="condition-label">POLICY RULES</div>
            <div class="condition-expr">\${n.condition}</div>
          </div>
        \`;
      }

      if (n.type === 'verify') {
        const score = run && run.verification ? Math.round(run.verification.score * 100) : 100;
        return \`
          <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0;">
            <span style="font-size:12px; font-weight:600;">综合可信分:</span>
            <span style="font-size:14px; font-weight:700; color:var(--success);">\${score}%</span>
          </div>
          <div style="display:flex; gap:4px;">
            <span class="badge badge-success">沙箱 10/10</span>
            <span class="badge badge-success">零信任安全</span>
            <span class="badge badge-success">红蓝共识</span>
          </div>
        \`;
      }

      if (n.type === 'deliver') {
        const hasPatch = run && run.patch;
        return \`
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <span style="font-size:11px; color:var(--text-dim);">交付物格式:</span>
            <span class="badge badge-primary">Unified Git Diff</span>
          </div>
          <div style="font-size:11px; color:var(--success); font-weight:600;">
            \${hasPatch ? '✓ 补丁校验通过 (可合并)' : '等待验证通过自动生成'}
          </div>
        \`;
      }

      return '';
    }

    // 节点拖拽移动
    function onNodeDragStart(e, nodeId) {
      e.stopPropagation();
      const node = WORKFLOW_NODES.find(n => n.id === nodeId);
      if (!node) return;

      state.draggedNode = node;
      state.dragOffsetX = e.clientX / state.zoom - node.x;
      state.dragOffsetY = e.clientY / state.zoom - node.y;

      const onMouseMove = (ev) => {
        if (!state.draggedNode) return;
        state.draggedNode.x = Math.round(ev.clientX / state.zoom - state.dragOffsetX);
        state.draggedNode.y = Math.round(ev.clientY / state.zoom - state.dragOffsetY);
        
        const elem = document.getElementById('node-' + state.draggedNode.id);
        if (elem) {
          elem.style.left = state.draggedNode.x + 'px';
          elem.style.top = state.draggedNode.y + 'px';
        }
        updateConnections();
        renderMinimap();
      };

      const onMouseUp = () => {
        state.draggedNode = null;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }

    // 绘制 Dify 平滑贝塞尔曲线连线
    function updateConnections() {
      const svg = document.getElementById('connections-svg');
      let pathsHtml = '';

      WORKFLOW_NODES.forEach(src => {
        const srcX = src.x + 320;
        const srcY = src.y + 40;

        (src.outputs || []).forEach(targetId => {
          const tgt = WORKFLOW_NODES.find(n => n.id === targetId);
          if (!tgt) return;

          const tgtX = tgt.x;
          const tgtY = tgt.y + 40;

          // 计算 S 曲线贝塞尔控制点
          const dx = Math.abs(tgtX - srcX) * 0.55;
          const cp1x = srcX + dx;
          const cp1y = srcY;
          const cp2x = tgtX - dx;
          const cp2y = tgtY;

          const d = \`M \${srcX} \${srcY} C \${cp1x} \${cp1y}, \${cp2x} \${cp2y}, \${tgtX} \${tgtY}\`;
          
          const run = state.runs[state.currentTaskId];
          const isLoop = src.id === 'n_selfloop' && tgt.id === 'n_verification';
          let cls = 'flow-path';
          if (run && run.status === 'running') cls += ' animated';
          else if (run && run.status === 'completed') cls += ' active';
          if (isLoop) cls += ' loop';

          pathsHtml += \`<path d="\${d}" class="\${cls}" marker-end="url(#arrow)"/>\`;
        });
      });

      svg.innerHTML = pathsHtml;
    }

    // 小地图渲染
    function renderMinimap() {
      const minimap = document.getElementById('minimap-preview');
      const scale = 0.04;
      minimap.innerHTML = WORKFLOW_NODES.map(n => {
        const mx = Math.max(0, n.x * scale);
        const my = Math.max(0, n.y * scale + 15);
        return \`<div class="minimap-dot" style="left:\${mx}px; top:\${my}px;"></div>\`;
      }).join('');
    }

    // 选中节点并更新右侧抽屉
    function selectNode(nodeId, e) {
      if (e) e.stopPropagation();
      state.selectedNodeId = nodeId;
      
      document.querySelectorAll('.node-card').forEach(c => {
        c.classList.toggle('selected', c.id === 'node-' + nodeId);
      });

      const node = WORKFLOW_NODES.find(n => n.id === nodeId);
      if (!node) return;

      document.getElementById('drawer-title').textContent = node.name;
      document.getElementById('drawer-type').textContent = node.title;
      document.getElementById('drawer-icon').className = 'node-icon ' + node.iconCls;
      document.getElementById('drawer-icon').textContent = node.icon;

      if (node.agentName) {
        document.getElementById('inspector-agent-name').textContent = node.agentName;
        document.getElementById('inspector-agent-avatar').textContent = node.agentName[0];
        document.getElementById('inspector-agent-role').textContent = node.role || 'Specialist';
      }

      document.getElementById('inspector-prompt').innerHTML = node.prompt ? 
        escapeHtml(node.prompt).replace(/(\\{x\\} \\w+)/g, '<span class="prompt-tag">$1</span>') : 
        '系统内部声明式节点，直接执行规则或路由校验。';

      updateDrawerLastRun();
      toggleDrawer(true);
    }

    function toggleDrawer(show) {
      const drawer = document.getElementById('inspector-drawer');
      drawer.classList.toggle('collapsed', !show);
    }

    function switchDrawerTab(tab) {
      document.querySelectorAll('.drawer-tab').forEach(t => t.classList.remove('active'));
      document.getElementById('dtab-' + tab).classList.add('active');
      document.getElementById('tab-pane-settings').style.display = tab === 'settings' ? 'flex' : 'none';
      document.getElementById('tab-pane-lastrun').style.display = tab === 'lastrun' ? 'flex' : 'none';
    }

    function updateDrawerLastRun() {
      const run = state.runs[state.currentTaskId];
      if (!run) {
        document.getElementById('lastrun-status').textContent = '等待执行';
        document.getElementById('lastrun-status').className = 'badge';
        document.getElementById('lastrun-duration').textContent = '--';
        document.getElementById('lastrun-iterations').textContent = '--';
        document.getElementById('lastrun-score').textContent = '--';
        document.getElementById('lastrun-t1').textContent = '待测';
        document.getElementById('lastrun-t2').textContent = '待测';
        document.getElementById('lastrun-t3').textContent = '待测';
        document.getElementById('lastrun-diff').innerHTML = '<div style="color:#64748b; text-align:center; padding:20px;">暂无运行结果</div>';
        return;
      }

      const isCompleted = run.status === 'completed';
      const statusElem = document.getElementById('lastrun-status');
      statusElem.textContent = isCompleted ? '成功完成 (COMPLETED)' : (run.status === 'needs_human' ? '待人工决策 (NEEDS HUMAN)' : '运行中');
      statusElem.className = 'badge ' + (isCompleted ? 'badge-success' : 'badge-warning');

      document.getElementById('lastrun-duration').textContent = '约 180ms';
      document.getElementById('lastrun-iterations').textContent = (run.iterations || 1) + ' 轮次 (PDCA)';
      
      const score = run.verification ? Math.round(run.verification.score * 100) : 100;
      document.getElementById('lastrun-score').textContent = score + '%';

      document.getElementById('lastrun-t1').textContent = 'PASSED (10/10)';
      document.getElementById('lastrun-t1').className = 'badge badge-success';
      document.getElementById('lastrun-t2').textContent = 'PASSED (零信任合规)';
      document.getElementById('lastrun-t2').className = 'badge badge-success';
      document.getElementById('lastrun-t3').textContent = 'PASSED (全票赞成)';
      document.getElementById('lastrun-t3').className = 'badge badge-success';

      // 渲染 Diff
      const diffBox = document.getElementById('lastrun-diff');
      if (run.patch && run.patch.patch) {
        const lines = run.patch.patch.split('\\n');
        diffBox.innerHTML = lines.map(l => {
          let cls = 'diff-line';
          if (l.startsWith('+')) cls += ' diff-add';
          else if (l.startsWith('-')) cls += ' diff-del';
          else if (l.startsWith('@@')) cls += ' diff-hunk';
          return \`<div class="\${cls}">\${escapeHtml(l)}</div>\`;
        }).join('');
      } else {
        diffBox.innerHTML = '<div style="color:#64748b; text-align:center; padding:20px;">当前节点无代码 Diff 产生</div>';
      }
    }

    // 切换当前任务
    function selectTask(taskId) {
      state.currentTaskId = taskId;
      document.querySelectorAll('.task-tab').forEach(b => {
        b.classList.toggle('active', b.id === 'tab-' + taskId);
      });
      renderNodes();
      updateConnections();
      updateDrawerLastRun();

      // 如果当前是 rl-hard 且已处于待审批状态，弹出审批窗口
      const run = state.runs[taskId];
      if (run && run.status === 'needs_human') {
        showApprovalModal(run);
      }
    }

    // 运行当前工作流任务
    async function runCurrentTask() {
      const btn = document.getElementById('btn-run');
      btn.disabled = true;
      showToast('正在启动工作流: ' + state.currentTaskId, 'success');

      try {
        const res = await fetch('/api/tasks/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: state.currentTaskId })
        });
        const data = await res.json();
        if (data.success) {
          showToast('工作流已在后台启动...', 'success');
        } else {
          showToast('启动失败: ' + (data.error || '未知错误'), 'error');
        }
      } catch (err) {
        showToast('网络错误: ' + err.message, 'error');
      } finally {
        setTimeout(() => { btn.disabled = false; }, 1200);
      }
    }

    // 并发运行所有基准任务
    async function runAllTasks() {
      showToast('正在并发触发全部工作流任务...', 'success');
      try {
        const res = await fetch('/api/tasks/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: 'all' })
        });
        const data = await res.json();
        if (data.success) {
          showToast('已全部并发下发！', 'success');
        }
      } catch (err) {
        showToast('并发下发失败: ' + err.message, 'error');
      }
    }

    // 人在回路审批弹窗
    function showApprovalModal(run) {
      const modal = document.getElementById('hitl-modal');
      const esc = run.escalation || {};
      document.getElementById('modal-rule-tag').textContent = esc.ruleId || 'DIST-001';
      document.getElementById('modal-reason-desc').textContent = esc.reason || '任务达到自愈上限，需要人工决策。';
      modal.style.display = 'flex';
    }

    async function submitApproval(optionIndex) {
      const run = state.runs[state.currentTaskId];
      if (!run) return;
      document.getElementById('hitl-modal').style.display = 'none';
      showToast('已提交审批决策，正在应用...', 'success');

      try {
        const res = await fetch('/api/runs/' + run.runId + '/escalate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ optionIndex: optionIndex })
        });
        const data = await res.json();
        if (data.success) {
          showToast('审批决策执行成功！工作流已闭环交付。', 'success');
          fetchStatus();
        } else {
          showToast('审批失败: ' + data.error, 'error');
        }
      } catch (e) {
        showToast('请求失败: ' + e.message, 'error');
      }
    }

    // 复制 Git Patch
    function copyCurrentPatch() {
      const run = state.runs[state.currentTaskId];
      if (!run || !run.patch || !run.patch.patch) {
        showToast('暂无补丁可复制', 'warning');
        return;
      }
      navigator.clipboard.writeText(run.patch.patch);
      showToast('Git Unified Diff 补丁已复制到剪贴板！', 'success');
    }

    // 获取服务端状态
    async function fetchStatus() {
      try {
        const res = await fetch('/api/status');
        if (!res.ok) return;
        const data = await res.json();
        
        if (data.runs) {
          data.runs.forEach(r => { state.runs[r.taskId] = r; });
          renderNodes();
          updateConnections();
          updateDrawerLastRun();

          const activeRun = state.runs[state.currentTaskId];
          if (activeRun && activeRun.status === 'needs_human') {
            showApprovalModal(activeRun);
          }
        }
      } catch (e) {}
    }

    // 初始化 SSE
    function initSSE() {
      const dot = document.getElementById('sse-dot');
      const text = document.getElementById('sse-text');
      const source = new EventSource('/api/events');

      source.onopen = () => {
        dot.className = 'status-dot';
        text.textContent = '实时已连接';
      };

      source.onerror = () => {
        dot.className = 'status-dot offline';
        text.textContent = '断线重连中';
      };

      source.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data);
          if (['run.started', 'run.finished', 'node.finished', 'escalation'].includes(ev.kind)) {
            fetchStatus();
          }
        } catch (err) {}
      };
    }

    // Toast 提示
    function showToast(msg, type = 'success') {
      const toast = document.getElementById('toast');
      const toastText = document.getElementById('toast-text');
      toastText.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => { toast.classList.remove('show'); }, 3000);
    }

    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  </script>
</body>
</html>
`;
