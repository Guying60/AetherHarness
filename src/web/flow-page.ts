import { CONSOLE_STYLE } from './console-style.js';
import { icon } from './icons.js';
import { consoleSidebar } from './nav.js';

export const FLOW_HTML = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AetherHarness · 工作流设计器</title><style>${CONSOLE_STYLE}</style><link rel="stylesheet" href="/studio-assets/flow-editor.css"></head>
<body>${consoleSidebar('', '/workflows')}
<div class="surface">
  <header class="topbar">
    <div class="crumbs"><span class="root">AetherHarness</span><span class="sep" aria-hidden="true">${icon('chevronRight')}</span><strong>工作流设计器</strong></div>
  </header>
  <main id="flow-root"><p class="shell" role="status">正在加载工作流设计器…</p></main>
</div>
<script type="module" src="/studio-assets/flow-editor.js"></script></body></html>`;
