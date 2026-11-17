import type { Orchestrator, RunSnapshot } from '../orchestrator.js';
import type { OrchestratorEvent, SelfLoopConfig, VerificationResult, WorkflowDefinition, WorkflowNode } from '../types/index.js';

type Snapshot = ReturnType<Orchestrator['getSnapshot']>;
type RunSummary = Pick<RunSnapshot, 'runId' | 'taskId' | 'title' | 'status' | 'startedAt' | 'finishedAt' | 'humanDecision' | 'retryOf'> & {
  verificationPassed?: boolean;
  verificationScore?: number;
};
type Page = 'workbench' | 'execution' | 'agents' | 'delivery' | 'settings';
interface DashboardData {
  account: { username: string; role: 'operator' | 'viewer' };
  tasks: Array<{ id: string; title: string; description: string; prompt: string; difficulty: string; workflow: WorkflowDefinition }>;
  repository: ReturnType<Orchestrator['getProject']>;
  persistentStorage: boolean;
  /** process + definition-store telemetry for the sidebar runtime card */
  runtime?: { rss: number; uptimeMs?: number; agents: number; teams: number; workflows: number };
  agents: Array<Snapshot['agents'][number] & { version: string; toolIds: string[]; capabilities: Record<string, number> }>;
  scheduler: Snapshot['scheduler'];
  pending: Array<{ runId: string; nodeId: string; basePriority: number; effectivePriority: number; submittedAt: number }>;
  tools: Snapshot['tools'];
  llm: Snapshot['llm'];
  knowledgeChunks: number;
  optimizations: ReturnType<Orchestrator['getPromptOptimizations']>;
  runs: RunSummary[];
  run: (Omit<RunSnapshot, 'state' | 'definitions' | 'requestKey'> & { design?: {
    kind: string; executionHash: string;
      workflow?: { id: string; revision: number; hash: string; name: string };
    team?: { id: string; revision: number; hash: string; name: string };
    agents: Array<{ id: string; memberId: string; revision: number; hash: string; name: string }>;
  } }) | null;
  events: OrchestratorEvent[];
  settings: ReturnType<Orchestrator['getSettings']>;
}

interface AgentHistory {
  versions: Array<{ version: string; toolIds: string[]; maxConcurrency: number }>;
  activity: Array<{ runId: string; title: string;
    dispatches: Array<{ at: number; nodeId: string; priority: number; waitMs: number }>;
    reviews: Array<{ iteration: number; role: string; approved?: boolean }> }>;
}

/** Browser entry point. Everything it uses at runtime is defined inside this function. */
export function dashboard(): void {
  const scenarios: Record<string, { title: string; detail: string; label: string; color: string; action: string }> = {
    'rl-easy': {
      title: '基线验收',
      detail: '固定窗口单点计数，基础负载压力测试；快速验证单个 Agent 的边界判断与单体纠错。',
      label: 'L1 入门级', color: '', action: '启动运行'
    },
    'rl-normal': {
      title: '边界缺陷自愈',
      detail: '滑动窗口算法，多并发竞争与自愈验证；观察双代理协作下的锁粒度与重试退避。',
      label: '推荐基线', color: 'violet', action: '启动运行'
    },
    'rl-hard': {
      title: '分布式对账阻塞',
      detail: '分布式令牌桶，跨节点对账无法满足；观察系统在收敛失败时如何请求人工决策。',
      label: 'L3 级联高危', color: '', action: '启动运行'
    }
  };
  const nodeNames: Record<string, string> = {
    n_requirement: '需求分析', n_architecture: '架构设计', n_complexity_gate: '复杂度判断',
    n_loop_full: '完整自愈', n_loop_quick: '快速验证', n_develop: '开发修复',
    n_verify: '三层验证', n_scan: '静态扫描', n_patch: '生成补丁',
    n_git_baseline: '读取 Git 基线', n_baseline_checks: '并行基线检查',
    n_baseline_test: '运行基线测试', n_baseline_scan: '基线静态扫描',
    n_delivery: 'Git 交付子流程', n_git_patch_check: '检查 Git 补丁'
  };
  const nodeTypes: Record<string, string> = {
    agent: 'Agent 节点', condition: '条件分支', self_loop: 'PDCA 自愈循环',
    verification: '验证节点', tool: '工具节点', parallel_group: '并行分组', subworkflow: '子工作流'
  };
  const roles: Record<string, string> = {
    requirement_analyst: '需求分析', architect: '架构设计', developer: '开发',
    code_reviewer: '代码评审', security_auditor: '安全审计', critic: '根因诊断'
  };
  const tools: Record<string, string> = {
    code_sandbox: '代码沙箱', test_runner: '测试执行器', static_analyzer: '静态分析器', git_patch_manager: 'Git 补丁生成器',
    git_read_baseline: 'Git 基线读取', git_check_patch: 'Git 补丁应用检查', container_test_runner: '容器验收'
  };
  const capabilities: Record<string, string> = {
    requirement_engineering: '需求分析', system_architecture: '架构设计', code_generation: '代码生成',
    code_review: '代码评审', security_audit: '安全审计', root_cause_analysis: '根因诊断'
  };
  const statusNames: Record<string, [string, string]> = {
    pending: ['待执行', ''], running: ['运行中', 'active'], paused: ['已暂停', 'warn'],
    cancelling: ['正在取消', 'warn'], cancelled: ['已取消', ''],
    completed: ['已完成', 'good'], failed: ['执行失败', 'bad'], needs_human: ['待人工决策', 'warn'],
    skipped: ['未进入', ''], retry: ['已发起重试', 'active'], review: ['草稿待复审', 'warn'], abort: ['已终止', 'bad']
  };
  const tierNames: Record<string, string> = { 'Tier-1': '静态规则', 'Tier-2': '沙箱测试', 'Tier-3': '多 Agent 交叉审查' };
  const actions = [
    { label: '加倍轮数并重试', detail: '创建一次新运行，保留本次验证记录。' },
    { label: '保留草稿待复审', detail: '生成供人工检查的草稿补丁，保留原验证结论。' },
    { label: '终止并回退', detail: '回到本次执行的最近检查点，取消草稿交付。' }
  ];
  const eventNames: Record<string, string> = {
    'run.started': '启动', 'run.finished': '运行结束', 'node.started': '节点启动', 'node.finished': '节点结束',
    'loop.iteration': '迭代', verify: '验证', escalation: '人工决策', scheduler: '调度', log: '引擎'
  };

  const get = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!
  );
  const pct = (score: number) => (score * 100).toFixed(1) + '%';
  const time = (value: number) => new Date(value).toLocaleTimeString('zh-CN', { hour12: false });
  const duration = (ms: number) => ms < 1000 ? ms + ' ms' : (ms / 1000).toFixed(1) + ' s';
  const badge = (label: string, color = '') => '<span class="badge ' + color + '">' + esc(label) + '</span>';
  const stateBadge = (status: string) => badge(...(statusNames[status] ?? [status, '']));
  const empty = (message: string) => '<p class="empty">' + esc(message) + '</p>';
  const nodeName = (id: string, fallback?: string) => nodeNames[id] ?? fallback ?? id;
  const active = (run: RunSummary) => run.status === 'pending' || run.status === 'running' || run.status === 'cancelling';
  const routeRun = () => /^\/runs\/(run-\d+)(?:\/delivery)?$/.exec(location.pathname)?.[1];
  const routePage = (): Page => location.pathname === '/agents' ? 'agents' : location.pathname === '/settings' ? 'settings' :
    location.pathname === '/delivery' || location.pathname.endsWith('/delivery') ? 'delivery' :
      location.pathname.startsWith('/runs') ? 'execution' : 'workbench';
  const routeScenario = () => new URLSearchParams(location.search).get('scenario');
  const pageNames = { workbench: '工作台', execution: '任务执行', agents: 'Agent 中心', delivery: '验收与交付', settings: '系统设置' };
  const runPath = (id: string, view: 'execution' | 'delivery' = 'execution') =>
    '/runs/' + encodeURIComponent(id) + (view === 'delivery' ? '/delivery' : '');
  const runTitle = (run: Pick<RunSnapshot, 'taskId' | 'title'>) => scenarios[run.taskId]?.title ?? run.title ?? taskName(run.taskId);

  let data: DashboardData | undefined;
  let page = routePage();
  let requestedRun = routeRun() ?? (routeScenario() ? '' : undefined);
  let routePath = location.pathname + location.search;
  let unavailableRun: string | undefined;
  let taskId = routeScenario() ?? 'rl-normal';
  let nodeId = '';
  let tab = page === 'delivery' ? 'result' : 'flow';
  let settingsTab = 'model';
  let runsTab: 'all' | 'active' | 'done' = 'all';
  let connected = false;
  let stream: EventSource | undefined;
  let streamRun: string | undefined;
  let refreshFailed = false;
  let starting = false;
  let deciding = '';
  let decisionError = '';
  let decisionReason = '';
  const agentHistories = new Map<string, AgentHistory | string>();
  let refreshing = false;
  let refreshAgain = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const rendered: Record<string, string> = {};

  const taskName = (id: string) => data?.repository.project?.id === id ? data.repository.project.title :
    scenarios[id]?.title ?? data?.tasks.find(task => task.id === id)?.title ?? id;
  const agentName = (id: string) => data?.agents.find(agent => agent.id === id)?.name ?? id;

  function show(id: string, html: string): void {
    if (rendered[id] === html) return;
    rendered[id] = html;
    const container = get(id);
    const active = document.activeElement;
    const focus = active instanceof HTMLElement && container.contains(active) ? active.dataset.focus : undefined;
    const open = new Map(Array.from(container.querySelectorAll<HTMLDetailsElement>('details[id]'), item => [item.id, item.open]));
    container.innerHTML = html;
    for (const item of container.querySelectorAll<HTMLDetailsElement>('details[id]')) {
      if (open.has(item.id)) item.open = open.get(item.id)!;
    }
    if (focus) {
      Array.from(container.querySelectorAll<HTMLElement>('[data-focus]'))
        .find(element => element.dataset.focus === focus)?.focus({ preventScroll: true });
    }
  }

  function setConnection(label: string, color: string): void {
    const pill = get('connection');
    const tone = color === 'good' ? '' : color === 'bad' ? 'bad' : 'warn';
    const next = ('conn ' + tone).trim();
    if (pill.className !== next) pill.className = next;
    const text = get('connection-label');
    if (text.textContent !== label) text.textContent = label;
  }

  function notice(message: string, error = false): void {
    const element = get('notice');
    element.textContent = message;
    element.dataset.error = String(error);
  }

  function renderPage(): void {
    for (const section of document.querySelectorAll<HTMLElement>('[data-page]')) {
      section.hidden = !section.dataset.page?.split(' ').includes(page);
    }
    for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-nav]')) {
      if (link.dataset.nav === page) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    get('current-page').textContent = pageNames[page];
    document.title = 'AetherHarness · ' + pageNames[page];
    get('execution-body').hidden = page !== 'execution';
    get('delivery-body').hidden = page !== 'delivery';
    get('execution-title').textContent = page === 'delivery' ? '验收与交付' : '任务执行中心';
  }

  function render(): void {
    renderPage();
    if (!data) return;
    const run = data.run?.runId === requestedRun ? data.run : null;
    const task = data.tasks.find(item => item.id === taskId) ?? (run?.project ? undefined : data.tasks[0]);
    const live = !data.llm.label.startsWith('offline');
    const busy = data.runs.some(active);
    const telemetry = data.llm.telemetry;
    const canOperate = data.account.role === 'operator';
    get('session-name').textContent = data.account.username + ' · ' + (canOperate ? '操作者' : '只读');
    get('sign-out').hidden = false;
    get('storage-status').textContent = data.persistentStorage ? '历史与证据已启用本地持久化' : '运行历史保存在当前进程';
    const runtime = data.runtime;
    if (runtime) {
      get('rt-memory').textContent = megabytes(runtime.rss);
      get('rt-defs').textContent = String(runtime.agents + runtime.teams) + ' 项';
      get('rt-flows').textContent = String(runtime.workflows) + ' 项';
    }
    get('mode').textContent = live ? '实时模型 · ' + data.llm.label + (telemetry ?
      ' · 调用 ' + telemetry.calls + ' 次 · 降级 ' + telemetry.fallbacks + ' 次' : '') :
      '离线演示 · 确定性 Agent';
    get('mode').className = 'mode-pill' + (live ? ' live' : '');
    get('bus-state').className = 'live' + (connected ? '' : ' warn');
    get('bus-label').textContent = connected ? '编排总线在线' : '编排总线重连中';
    get<HTMLButtonElement>('run-all').hidden = !canOperate;
    get<HTMLButtonElement>('run-all').disabled = starting || busy || data.tasks.length === 0;
    const { project, ready, reason } = data.repository;
    get('project-status').textContent = ready && project
      ? project.filePath + ' @ ' + project.revision.slice(0, 12) + ' · 目标文件将发送至配置的模型端点。'
      : reason ?? '仓库任务不可用。';
    get('repo-badge').textContent = ready ? '已就绪' : '未配置';
    get('repo-badge').className = 'badge' + (ready ? ' good' : '');
    get('schema-badge').className = 'badge ' + (ready ? 'good' : 'warn');
    get('schema-badge').innerHTML = '<i class="dot"></i>' + (ready ? 'Ready · 可提交编排' : 'Awaiting Input Schema');
    get('repo-target').textContent = project ? 'Target: ' + project.filePath : 'Target: —';
    get('repo-tree').textContent = ready ? 'CLEAN TREE' : 'DISCONNECTED';
    get('repo-tree').className = ready ? 'ok' : '';
    show('project-select', project ? '<option value="' + esc(project.id) + '">' +
      esc('repo: ' + project.title + ' (' + project.revision.slice(0, 7) + ')') + '</option>' : '<option value="">无配置仓库</option>');
    get<HTMLSelectElement>('project-select').disabled = !canOperate || !ready;
    get('project-form').hidden = !canOperate;
    // The goal draft never needs a repository: only dispatch does. Keeping the
    // textarea editable lets an operator prepare a brief before configuring one.
    get<HTMLTextAreaElement>('project-goal').disabled = !canOperate;
    get<HTMLButtonElement>('project-sample').disabled = !canOperate;
    get<HTMLButtonElement>('project-submit').disabled = !canOperate || starting || !ready ||
      data.runs.some(item => item.taskId === project?.id && active(item));

    renderPresets(canOperate, task?.id, starting);
    renderKpi();
    renderRuns();

    if (page === 'agents' || page === 'settings') {
      renderOperations(data);
      return;
    }
    if (page === 'workbench') return;

    const history = get<HTMLSelectElement>('run-history');
    const selectedTitle = run ? runTitle(run) : task ? taskName(task.id) : '';
    show('run-history', '<option value="">' + (page === 'delivery' ? '最近结束的运行' : '预览 · ' + esc(selectedTitle)) + '</option>' +
      data.runs.slice().reverse().map(item => '<option value="' + esc(item.runId) + '">' +
        esc(item.runId + ' · ' + runTitle(item) + ' · ' + (statusNames[item.humanDecision ?? item.status]?.[0] ?? item.status)) +
        '</option>').join(''));
    history.disabled = data.runs.length === 0;
    history.value = requestedRun ?? '';

    show('run-caption', run ? '<strong>' + esc(selectedTitle) + '</strong> <span class="mono">' + esc(run.runId) +
      '</span> ' + stateBadge(run.humanDecision ?? run.status) : '');
    if (page === 'execution') {
      get('flow-panel').hidden = tab !== 'flow';
      get('execution-evidence').hidden = tab === 'flow';
      if (tab === 'flow') renderWorkflow(run?.workflow ?? task?.workflow, run);
      renderRun(run, selectedTitle, run?.goal ?? task?.prompt);
      renderRunAgents(run);
      renderDock(run);
    } else {
      get('delivery-summary').hidden = tab !== 'result';
      get('delivery-evidence').hidden = tab === 'result';
      if (tab === 'result') renderDelivery(run);
    }
    renderEvidence(run);
  }

  function metric(label: string, value: string): string {
    return '<div class="inset metric"><span class="muted small">' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>';
  }

  /** bytes -> "142 MB" (sidebar runtime card) */
  function megabytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '—';
    return Math.round(bytes / 1048576) + ' MB';
  }

  /** ms -> "02:14" (runs table duration column) */
  function clock(ms: number): string {
    const total = Math.max(0, Math.round(ms / 1000));
    return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  }

  function scoreClass(value: number | undefined): string {
    if (typeof value !== 'number') return 'quiet';
    if (value >= 0.9) return 'ok';
    if (value >= 0.8) return '';
    return value >= 0.6 ? 'warn' : 'bad';
  }

  /** status pill for one run row — a human decision outranks machine status */
  function runPill(item: RunSummary): string {
    const state = item.humanDecision ?? item.status;
    const tone = state === 'completed' ? 'done'
      : state === 'failed' || state === 'cancelled' ? 'failed'
        : state === 'needs_human' || state === 'paused' || item.humanDecision ? 'human'
          : state === 'pending' ? 'queued' : 'running';
    const label = statusNames[state]?.[0] ?? state;
    return '<span class="pill ' + tone + '"><i class="dot"></i>' + esc(label) + '</span>';
  }

  function runRow(item: RunSummary): string {
    const state = item.humanDecision ?? item.status;
    const canAct = data?.account.role === 'operator';
    const url = runPath(item.runId);
    const elapsed = item.finishedAt
      ? clock(item.finishedAt - item.startedAt)
      : state === 'pending' ? '00:00' : clock(Date.now() - item.startedAt);
    const action = state === 'pending' && canAct
      ? '<button type="button" class="row-btn quiet" data-cancel-run="' + esc(item.runId) + '">取消</button>'
      : state === 'running' || state === 'cancelling'
        ? '<a class="row-btn primary" data-route href="' + url + '">进入</a>'
        : state === 'needs_human' || state === 'paused'
          ? '<a class="row-btn warn" data-route href="' + url + '">审批</a>'
          : state === 'failed'
            ? '<a class="row-btn bad" data-route href="' + url + '">复盘</a>'
            : '<a class="row-btn" data-route href="' + url + '">查看</a>';
    return '<tr>' +
      '<td><button type="button" class="run-id" data-select-run="' + esc(item.runId) + '">' + esc(item.runId) + '</button></td>' +
      '<td><span class="run-scenario"><span>' + esc(item.taskId) + '</span><strong>' + esc(runTitle(item)) + '</strong></span></td>' +
      '<td>' + runPill(item) + '</td>' +
      '<td><span class="run-score ' + scoreClass(item.verificationScore) + '">' +
      (typeof item.verificationScore === 'number' ? item.verificationScore.toFixed(2) : '—') + '</span></td>' +
      '<td><span class="run-time">' + elapsed + '</span></td>' +
      '<td>' + action + '</td>' +
      '</tr>';
  }

  function renderPresets(canOperate: boolean, selected: string | undefined, starting: boolean): void {
    const tasks = data?.tasks ?? [];
    get('preset-count').textContent = 'Presets ' + tasks.length + '/' + tasks.length;
    show('scenario-cards', tasks.map(item => {
      const copy = scenarios[item.id];
      const running = (data?.runs ?? []).some(record => record.taskId === item.id && active(record));
      const loops = item.workflow.nodes
        .map(node => node.selfLoopConfig)
        .filter((config): config is SelfLoopConfig => !!config);
      const rounds = loops.reduce((max, config) => Math.max(max, config.maxIterations), 0);
      const threshold = loops.reduce((max, config) => Math.max(max, config.convergenceThreshold), 0);
      const featured = item.id === 'rl-normal';
      return '<article class="preset' + (featured ? ' featured' : '') + '" data-task="' + esc(item.id) +
        '" aria-current="' + (item.id === selected ? 'true' : 'false') + '">' +
        '<div class="preset-top"><span class="preset-id"><i class="dot"></i>' + esc(item.id) + '</span>' +
        badge(copy?.label ?? item.difficulty, copy?.color) + '</div>' +
        '<div class="preset-body"><h3>' + esc(taskName(item.id)) + '</h3><p>' +
        esc(copy?.detail ?? item.description) + '</p></div>' +
        '<dl class="preset-metrics">' +
        '<div><dt>节点数</dt><dd>' + item.workflow.nodes.length + '</dd></div>' +
        '<div><dt>轮次</dt><dd>' + rounds + '</dd></div>' +
        '<div><dt>阈值</dt><dd class="' + (featured ? 'accent' : item.id === 'rl-hard' ? 'warn' : 'ok') + '">' +
        threshold.toFixed(2) + '</dd></div>' +
        '</dl>' +
        '<div class="preset-actions">' +
        '<button type="button" class="btn ghost" data-preview="' + esc(item.id) + '" data-focus="preview-' +
        esc(item.id) + '">预览编排</button>' +
        (canOperate ? '<button type="button" class="btn primary" data-run="' + esc(item.id) + '" data-focus="run-' +
          esc(item.id) + '"' + (starting || running ? ' disabled' : '') + '>' +
          esc(running ? '运行中…' : '启动运行') + '</button>' : '') +
        '</div></article>';
    }).join('') || empty('当前服务没有可用的案例。'));
  }

  function renderKpi(): void {
    const runs = data?.runs ?? [];
    const running = runs.filter(active);
    const scored = runs.filter(item => typeof item.verificationScore === 'number');
    const average = scored.length
      ? scored.reduce((total, item) => total + (item.verificationScore ?? 0), 0) / scored.length : 0;
    const passed = scored.filter(item => item.verificationPassed).length;
    const capacity = Math.max(1, data?.settings.maxConcurrentRuns ?? 1);
    const today = new Date().toDateString();
    get('stat-running').textContent = String(running.length);
    get('stat-running-note').textContent = '集群负荷 ' + Math.round(running.length / capacity * 100) + '%';
    get('stat-queued').textContent = String(data?.scheduler.queued ?? 0);
    get('stat-queued-note').textContent = (data?.pending.length ?? 0) > 0
      ? (data!.pending.length + ' 个节点待派发') : '就绪待调度';
    get('stat-done').textContent = String(runs.filter(item => item.status === 'completed').length);
    get('stat-delta').textContent = '+' +
      runs.filter(item => new Date(item.startedAt).toDateString() === today).length;
    get('stat-score').textContent = average.toFixed(2);
    get('stat-score-note').textContent = '合格率 ' + (scored.length ? Math.round(passed / scored.length * 100) : 0) + '%';
  }

  function renderRuns(): void {
    const runs = data?.runs ?? [];
    const activeRuns = runs.filter(active);
    const finished = runs.filter(item => !active(item));
    get('runs-count-all').textContent = String(runs.length);
    get('runs-count-active').textContent = String(activeRuns.length);
    get('runs-count-done').textContent = String(finished.length);
    for (const button of document.querySelectorAll<HTMLElement>('[data-runs-tab]')) {
      button.setAttribute('aria-pressed', String(button.dataset.runsTab === runsTab));
    }
    const visible = (runsTab === 'active' ? activeRuns : runsTab === 'done' ? finished : runs).slice(-8).reverse();
    show('runs-tbody', visible.map(runRow).join(''));
    get('runs-table-wrap').hidden = runs.length === 0;
    get('runs-empty').hidden = runs.length > 0;
  }

  function renderWorkflow(workflow: WorkflowDefinition | undefined, run: DashboardData['run']): void {
    if (!workflow) return;
    get('workflow-version').textContent = workflow.id + ' · v' + workflow.version;
    const progress = run?.nodeProgress ?? {};
    const nodes = new Map(workflow.nodes.map(node => [node.id, node]));
    const branches = new Set(workflow.edges.filter(edge => progress[edge.from]?.branchTaken &&
      progress[edge.from].branchTaken !== edge.to).map(edge => edge.to));
    const layers = new Map([[workflow.entryNodeId, 0]]);
    for (let pass = 0; pass < workflow.nodes.length; pass++) {
      for (const { from, to } of workflow.edges) {
        const source = layers.get(from);
        if (source !== undefined) layers.set(to, Math.max(layers.get(to) ?? 0, source + 1));
      }
    }
    const stages: WorkflowNode[][] = [];
    for (const node of workflow.nodes) {
      const layer = layers.get(node.id);
      if (layer !== undefined) (stages[layer] ??= []).push(node);
    }
    const nodeButton = (node: WorkflowNode) => {
      const status = progress[node.id]?.status ?? (branches.has(node.id) || (run && run.finishedAt) ? 'skipped' : 'pending');
      return '<button type="button" class="node" data-node="' + esc(node.id) + '" data-focus="' + esc(node.id) +
        '" data-state="' + esc(status) + '" aria-pressed="' + String(node.id === nodeId) + '"><strong>' + esc(nodeName(node.id, node.name)) +
        '</strong>' + stateBadge(status) + '</button>';
    };
    const innerIds = new Set(workflow.nodes.flatMap(node => node.selfLoopConfig ?
      [node.selfLoopConfig.targetNodeId, node.selfLoopConfig.verificationNodeId] : []));
    const insideLoop = [...innerIds].map(id => nodes.get(id)).filter((node): node is WorkflowNode => !!node);
    const edges = new Set(workflow.edges.map(edge => edge.from + '/' + edge.to));
    const merges = stages.map((stage, index) => stages[index - 1]?.length === 2 && stage.length === 1 &&
      stages[index - 1].every(node => edges.has(node.id + '/' + stage[0].id)));
    const ordered = stages.flat();
    const stateOf = (node: WorkflowNode) => progress[node.id]?.status
      ?? (branches.has(node.id) || (run && run.finishedAt) ? 'skipped' : 'pending');
    show('execution-steps', ordered.map((node, index) => {
      const record = progress[node.id];
      const state = stateOf(node);
      const done = state === 'completed';
      const elapsed = record?.endTime !== undefined ? clock(record.endTime - record.startTime)
        : record?.status === 'running' ? clock(Date.now() - record.startTime) : '--:--';
      const subtitle = node.type === 'self_loop'
        ? (run?.iterations ? '当前处于第 ' + run.iterations + ' 轮修正' : '自愈循环 · 开发/验收/诊断')
        : node.agentId ? agentName(node.agentId)
          : node.toolId ? (tools[node.toolId] ?? node.toolId)
            : nodeTypes[node.type] ?? node.type;
      return '<li class="step-row ' + esc(state) + '" data-node="' + esc(node.id) + '" data-focus="step-' + esc(node.id) + '">' +
        '<span class="marker" aria-hidden="true">' + (done ? '✓' : String(index + 1)) + '</span>' +
        '<div class="body"><div class="line"><strong>' + esc(nodeName(node.id, node.name)) + '</strong>' +
        '<span class="dur">' + elapsed + '</span></div><p>' + esc(subtitle) + '</p></div></li>';
    }).join('') || empty('该工作流没有可展示的执行步骤。'));
    const finishedSteps = ordered.filter(node => stateOf(node) === 'completed').length;
    get('step-count').textContent = finishedSteps + '/' + ordered.length + ' 已完成';
    get('dag-legend').innerHTML = '<span><i class="busy"></i>运行中</span>' +
      '<span><i class="ok"></i>已完成</span><span><i></i>等待 / 未进入</span>';
    show('pipeline-flow', stages.map((stage, index) => {
      const before = stages[index - 1];
      const fork = before?.length === 1 && stage.length === 2 &&
        stage.every(node => edges.has(before[0].id + '/' + node.id));
      return '<div class="stage' + (fork ? ' fork' : merges[index] ? ' merge' : '') +
        '" style="--branch-count:' + stage.length + '">' + stage.map(node =>
          '<div class="graph-node"' + (merges[index + 1] ? ' data-merge' : '') + '>' + nodeButton(node) + '</div>').join('') + '</div>';
    }).join(''));
    const selected = nodes.get(nodeId);
    let detail = '<p class="muted small">点击节点查看下游路径、执行状态和配置。</p>';
    if (selected) {
      const record = progress[selected.id];
      const next = workflow.edges.filter(edge => edge.from === selected.id).map(edge => nodeName(edge.to, nodes.get(edge.to)?.name));
      const config = selected.selfLoopConfig;
      const parallelChildren = (selected.parallelChildIds ?? []).flatMap(id => {
        const child = nodes.get(id);
        return child ? [child] : [];
      });
      const nestedProgress = selected.type === 'subworkflow'
        ? Object.entries(progress).filter(([id]) => id.startsWith(selected.id + '/'))
        : [];
      detail = '<div class="inspector small"><p><strong>' + esc(nodeName(selected.id, selected.name)) +
        '</strong> · ' + esc(nodeTypes[selected.type] ?? selected.type) + '</p>' +
        '<p class="muted">' + esc(selected.description) + '</p>' +
        (selected.agentId ? '<p>配置 Agent · ' + esc(run?.design?.agents.find(agent => agent.memberId === selected.agentId)?.name ?? agentName(selected.agentId)) + '</p>' : '') +
        (selected.toolId ? '<p>调用工具 · ' + esc(tools[selected.toolId] ?? selected.toolId) + '</p>' : '') +
        (config ? '<p>轮数上限 ' + config.maxIterations + ' · 收敛阈值 ' + pct(config.convergenceThreshold) +
          ' · 诊断 Agent ' + esc(agentName(config.criticAgentId)) + '</p>' : '') +
        (next.length ? '<p>下游 · ' + esc(next.join(' / ')) + '</p>' : '') +
        (record?.branchTaken ? '<p>实际选中 · ' + esc(nodeName(record.branchTaken)) + '</p>' : '') +
        (record?.endTime !== undefined && selected.type !== 'verification' ?
          '<p>最近执行耗时 · ' + duration(record.endTime - record.startTime) + '</p>' : '') +
        (record?.error ? '<p>' + badge('错误', 'bad') + ' ' + esc(record.error) + '</p>' : '') +
        (parallelChildren.length ? '<div class="subnodes">' + parallelChildren.map(nodeButton).join('') + '</div>' : '') +
        (nestedProgress.length ? '<ul class="plain-list stack">' + nestedProgress.map(([id, child]) =>
          '<li class="row">' + esc(nodeName(id.split('/').at(-1)!, child.nodeName)) + ' ' +
          stateBadge(child.status) + (child.error ? ' ' + esc(child.error) : '') + '</li>'
        ).join('') + '</ul>' : '') + '</div>';
    }
    const attempts = run?.attempts?.filter(attempt => attempt.nodeId === nodeId) ?? [];
    detail += attempts.map(attempt => '<details class="small"><summary>查看实际输入与输出</summary><pre class="codeblock">' +
      esc(JSON.stringify({ input: attempt.input, output: attempt.output, error: attempt.error, meta: attempt.meta }, null, 2)) + '</pre></details>').join('');
    show('node-inspector', '<div class="stack">' + (insideLoop.length ?
      '<div><p class="muted small">自愈循环内部 · 开发、验证、诊断后决定是否重试</p><div class="subnodes">' +
      insideLoop.map(nodeButton).join('') + '</div></div>' : '') + detail + '</div>');
  }

  function renderRun(run: DashboardData['run'], title: string, prompt?: string): void {
    const brief = prompt ? '<details id="task-brief" class="small"><summary>查看任务原文</summary><p>' + esc(prompt) + '</p></details>' : '';
    const crumb = get('run-crumb');
    const report = get<HTMLAnchorElement>('run-report');
    const cancel = get<HTMLButtonElement>('run-cancel');
    if (!run) {
      crumb.textContent = requestedRun ? '读取中…' : '预览';
      get('run-status-pill').innerHTML = '';
      get('run-id').textContent = '';
      get('run-policy').textContent = title;
      get('run-meta').textContent = unavailableRun ? '未找到该运行' : '尚未选择运行';
      report.hidden = true;
      cancel.hidden = true;
      if (unavailableRun) {
        show('run-summary', empty('找不到运行 ' + unavailableRun + '。') + '<a class="link" href="/">返回工作台</a>');
        return;
      }
      show('run-summary', '<h4>' + esc(title) + '</h4>' + empty(requestedRun ?
        '正在读取所选运行…' : '当前正在预览工作流。点击案例的运行按钮开始，或通过运行历史查看已有结果。') + brief);
      return;
    }
    crumb.textContent = '运行 ' + run.runId;
    get('run-status-pill').innerHTML = runPill(run);
    get('run-id').textContent = run.runId;
    get('run-policy').textContent = run.taskId + ' · ' + runTitle(run);
    get('run-meta').textContent = '· ' + (run.requestedBy ?? '本地操作者') + ' 启动 · ' +
      (run.finishedAt ? clock(run.finishedAt - run.startedAt) + ' 结束' : clock(Date.now() - run.startedAt) + ' 已运行');
    report.hidden = !run.finishedAt;
    report.href = '/api/runs/' + encodeURIComponent(run.runId) + '/report';
    cancel.hidden = !(data?.account.role === 'operator' && (run.status === 'pending' || run.status === 'running'));
    const v = run.verification;
    const outcome = run.humanDecision;
    const description = outcome === 'retry' ? '新运行使用加倍后的自愈预算。' :
      outcome === 'review' ? '原验收规则仍有阻塞。请在代码与补丁中检查草稿。' :
      outcome === 'abort' ? '已停止交付。可以继续查看验证与执行日志。' :
      run.status === 'completed' ? (run.patch?.patch ? '验证通过，补丁可下载。' : '工作流已完成，当前没有可下载的补丁。') :
      run.status === 'pending' ? '正在等待可用的运行名额。' :
      run.status === 'running' ? '节点状态、调度和逐轮验证会随执行更新。' :
      run.status === 'cancelling' ? '正在停止执行并回收资源。' :
      run.status === 'cancelled' ? '运行已停止，保留已有执行证据。' :
      run.status === 'failed' ? run.error ?? '执行未完成，请查看执行日志。' :
      '自愈已到达本次预算，请查看阻塞原因并选择下一步。';
    let controls = '';
    const canOperate = data?.account.role === 'operator';
    const remark = (label: string) => '<label class="stack small">' + label + '（可选）' +
      '<input class="select" id="decision-reason" data-focus="decision-reason" maxlength="500" value="' +
      esc(decisionReason) + '"></label>';
    if (canOperate && (run.status === 'pending' || run.status === 'running')) {
      controls = '<div class="inset stack">' + remark('取消备注') +
        '<button type="button" class="btn danger" data-cancel data-focus="cancel-run"' + (deciding ? ' disabled' : '') +
        '>取消运行</button></div>';
    }
    if (run.escalation) {
      const card = run.escalation;
      const blocking = card.contextSnapshot.unresolvedRuleIds as string[] | undefined;
      controls = '<div class="inset decision"><h4>需要人工决策</h4><p class="small">' +
        esc(blocking?.length ? 'Agent 报告当前环境无法满足 ' + blocking.join('、') + '。' : '当前方案仍未达到收敛条件。') +
        '</p><details id="decision-' + esc(run.runId) + '" class="small"><summary>查看决策依据</summary><p>' +
        esc(card.reason) + '</p></details><div class="stack">' + (canOperate ? remark('决策备注') +
        card.options.map((option, index) => '<div><button type="button" class="btn ' +
          (index === card.recommendedOptionIndex ? 'primary' : index === 2 ? 'danger' : '') + '" data-decision="' + index +
          '" data-focus="decision-' + index + '"' + (deciding || index === 0 && run.retryAvailable === false ? ' disabled' : '') + '>' +
          esc(index === 2 && run.restored ? '终止并撤销草稿' : actions[index]?.label ?? option) + '</button><p class="small muted">' +
          (index === card.recommendedOptionIndex ? '系统推荐 · ' : '') +
          esc(index === 0 && run.retryAvailable === false ? '当前服务配置与该历史运行不匹配。' :
            index === 2 && run.restored ? '撤销草稿交付，保留本次验收证据。' : actions[index]?.detail) +
          '</p></div>').join('') : '<p class="small muted">等待操作者处理。</p>') + '</div></div>';
    }
    const retry = data?.runs.find(item => item.retryOf === run.runId);
    const design = run.design;
    const lineage = design ? '<div class="inset stack"><h4>固定版本</h4>' +
      (design.workflow ? '<p>' + esc(design.workflow.name) + ' · 工作流 v' + design.workflow.revision + '</p>' : '') +
      (design.team ? '<p>' + esc(design.team.name) + ' · v' + design.team.revision + '</p>' : '') +
      design.agents.map(agent => '<p class="small">' + esc(agent.memberId + ' · ' + agent.name) + ' · v' + agent.revision + '</p>').join('') +
      '<details class="small"><summary>执行快照指纹</summary><pre>' + esc(design.executionHash) + '</pre></details>' +
      (canOperate ? '<a class="link" href="' + (design.workflow ? '/workflows/' + esc(design.workflow.id) : design.team ? '/teams/' + esc(design.team.id) : '/studio/agents/' + esc(design.agents[0].id)) +
        '?run=' + esc(run.runId) + '">查看固定配置与测试证据</a>' : '') + '</div>' : '';
    show('run-summary', '<div class="row between"><h4>' + esc(title) + '</h4>' + stateBadge(outcome ?? run.status) + '</div>' +
      '<p class="muted small mono">' + esc(run.runId) + ' · ' + time(run.startedAt) +
      (run.finishedAt ? ' · ' + duration(run.finishedAt - run.startedAt) : '') + '</p>' +
      (run.retryOf ? '<p class="small">重试自 <button class="link" type="button" data-select-run="' + esc(run.retryOf) +
        '">' + esc(run.retryOf) + '</button></p>' : '') +
      '<div class="inset"><span class="muted small">自动验证</span><div class="row">' +
      (v ? badge(v.passed ? '通过' : '阻塞', v.passed ? 'good' : 'bad') + ' <strong>' + pct(v.score) + '</strong>' :
        '<span class="muted small">尚无最终结论</span>') +
      (run.iterations ? '<span class="muted small">已记录 ' + run.iterations + ' 轮</span>' : '') + '</div></div>' +
      '<p class="small muted">' + esc(description) + '</p>' + lineage +
      (run.cancellation ? '<p class="small muted">取消申请 · ' + esc(run.cancellation.actor + ' · ' +
        time(run.cancellation.requestedAt) + ' · ' + run.cancellation.reason) + '</p>' : '') +
      (run.modelLabel ? '<p class="small muted">运行模型 · ' + esc(run.modelLabel) + '</p>' : '') +
      (run.project ? '<p class="small muted">Git 基线 · <code>' + esc(run.project.revision.slice(0, 12)) + '</code></p>' : '') + brief +
      (outcome === 'retry' && retry ? '<button class="btn" type="button" data-select-run="' + esc(retry.runId) + '">查看本次重试</button>' : '') +
      (run.finishedAt ? '<a class="btn" data-route href="' + runPath(run.runId, 'delivery') + '">查看验收与交付</a>' : '') + controls +
      (run.finishedAt ? '<a class="btn" href="/api/runs/' + esc(run.runId) + '/report" download>下载验收报告（JSON）</a>' : '') +
      (deciding === run.runId ? '<p class="small" role="status">正在处理决策…</p>' : '') +
      (decisionError ? '<p class="notice" data-error="true" role="alert">' + esc(decisionError) + '</p>' : ''));
  }

  /** Floating metric dock under the DAG (design: "综合置信得分 / 循环轮数 / 断言覆盖 / 净耗时"). */
  function renderDock(run: DashboardData['run']): void {
    const dock = get('dag-dock');
    if (!run) { dock.innerHTML = ''; return; }
    const verification = run.verification;
    const sandbox = verification?.sandboxTestResult;
    const workflow = run.workflow ?? data?.tasks.find(item => item.id === run.taskId)?.workflow;
    const maxLoops = Math.max(0, ...(workflow?.nodes ?? []).map(node => node.selfLoopConfig?.maxIterations ?? 0));
    const elapsed = run.finishedAt ? clock(run.finishedAt - run.startedAt) : clock(Date.now() - run.startedAt);
    const budget = workflow?.timeoutMs;
    dock.innerHTML =
      '<div><dt>综合置信得分</dt><dd class="' + (verification?.passed ? 'ok' : 'accent') + '">' +
      (verification ? verification.score.toFixed(2) : '–') + ' <small>/ 1.00</small></dd></div>' +
      '<div><dt>当前循环轮数</dt><dd class="accent">' + (run.iterations ?? 0) +
      ' <small>/ ' + (maxLoops || '—') + ' max</small></dd></div>' +
      '<div><dt>断言集覆盖</dt><dd>' + (sandbox?.totalCount ?? '–') +
      ' <small>已通过 ' + (sandbox?.passedCount ?? 0) + '/' + (sandbox?.totalCount ?? 0) + '</small></dd></div>' +
      '<div><dt>净耗时指标</dt><dd>' + elapsed +
      (budget ? ' <small>SLA ' + (budget >= 60000 ? Math.round(budget / 60000) + 'm' : Math.round(budget / 1000) + 's') + '</small>' : '') + '</dd></div>';
  }

  function renderRunAgents(run: DashboardData['run']): void {
    const participation = new Map<string, Set<string>>();
    const add = (agentId: string, label: string) => {
      const labels = participation.get(agentId) ?? new Set<string>();
      labels.add(label);
      participation.set(agentId, labels);
    };
    if (run) {
      for (const event of data?.events ?? []) {
        if (event.kind === 'scheduler' && event.data?.agentId && typeof event.data.nodeId === 'string') {
          add(event.data.agentId, nodeName(event.data.nodeId));
        }
      }
      for (const round of run.loopRounds ?? []) {
        if (round.criticAgentId) add(round.criticAgentId, '根因诊断');
        for (const audit of round.verification.auditorReviews ?? []) add(audit.agentId, '交叉审查');
      }
    }
    show('run-agents', participation.size ? '<ul class="plain-list record-list">' + [...participation].map(([id, labels]) =>
      '<li><strong>' + esc(run?.design?.agents.find(agent => agent.id === id)?.name ?? agentName(id)) + '</strong><p class="muted small">' + esc([...labels].join('、')) +
      '</p></li>').join('') + '</ul>' : empty('暂无本次运行的派发或审查记录。'));
  }

  /** Composite tier weights — mirrors VerificationEngine.verify (keep in sync). */
  function tierWeights(names: string[]): Record<string, number> {
    const sandbox = names.includes('Tier-2');
    const voting = names.includes('Tier-3');
    if (sandbox && voting) return { 'Tier-1': 0.3, 'Tier-2': 0.4, 'Tier-3': 0.3 };
    if (sandbox) return { 'Tier-1': 0.4, 'Tier-2': 0.6, 'Tier-3': 0 };
    if (voting) return { 'Tier-1': 0.5, 'Tier-2': 0, 'Tier-3': 0.5 };
    return { 'Tier-1': 1, 'Tier-2': 0, 'Tier-3': 0 };
  }

  function tileOf(label: string, value: string, unit: string, tone = ''): string {
    return '<div class="stat-tile ' + tone + '"><span class="label">' + esc(label) + '</span>' +
      '<span class="value"><b>' + esc(value) + '</b><em>' + esc(unit) + '</em></span></div>';
  }

  function renderDelivery(run: DashboardData['run']): void {
    if (!run) {
      show('delivery-summary', empty(unavailableRun ? '找不到运行 ' + unavailableRun + '。' : '暂无验收结果，请选择历史运行。'));
      return;
    }
    const verification = run.verification;
    const sandbox = verification?.sandboxTestResult;
    const names = (verification?.tiers ?? []).map(tier => tier.tier);
    const weights = tierWeights(names);
    const done = run.status === 'completed' && verification?.passed && !run.humanDecision;
    const assertion = sandbox?.passedCount !== undefined && sandbox?.totalCount !== undefined
      ? sandbox.passedCount + ' / ' + sandbox.totalCount : '—';
    const coverage = sandbox?.totalCount ? Math.round((sandbox.passedCount ?? 0) / sandbox.totalCount * 100) : undefined;
    const segments = names
      .map(name => ({ name, weight: weights[name] ?? 0, tier: (verification?.tiers ?? []).find(item => item.tier === name) }))
      .filter(item => item.weight > 0);
    const bar = segments.map((item, index) =>
      '<i style="flex:' + item.weight + ';background:' +
      (index === 0 ? 'var(--accent-2)' : index === 1 ? 'var(--ok)' : 'var(--warn)') + '"></i>').join('');
    const legend = segments.map((item, index) =>
      '<span><i class="sw" style="background:' + (index === 0 ? 'var(--accent-2)' : index === 1 ? 'var(--ok)' : 'var(--warn)') + '"></i>' +
      esc(tierNames[item.name] ?? item.name) + ' · 权重 ' + Math.round(item.weight * 100) + '% · 得分 ' +
      (item.tier ? item.tier.score.toFixed(2) : '—') + '</span>').join('');

    show('delivery-summary',
      '<div class="card-head"><div class="row">' +
      '<h2>' + esc(run.runId + ' · ' + runTitle(run)) + '</h2>' +
      (verification ? badge(verification.passed ? '自动验收通过' : '自动验收阻塞', verification.passed ? 'good' : 'bad')
        : badge('暂无最终验收')) + '</div>' +
      '<span class="run-time">' + '最近一次已结束的运行' + '</span></div>' +
      '<div class="stat-row">' +
      tileOf('断言覆盖', assertion, coverage === undefined ? '' : coverage + '%', '') +
      tileOf('综合验收得分', verification ? verification.score.toFixed(2) : '—', '/ 1.00', 'accent') +
      tileOf('自愈循环轮次', run.iterations === undefined ? '—' : String(run.iterations), '轮', '') +
      tileOf('总运行时长', run.finishedAt ? clock(run.finishedAt - run.startedAt) : '—', 'mm:ss', done ? 'ok' : '') +
      '</div>' +
      (verification ? '<div class="stack" style="gap:8px"><span class="verdict-bar">' + bar + '</span>' +
        '<div class="legend">' + legend + '</div></div>' : '') +
      (verification?.blockingReasons?.length
        ? '<p class="caption">阻塞原因 · ' + esc(verification.blockingReasons.slice(0, 3).join(' | ')) + '</p>' : '') +
      '<div class="row between"><a class="link" data-route href="' + runPath(run.runId) + '">查看任务执行</a>' +
      (run.finishedAt ? '<a class="btn" href="/api/runs/' + esc(run.runId) + '/report" download>下载完整交付报告 (JSON)</a>' : '') +
      '</div>');
  }

  /** Delivery evidence: tier evidence on the left, deliverables on the right. */
  function renderDeliveryEvidence(run: NonNullable<DashboardData['run']>): string {
    const verification = run.verification;
    const tiers = verification?.tiers ?? [];
    const patch = run.patch;
    const left = tiers.map(tier => {
      const tone = tier.passed ? 'good' : 'bad';
      const head = '<div class="head"><div class="title"><h3>' + esc(tierNames[tier.tier] ?? tier.name) + '</h3></div>' +
        '<div class="row"><span class="score">' + tier.score.toFixed(2) + ' 分</span>' + badge(tier.passed ? '通过准入' : '阻塞', tone) + '</div></div>';
      let body = '';
      if (tier.tier === 'Tier-1') {
        const rules = verification?.ruleResults ?? [];
        body = rules.length ? dataTable(['规则 ID', '验证描述', '状态', '得分'], rules.map(rule =>
          '<tr><td><span class="mono">' + esc(rule.ruleId ?? rule.ruleName) + '</span></td>' +
          '<td>' + esc(rule.message) + '</td>' +
          '<td>' + badge(rule.passed ? 'PASS' : 'BLOCKED', rule.passed ? 'good' : 'bad') + '</td>' +
          '<td class="run-score ' + (rule.score >= 0.9 ? 'ok' : rule.score > 0 ? 'warn' : 'bad') + '">' +
          rule.score.toFixed(2) + '</td></tr>').join(''))
          : empty('本运行没有 Tier-1 规则断言。');
      } else if (tier.tier === 'Tier-2') {
        const sandbox = verification?.sandboxTestResult;
        body = '<div class="terminal"><div class="bar">SUITE: aether-rate-limiter-matrix' +
          '<span>' + (sandbox?.passedCount ?? 0) + ' / ' + (sandbox?.totalCount ?? 0) + ' 断言 · exit ' +
          (sandbox?.exitCode ?? '—') + '</span></div>' +
          '<pre class="' + (sandbox?.passed ? '' : 'fail') + '">' + esc(sandbox?.output ?? '没有可展示的沙箱输出。') + '</pre></div>';
      } else {
        const reviews = verification?.auditorReviews ?? [];
        body = reviews.length ? '<div class="stack">' + reviews.map(review =>
          '<div class="note-row"><div class="top"><b>' + esc(agentName(review.agentId)) + '</b>' +
          badge(review.approved ? '同意' : '拦截', review.approved ? 'good' : 'bad') + '</div>' +
          '<p>' + esc(review.comments) + '</p></div>').join('') + '</div>'
          : empty('本运行没有交叉审查记录。');
      }
      return '<section class="tier-card">' + head + body + '</section>';
    }).join('') || empty('该运行没有三层验收记录。');

    const bytes = patch?.patch ? Math.max(1, Math.round(new Blob([patch.patch]).size / 102.4) / 10) : 0;
    const right =
      '<section class="tier-card"><div class="head"><div class="title"><h3>交付物列表</h3></div>' +
      '<span class="stamp plain">' + (patch?.patch ? '1 个补丁' : '无补丁') + '</span></div>' +
      (patch?.patch
        ? '<div class="artifact-row"><span class="glyph" aria-hidden="true">±</span>' +
          '<div class="ident"><b>' + esc(patch.filePath) + '</b>' +
          '<span>' + bytes.toFixed(1) + ' KB · +' + (patch.stats?.added ?? 0) + ' / -' + (patch.stats?.removed ?? 0) + ' 行</span></div>' +
          '<span class="act"><button class="row-btn" type="button" data-tab="artifact">查看 Diff</button></span></div>'
        : empty('本次运行没有可下载的补丁。')) +
      '<div class="artifact-row"><span class="glyph ok" aria-hidden="true">≡</span>' +
      '<div class="ident"><b>' + esc(run.runId + '-report.json') + '</b>' +
      '<span>包含三层验收、执行事件与交付状态</span></div>' +
      '<span class="act"><a class="row-btn primary" href="/api/runs/' + esc(run.runId) + '/report" download>下载</a></span></div>' +
      '<div class="kv-grid">' +
      kv('自愈轮次', run.iterations === undefined ? '—' : String(run.iterations), '', true) +
      kv('事件条数', String((data?.events ?? []).length), '', true) +
      '</div></section>' +
      '<section class="tier-card"><div class="head"><div class="title"><h3>综合交付报告与归档</h3></div></div>' +
      '<p class="caption">报告汇总三层规则集、回归仿真与审查共识；导出内容不包含模型密钥或系统提示。</p>' +
      '<div class="row"><a class="btn primary" href="/api/runs/' + esc(run.runId) + '/report" download>下载完整交付报告 (JSON)</a>' +
      '<button class="btn ghost" type="button" data-copy>复制 Markdown 摘要</button></div>' +
      (verification ? '<div class="kv-grid">' +
        kv('自动验收结论', verification.passed ? 'PASSED' : 'BLOCKED', verification.passed ? 'ok' : 'accent') +
        kv('加权得分', verification.score.toFixed(2) + ' / 1.00', 'accent', true) + '</div>' : '') +
      '</section>';

    return '<div class="split-2"><div class="stack">' + left + '</div><div class="stack">' + right + '</div></div>';
  }

  function renderDeliveryTimeline(): string {
    const events = (data?.events ?? []).slice(-40).reverse();
    if (!events.length) return empty('当前没有可显示的运行事件。');
    return '<ol class="timeline">' + events.map(event => {
      const tone = event.kind === 'loop.iteration' ? 'loop' : event.tag === 'human' ? 'human'
        : event.kind.startsWith('run') ? 'run' : 'node';
      const label = eventNames[event.kind] ?? event.kind;
      const meta = event.data?.agentId ? ' · ' + agentName(event.data.agentId) : '';
      return '<li><time>' + time(event.at) + '</time>' +
        '<span class="kind ' + tone + '">' + esc(label) + '</span>' +
        '<p>' + esc(event.message) + '<span class="faint">' + esc(meta) + '</span></p></li>';
    }).join('') + '</ol>';
  }

  function verification(result: VerificationResult): string {
    return '<div class="tiers">' + (result.tiers ?? []).map(tier => '<div class="inset small"><div class="row between">' +
      '<strong>' + esc(tierNames[tier.tier] ?? tier.name) + '</strong>' +
      badge(tier.passed ? '通过' : '拦截', tier.passed ? 'good' : 'bad') + '</div><p class="muted">' +
      esc(tier.detail) + '</p></div>').join('') + '</div>' +
      (result.blockingReasons?.length ? '<div class="inset small"><strong>阻塞原因</strong><ul>' +
        result.blockingReasons.map(reason => '<li>' + esc(reason) + '</li>').join('') + '</ul></div>' : '') +
      '<div class="small"><strong>规则检查</strong><ul>' +
      result.ruleResults.map(rule => '<li>' + badge(rule.passed ? '通过' : '拦截', rule.passed ? 'good' : 'bad') + ' ' +
        esc([rule.ruleId, rule.ruleName, rule.message].filter(Boolean).join(' · ')) + '</li>').join('') + '</ul></div>' +
      (result.sandboxTestResult ? '<div class="small"><strong>沙箱输出</strong><pre class="codeblock">' +
        esc(result.sandboxTestResult.output) + '</pre></div>' : '') +
      (result.auditorReviews?.length ? '<div class="small"><strong>审查意见</strong><ul>' +
        result.auditorReviews.map(review => '<li>' + esc(agentName(review.agentId)) + ' · ' +
          badge(review.approved ? '同意' : '拦截', review.approved ? 'good' : 'bad') + ' ' +
          esc(review.comments) + '</li>').join('') + '</ul></div>' : '');
  }

  function renderEvidence(run: DashboardData['run']): void {
    for (const button of document.querySelectorAll('.tab[data-tab]')) {
      button.setAttribute('aria-pressed', String((button as HTMLElement).dataset.tab === tab));
    }
    if (tab === 'flow' || tab === 'result') return;
    const evidence = page === 'delivery' ? 'delivery-evidence' : 'execution-evidence';
    if (!run) {
      show(evidence, empty('启动案例或选择历史运行后，这里会展示该次运行的证据。'));
      return;
    }
    if (tab === 'tools') {
      const agentCalls = (run.attempts ?? []).flatMap(attempt => (attempt.meta?.toolCalls ?? []).map((call: any) => ({ ...call, nodeName: attempt.nodeName })));
      const calls = Object.entries(run.nodeProgress ?? {}).filter(([, item]) => !!item.toolId);
      const tests = (run.loopRounds ?? []).filter(round => !!round.verification.sandboxTestResult);
      const baseline = run.baselineVerification?.sandboxTestResult;
      show(evidence, '<div class="stack"><h3>本次运行的工具与测试</h3>' + (calls.length || tests.length || baseline || agentCalls.length ?
        '<ul class="plain-list record-list">' + calls.map(([id, item]) => '<li><div class="row between"><strong>' +
          esc(tools[item.toolId!] ?? item.toolId) + '</strong>' + stateBadge(item.status) + '</div><p class="small muted">' +
          esc(nodeName(id.split('/').at(-1)!, item.nodeName)) + ' · ' + time(item.startTime) +
          (item.endTime !== undefined ? ' · ' + duration(item.endTime - item.startTime) : '') +
          '</p>' + (item.error ? '<p>' + esc(item.error) + '</p>' : '') + '</li>').join('') +
        agentCalls.map(call => '<li><div class="row between"><strong>' + esc(tools[call.toolId] ?? call.toolId) + '</strong>' +
          badge(call.success ? '调用成功' : '调用失败／拒绝', call.success ? 'good' : 'bad') + '</div><p class="small muted">' +
          esc(call.nodeName) + ' · ' + duration(call.durationMs) + '</p><details><summary>调用证据</summary><pre class="codeblock">' +
          esc(JSON.stringify(call, null, 2)) + '</pre></details></li>').join('') +
        (baseline ? '<li><strong>基线沙箱测试</strong><p class="small muted">' + esc(baseline.output) + '</p></li>' : '') +
        tests.map(round => '<li><strong>第 ' + round.iteration + ' 轮沙箱测试</strong><p class="small muted">' +
          esc(round.verification.sandboxTestResult?.output) + '</p></li>').join('') + '</ul>' :
        empty('暂无工具调用或沙箱测试记录。')) + '</div>');
      return;
    }
    if (tab === 'context') {
      const goal = run.goal ?? data?.tasks.find(item => item.id === run.taskId)?.prompt;
      const plan = [...(run.plan?.acceptanceCriteria ?? []), ...(run.plan?.invariants ?? [])];
      show(evidence, '<div class="stack"><h3>任务上下文</h3>' +
        (goal ? '<div class="inset"><h4>任务描述</h4><pre>' + esc(goal) + '</pre></div>' : '') +
        (run.project ? '<div class="inset"><h4>固定仓库</h4><p class="small muted">' + esc(run.project.filePath) +
          '</p><code>' + esc(run.project.revision) + '</code></div>' : '') +
        (plan.length ? '<div class="inset"><h4>修复计划</h4><ul>' + plan.map(item => '<li>' + esc(item) + '</li>').join('') + '</ul></div>' : '') +
        (run.knowledgeHits?.length ? '<div class="inset"><h4>知识检索</h4>' + run.knowledgeHits.map(hit =>
          '<p><strong>' + esc(hit.title) + '</strong> <span class="muted">' + esc(hit.citation) + '</span></p>').join('') +
          '</div>' : '') + '</div>');
      return;
    }
    if (page === 'delivery' && tab === 'verification') {
      show(evidence, renderDeliveryEvidence(run));
      return;
    }
    if (tab === 'artifact') {
      const patch = run.patch?.patch;
      const draft = !run.verification?.passed || run.status !== 'completed' || !!run.humanDecision;
      const lines = patch?.split('\n').map(line => '<span class="' +
        (line.startsWith('+') ? 'added' : line.startsWith('-') ? 'removed' : '') + '">' + esc(line) + '</span>').join('\n');
      show(evidence, '<div class="stack">' +
        (patch ? '<div class="row between"><div class="row">' + badge(draft ? '待复审草稿' : '已验证补丁', draft ? 'warn' : 'good') +
          '<strong class="mono small">' + esc(run.patch?.filePath) + '</strong></div><div class="row">' +
          '<button type="button" class="btn" data-copy>复制补丁</button><button type="button" class="btn primary" data-download>下载补丁</button>' +
          '</div></div>' + (run.project ? '<p class="small muted">补丁已通过固定提交的 Git 应用检查。</p>' : '') +
          '<pre class="codeblock">' + lines + '</pre><p id="copy-result" class="small" role="status"></p>' :
          empty(run.artifact ? '当前没有补丁。下方可查看本次运行生成的代码。' : '当前运行没有可交付的代码或补丁。')) +
        (run.artifact ? '<details id="source-' + esc(run.runId) + '"><summary>' + (draft ? '查看代码草稿' : '查看代码') +
          '</summary><pre class="codeblock">' + esc(run.artifact) + '</pre></details>' : '') + '</div>');
      return;
    }
    if (tab === 'events') {
      if (page === 'delivery') { show(evidence, renderDeliveryTimeline()); return; }
      show(evidence, !data?.events.length ? empty('当前没有可显示的运行事件。') :
        '<p class="small muted">此运行最近 ' + data.events.length + ' 条事件，最新在前。</p><ol class="log small">' +
        data.events.slice().reverse().map(event => {
          const info = event.data;
          const label = event.tag === 'rag' ? '知识检索' : event.tag === 'human' ? '人工决策' :
            event.tag === 'llm' ? '模型降级' : eventNames[event.kind];
          const dispatch = event.kind === 'scheduler' && info?.agentId;
          const decision = event.tag === 'human' && info?.actor ? ' · ' + info.actor + ' · ' + info.reason : '';
          return '<li><time class="mono muted">' + time(event.at) + '</time>' + badge(label ?? event.kind) + ' ' +
            esc(dispatch ? nodeName(info.nodeId) + ' → ' + agentName(info.agentId) + ' · 有效优先级 ' + info.priority +
              ' · 等待 ' + duration(info.wait) : event.message + decision) + '</li>';
        }).join('') + '</ol>');
      return;
    }

    const baseline = run.baselineVerification?.sandboxTestResult;
    const baselineScan = run.baselineScan;
    const plan = [...(run.plan?.acceptanceCriteria ?? []), ...(run.plan?.invariants ?? [])];
    const rounds = run.loopRounds ?? [];
    const roundViews = rounds.map(round => {
      const threshold = run.workflow.nodes.find(node => node.id === round.nodeId)?.selfLoopConfig?.convergenceThreshold ?? 0;
      const converged = round.passed && round.score >= threshold;
      return '<details class="inset round" id="round-' + esc(run.runId + '-' + round.nodeId + '-' + round.iteration) + '">' +
        '<summary>第 ' + round.iteration + ' 轮 · ' + pct(round.score) + ' ' +
        badge(converged ? '已收敛' : '未收敛', converged ? 'good' : 'warn') + ' ' +
        (round.regression ? badge('较最佳轮次退步', 'warn') : '') +
        '</summary><div class="stack">' +
        '<p class="small muted">收敛阈值 ' + pct(threshold) + ' · 执行与验证 ' + duration(round.durationMs) +
        (round.failedRuleIds.length ? ' · 失败规则 ' + esc(round.failedRuleIds.join('、')) : '') + '</p>' +
        verification(round.verification) +
        (round.criticFeedback ? '<div class="inset small"><strong>诊断与修复建议</strong><pre>' +
          esc(round.criticFeedback) + '</pre></div>' : '') + '</div></details>';
    }).join('');
    show(evidence, '<div class="stack">' +
      (baseline ? '<details class="inset" id="baseline-' + esc(run.runId) + '"><summary>基线测试 · ' +
        (baseline.passed ? '通过' : '拦截') + '</summary><pre>' + esc(baseline.output) + '</pre></details>' : '') +
      (baselineScan ? '<details class="inset" id="baseline-scan-' + esc(run.runId) + '"><summary>基线静态扫描 · ' +
        baselineScan.length + ' 项问题</summary>' + (baselineScan.length
          ? '<ul>' + baselineScan.map(issue => '<li>' +
            esc(issue.rule + ' · 第 ' + issue.line + ' 行 · ' + issue.message) + '</li>').join('') + '</ul>'
          : '<p class="muted small">静态规则未报告问题。</p>') + '</details>' : '') +
      (plan.length ? '<details class="inset" id="plan-' + esc(run.runId) + '"><summary>需求与架构 Agent 的修复计划</summary><ul>' +
        plan.map(item => '<li>' + esc(item) + '</li>').join('') + '</ul></details>' : '') +
      (roundViews || empty(run.status === 'running' ? '第一轮验证尚未完成。' : '此运行没有可查看的自愈轮次。')) +
      (run.citations?.length ? '<details id="citations-' + esc(run.runId) + '" class="inset small"><summary>知识检索引用 · ' +
        run.citations.length + ' 条</summary><ul>' + (run.knowledgeHits?.length ? run.knowledgeHits.map(hit =>
          '<li><strong>' + esc(hit.title) + '</strong> · ' + esc(hit.id) + (hit.version ? ' · v' + esc(hit.version) : '') +
          '<p class="muted">' + esc(hit.citation) + '</p><pre>' + esc(hit.content) + '</pre></li>').join('') :
          run.citations.map(source => '<li>' + esc(source) + '</li>').join('')) +
        '</ul></details>' : '') + '</div>');
  }

  function renderOperations(snapshot: DashboardData): void {
    if (page === 'settings') {
      renderSettings(snapshot);
      return;
    }
    const s = snapshot.scheduler;
    const agents = snapshot.agents;
    const capacity = agents.reduce((total, agent) => total + agent.max, 0);
    const running = agents.reduce((total, agent) => total + agent.load, 0);
    const waiters = snapshot.pending;
    const averageWait = waiters.length
      ? waiters.reduce((total, item) => total + Math.max(0, Date.now() - item.submittedAt), 0) / waiters.length
      : s.maxObservedWaitMs;
    get('sys-id').textContent = 'aether-local';
    get('poll-label').textContent = '轮询间隔: 3s';

    const tile = (label: string, value: string, unit: string, ratio: number, tone = ''): string =>
      '<div class="stat-tile ' + tone + '"><span class="label">' + esc(label) + '</span>' +
      '<span class="value"><b>' + esc(value) + '</b><em>' + esc(unit) + '</em></span>' +
      '<span class="bar"><i style="width:' + Math.max(0, Math.min(100, Math.round(ratio * 100))) + '%"></i></span></div>';

    show('scheduler',
      '<div class="head"><div class="title"><div><h2>调度器引擎</h2>' +
      '<p class="caption">capacityKey 合并并发 · 优先级老化 · 依赖门控</p></div></div>' +
      '<div class="chip-row"><span class="stamp">路由策略 LEAST_LOAD</span>' +
      '<span class="stamp plain">已派发 ' + s.dispatches + ' · 老化提权 ' + s.agingPromotions + '</span></div></div>' +
      '<div class="stat-row">' +
      tile('并发上限', String(capacity), 'SLOTS', 1, '') +
      tile('运行中', String(running), 'ACTIVE', capacity ? running / capacity : 0, 'ok') +
      tile('排队任务', String(s.queued), 'QUEUED', capacity ? s.queued / capacity : 0, s.queued ? 'warn' : '') +
      tile('平均等待', (averageWait / 1000).toFixed(1), 'SEC', Math.min(1, averageWait / Math.max(1, 5000)), 'accent') +
      '</div>' +
      (waiters.length
        ? '<div class="queue-strip"><span class="lead">当前活跃队列: <b class="mono">#' + esc(waiters[0].nodeId) + '</b>' +
          '<span class="stamp plain">' + esc(waiters[0].runId) + '</span>' +
          'base ' + waiters[0].basePriority + ' → effective ' + waiters[0].effectivePriority +
          '<span class="count">已等待 ' + duration(Math.max(0, Date.now() - waiters[0].submittedAt)) + '</span></span>' +
          '<span class="run-time">' + (s.failed ? '调度失败 ' + s.failed + ' 次' : '无调度失败') + '</span></div>'
        : '<div class="queue-strip"><span class="lead">队列空闲 · 所有就绪任务已派发' +
          '<span class="count">最长等待 ' + duration(s.maxObservedWaitMs) + '</span></span>' +
          '<span class="run-time">并发运行全部案例可以观察队列与负载变化</span></div>'));

    get('team-count').textContent = agents.length + ' 个注册节点';
    get('team-legend').innerHTML = '<span><i class="busy"></i>运行中 (' + agents.filter(agent => agent.load > 0).length + ')</span>' +
      '<span><i class="ok"></i>空闲就绪 (' + agents.filter(agent => agent.load === 0).length + ')</span>' +
      '<span><i></i>累计 Token ' + Math.round(agents.reduce((total, agent) => total + agent.tokens, 0) / 1000) + 'k</span>';

    show('team', agents.map(agent => {
      const busy = agent.load > 0;
      const score = Math.max(0, ...Object.values(agent.capabilities));
      const initials = agent.name.slice(0, 1).toUpperCase();
      const ratio = agent.max ? agent.load / agent.max : 0;
      return '<article class="agent-tile ' + (busy ? 'busy' : 'idle') + '">' +
        '<div class="top"><span class="avatar" aria-hidden="true">' + esc(initials) + '</span>' +
        '<div class="ident"><strong>' + esc(agent.name) + '</strong>' +
        '<span>' + esc(roles[agent.role] ?? agent.role) + ' · v' + esc(agent.version) + '</span></div>' +
        '<span class="status">' + (busy
          ? '<span class="pill running"><i class="dot"></i>运行中</span>'
          : '<span class="pill done"><i class="dot"></i>空闲就绪</span>') + '</span></div>' +
        '<div class="score"><div class="row"><span>能力评分</span><b>' + (score * 10).toFixed(1) + ' / 10</b></div>' +
        '<span class="track"><i style="width:' + Math.round(score * 100) + '%"></i></span></div>' +
        '<dl class="mini"><div><dt>并发槽位</dt><dd>' + agent.load + ' / ' + agent.max + '</dd></div>' +
        '<div><dt>累计 Token</dt><dd>' + (agent.tokens >= 1000 ? (agent.tokens / 1000).toFixed(1) + 'k' : agent.tokens) + '</dd></div></dl>' +
        '<div class="foot"><span>' + esc((agent.toolIds.length ? agent.toolIds.length + ' 个工具' : '无工具') + ' · ' +
          (agent.brain.includes('llm') || agent.brain.includes('Configured') ? 'LLM' : '确定性')) + '</span>' +
        '<button class="link" type="button" data-agent-history="' + esc(agent.id) + '" data-focus="agent-history-' +
        esc(agent.id) + '">调阅历史</button></div></article>';
    }).join('') || empty('当前服务没有注册 Agent。'));

    show('system', '<div class="cockpit-card"><div class="head"><div class="title"><div>' +
      '<h2>工具调用统计</h2><p class="caption">本次进程生命周期内累计 · 知识库 ' +
      snapshot.knowledgeChunks + ' 个索引分块</p></div></div></div>' +
      (snapshot.tools.length
        ? dataTable(['工具名称', '调用次数', '成功率', '状态'], snapshot.tools.map(tool =>
          '<tr><td><span class="mono">' + esc(tool.toolId) + '</span>' +
          '<p class="caption">' + esc(tools[tool.toolId] ?? '') + '</p></td>' +
          '<td class="run-score">' + tool.calls + '</td>' +
          '<td class="run-score ' + (tool.reliability >= 0.9 ? 'ok' : tool.reliability >= 0.7 ? 'warn' : 'bad') + '">' +
          pct(tool.reliability) + '</td>' +
          '<td>' + badge(tool.reliability >= 0.9 ? '稳定' : '需关注', tool.reliability >= 0.9 ? 'good' : 'warn') + '</td></tr>').join(''))
        : empty('运行一次案例后这里会显示工具调用统计。')) + '</div>');

    show('optimizations', '<div class="cockpit-card"><div class="head"><div class="title"><div>' +
      '<h2>提示词优化</h2><p class="caption">失败规则触发的自愈约束（幂等追加）</p></div></div>' +
      '<span class="stamp plain">' + snapshot.optimizations.length + ' 条</span></div>' +
      (snapshot.optimizations.length
        ? '<div class="stack">' + snapshot.optimizations.slice().reverse().slice(0, 6).map(record =>
          '<div class="note-row"><div class="top"><b>' + esc(agentName(record.agentId)) + '</b>' +
          '<span>' + time(record.timestamp) + '</span></div>' +
          '<p>新增 ' + record.addedGuardrails.length + ' 条约束 · ' +
          esc(record.addedGuardrails.join(' / ').slice(0, 120)) + '</p></div>').join('') + '</div>'
        : empty('当验证失败触发新的提示词约束时，这里会显示优化记录。')) + '</div>');
  }

  /** Stable content fingerprint of the effective policy (FNV-1a, display only). */
  function fingerprint(value: unknown): string {
    const text = JSON.stringify(value);
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
    }
    const hex = hash.toString(16).padStart(8, '0');
    return hex.slice(0, 4) + ' ' + hex.slice(4, 8);
  }

  function kv(label: string, value: string, tone = '', mono = false): string {
    const cls = [tone, mono ? 'mono' : ''].filter(Boolean).join(' ');
    return '<div class="kv"><dt>' + esc(label) + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + value + '</dd></div>';
  }

  function dataTable(head: string[], body: string): string {
    return '<div class="table-wrap"><table class="runs-table compact"><thead><tr>' +
      head.map(item => '<th>' + esc(item) + '</th>').join('') +
      '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function calibCard(title: string, caption: string, stamp: string, body: string): string {
    return '<section class="calib-card"><div class="calib-head">' +
      '<div class="ident"><div><h3>' + esc(title) + '</h3>' +
      (caption ? '<p class="caption">' + esc(caption) + '</p>' : '') + '</div></div>' +
      (stamp ? '<span class="stamp">' + esc(stamp) + '</span>' : '') +
      '</div><div class="calib-body">' + body + '</div></section>';
  }

  function flowBudgetTable(policy: DashboardData['settings']): string {
    return dataTable(['任务', '版本', '执行预算', '自愈轮数'], policy.workflows.map(flow =>
      '<tr><td>' + esc(taskName(flow.taskId)) + '</td>' +
      '<td><span class="run-time">v' + esc(flow.version) + '</span></td>' +
      '<td class="run-time">' + (flow.timeoutMs ? duration(flow.timeoutMs) : '—') + '</td>' +
      '<td class="run-score">' + Math.max(0, ...flow.loopLimits) + ' 轮</td></tr>').join(''));
  }

  function renderSettings(snapshot: DashboardData): void {
    const policy = snapshot.settings;
    for (const button of document.querySelectorAll<HTMLElement>('[data-settings]')) {
      button.setAttribute('aria-pressed', String(button.dataset.settings === settingsTab));
    }

    const live = !snapshot.llm.label.startsWith('offline');
    const runtime = snapshot.runtime;
    get('settings-stamp').innerHTML = '<i class="dot"></i>STRICT_READONLY<span class="sep">|</span>ENV: ' +
      (live ? 'LIVE' : 'OFFLINE');
    get('settings-lock').textContent = snapshot.persistentStorage ? '数据目录加锁' : '内存模式';
    get('settings-digest').textContent = fingerprint(policy);
    get('settings-uptime').textContent = 'UPTIME · ' + duration(runtime?.uptimeMs ?? 0);
    get('settings-memory').textContent = 'RSS ' + megabytes(runtime?.rss ?? 0);

    if (settingsTab === 'tools') {
      const rows = policy.tools.map(tool => {
        const bound = snapshot.agents.filter(agent => agent.toolIds.includes(tool.id)).length;
        return '<tr><td><span class="mono">' + esc(tool.id) + '</span>' +
          '<p class="caption">' + esc(tool.description) + '</p></td>' +
          '<td>' + (bound ? bound + ' 个 Agent' : '未绑定') + '</td>' +
          '<td class="run-time">' + (tool.timeoutMs ? duration(tool.timeoutMs) : '—') + '</td>' +
          '<td>' + (tool.isSandboxed ? '隔离进程' : '进程内') + '</td>' +
          '<td>' + badge(bound ? '运行时就绪' : '待绑定', bound ? 'good' : '') + '</td></tr>';
      }).join('');
      show('settings-policy',
        calibCard('工具权限矩阵', policy.tools.length + ' 项本地及沙盒运行时工具已校验并登记',
          'SANDBOX: ' + (policy.tools.some(tool => tool.isSandboxed) ? 'ISOLATED' : 'IN_PROCESS'),
          dataTable(['工具标识', '授权作用域', '调用时限', '隔离级别', '状态'], rows)) +
        calibCard('权限模型', 'Agent、团队与平台策略的交集决定一次调用是否放行', 'ACL_INTERSECTION',
          '<div class="kv-grid">' +
          kv('判定顺序', 'Agent 白名单 → 团队白名单 → 平台策略', '', false) +
          kv('越权行为', '拒绝并记录 tool.denied 事件', 'accent', false) +
          '</div>'));
      return;
    }

    if (settingsTab === 'strategy') {
      const threshold = Math.max(0, ...(data?.tasks ?? []).flatMap(task =>
        task.workflow.nodes.map(node => node.selfLoopConfig?.convergenceThreshold ?? 0)));
      show('settings-policy',
        calibCard('执行策略', '自主代理协同收敛、并发上限及回归阻断阀门', 'CONTROL_LOCK: ENGAGED',
          '<div class="kv-grid">' +
          kv('最大并发运行 (Concurrency)', String(policy.maxConcurrentRuns), '', true) +
          kv('老化时间常数 (τ)', policy.scheduler.agingIntervalMs + ' ms', '', true) +
          kv('调度等待上限', duration(policy.scheduler.maxWaitMs), '', true) +
          kv('节点重试上限', String(policy.scheduler.maxRetries), '', true) +
          kv('收敛阈值 (Convergence)', threshold ? threshold.toFixed(2) : '—', 'accent', true) +
          kv('回归保护 (regressionGuard)', 'ENGAGED · 交付历史最佳', 'ok', false) +
          '</div>') +
        calibCard('工作流预算', '每个固定版本声明的时间与轮次上限', 'BUDGET_ENFORCED', flowBudgetTable(policy)));
      return;
    }

    if (settingsTab === 'runtime') {
      const { project, ready, reason } = snapshot.repository;
      const rows: Array<[string, string, string]> = [
        ['控制台端口 (AETHER_PORT)', location.port || '80', '启动参数 --port'],
        ['数据目录 (AETHER_DATA_DIR)', snapshot.persistentStorage ? '已启用 · 原子写入' : '内存模式 · 重启丢失', '环境变量'],
        ['模型端点', snapshot.llm.label, '环境变量 / --base-url'],
        ['固定 Git 仓库', project ? project.filePath : '未配置', 'AETHER_PROJECT_REPO'],
        ['固定基线提交', project ? project.revision.slice(0, 12) : '—', 'AETHER_PROJECT_BASE'],
        ['固定验收镜像', project ? project.runnerImage.slice(0, 26) + '…' : '—', 'AETHER_RUNNER_IMAGE'],
        ['定义库 / 工作流', (runtime ? runtime.agents + runtime.teams : 0) + ' 项 / ' +
          (runtime ? runtime.workflows : 0) + ' 项', '本地 JSON 存储']
      ];
      show('settings-policy',
        calibCard('运行环境', '宿主与守护进程参数清单（只读）', live ? 'ENV: PRODUCTION' : 'ENV: LOCAL',
          dataTable(['配置项 / 环境变量名', '当前生效值', '参数来源'], rows.map(row =>
            '<tr><td><span class="mono">' + esc(row[0]) + '</span></td>' +
            '<td class="run-time">' + esc(row[1]) + '</td>' +
            '<td class="run-time">' + esc(row[2]) + '</td></tr>').join(''))) +
        calibCard('不可变约束', '部署侧改动的影响范围', 'CLUSTER_ADMIN_IMMUTABLE',
          '<div class="kv-grid">' +
          kv('修改必须重启服务', '端口、模型与数据目录均来自启动参数', '', false) +
          kv('端口变化', '会话 Cookie 失效，需要重新登录', 'accent', false) +
          '</div>' + (ready || !reason ? '' :
            '<p class="caption">' + esc(reason) + '</p>')));
      return;
    }

    const [engine, endpoint] = snapshot.llm.label.split(' @ ');
    const model = policy.model;
    const telemetry = snapshot.llm.telemetry;
    show('settings-policy',
      calibCard('模型 · LLM 配置', '主推理大脑网络连接参数及流水线容灾设定',
        model ? 'ENGINE: ACTIVE' : 'ENGINE: OFFLINE',
        '<div class="kv-grid">' +
        kv('模型代号 (Model ID)', esc(engine), '', true) +
        kv('API 端点 (Base URL)', esc(endpoint ?? (model ? '—' : '离线确定性大脑 · 不联网')), '', true) +
        kv('单次请求超时 (Timeout)', model?.timeoutMs ? duration(model.timeoutMs) : '—', '', true) +
        kv('回退策略 (Fallback)', model ? (model.strict ? '关闭 · 严格模式' : '启用 · 允许降级') : '离线大脑',
          model ? (model.strict ? 'accent' : 'ok') : '') +
        kv('遥测探针 (Telemetry)', telemetry ? '开启 · ' + telemetry.calls + ' 次调用' : '关闭 (OPT_OUT)',
          telemetry ? 'ok' : '') +
        kv('输出与重试上限', model ? model.maxTokens + ' Token · ' + model.maxRetries + ' 次' : '—', '', true) +
        '</div>') +
      calibCard('决断流水线拓扑定义', '每个任务的固定 DAG 预算', 'DETERMINISTIC_DAG', flowBudgetTable(policy)));
  }

  function agentHistory(id: string): string {
    const history = agentHistories.get(id);
    if (typeof history === 'string') return '<p class="small" role="status">' + esc(history) + '</p>';
    if (!history) return '';
    return '<div class="small"><p class="muted">注册版本历史</p>' +
      (history.versions.length ? '<ul>' + history.versions.map(version => '<li>v' + esc(version.version) +
        ' · 并发 ' + version.maxConcurrency + ' · ' + esc(version.toolIds.map(tool => tools[tool] ?? tool).join('、')) +
        '</li>').join('') + '</ul>' : '<p>当前版本尚无注册变更。</p>') +
      '<p class="muted">最近参与的运行</p>' + (history.activity.length ? '<ul>' + history.activity.map(item =>
        '<li><a data-route href="' + runPath(item.runId) + '">' + esc(item.runId + ' · ' + item.title) + '</a>' +
        '<p>' + esc([...item.dispatches.map(dispatch => nodeName(dispatch.nodeId) + '（优先级 ' + dispatch.priority + '）'),
          ...item.reviews.map(review => '第 ' + review.iteration + ' 轮' +
            (review.role === 'critic' ? '诊断' : review.approved ? '审查通过' : '审查拦截'))].join('、')) +
        '</p></li>').join('') + '</ul>' : '<p>尚无可查看的活动。</p>') + '</div>';
  }

  async function request<T>(url: string, body?: object): Promise<T> {
    const response = await fetch(url, body ? {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    } : undefined);
    if (response.status === 401) {
      stream?.close();
      location.replace('/login?expired=1&next=' + encodeURIComponent(location.pathname));
    }
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? 'HTTP ' + response.status);
    return payload;
  }

  function scheduleRefresh(): void {
    if (timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      void refresh();
    }, 90);
  }

  function connectEvents(runId?: string): void {
    if (stream && streamRun === runId) return;
    stream?.close();
    connected = false;
    streamRun = runId;
    const source = new EventSource(runId ? '/api/runs/' + encodeURIComponent(runId) + '/events' : '/api/events');
    stream = source;
    const refreshCurrent = () => {
      if (stream === source) scheduleRefresh();
    };
    source.onopen = () => {
      if (stream !== source) return;
      connected = true;
      scheduleRefresh();
    };
    source.onmessage = refreshCurrent;
    source.addEventListener('reset', refreshCurrent);
    source.onerror = () => {
      if (stream !== source) return;
      connected = false;
      scheduleRefresh();
    };
  }

  async function refresh(): Promise<void> {
    if (refreshing) {
      refreshAgain = true;
      return;
    }
    refreshing = true;
    const selection = requestedRun;
    const selectedRoute = routePath;
    try {
      const query = new URLSearchParams();
      if (page === 'delivery') query.set('view', 'delivery');
      if (page !== 'delivery' && page !== 'execution') query.set('runId', '');
      else if (selection !== undefined) query.set('runId', selection);
      const snapshot = await request<DashboardData>('/api/dashboard?' + query);
      if (selectedRoute !== routePath || selection !== requestedRun) return;
      data = snapshot;
      refreshFailed = false;
      unavailableRun = snapshot.run ? undefined : selection || undefined;
      if (snapshot.run) {
        requestedRun = snapshot.run.runId;
        taskId = snapshot.run.taskId;
      }
      const linkedRun = routeRun();
      connectEvents(linkedRun === snapshot.run?.runId ? linkedRun : undefined);
      setConnection(connected ? '实时已连接' : '定时刷新中', connected ? 'good' : 'warn');
      render();
    } catch {
      refreshFailed = true;
      setConnection('连接异常 · 正在重试', 'bad');
      if (!data) show('scenario-cards', empty('暂时无法加载案例，请确认 Web 服务已启动。页面会自动重试。'));
    } finally {
      refreshing = false;
      if (refreshAgain) {
        refreshAgain = false;
        scheduleRefresh();
      }
    }
  }

  function syncRoute(focus: boolean): void {
    routePath = location.pathname + location.search;
    page = routePage();
    requestedRun = routeRun() ?? (routeScenario() ? '' : undefined);
    unavailableRun = undefined;
    const match = data?.runs.find(run => run.runId === requestedRun);
    taskId = routeScenario() ?? match?.taskId ?? 'rl-normal';
    nodeId = '';
    tab = page === 'delivery' ? 'result' : 'flow';
    decisionError = '';
    decisionReason = '';
    render();
    if (focus) {
      const heading = page === 'workbench' ? 'heading' : page === 'agents' ? 'team-title' :
        page === 'settings' ? 'settings-title' : 'execution-title';
      get(heading).focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
    scheduleRefresh();
  }

  function navigate(path: string): void {
    if (routePath !== path) window.history.pushState(null, '', path);
    notice('');
    syncRoute(true);
  }

  function selectRun(id: string | undefined, view: 'execution' | 'delivery' = 'execution'): void {
    navigate(id ? runPath(id, view) : view === 'delivery' ? '/delivery' :
      id === '' ? '/runs?scenario=' + encodeURIComponent(taskId) : '/runs');
  }

  async function start(id: string, goal?: string): Promise<void> {
    if (starting || data?.account.role !== 'operator') return;
    starting = true;
    render();
    try {
      const result = goal === undefined
        ? await request<{ runId?: string }>('/api/tasks/run', { taskId: id })
        : await request<{ runId: string }>('/api/runs', { projectId: id, goal });
      if (id !== 'all') taskId = id;
      selectRun(result.runId);
      notice(id === 'all' ? '并发演示已启动。可用运行历史切换各案例。' : '已启动' + taskName(id) + '。');
    } catch (error) {
      notice('启动失败。' + (error instanceof Error ? error.message : ''), true);
    } finally {
      starting = false;
      render();
      scheduleRefresh();
    }
  }

  async function decide(runId: string, option?: number): Promise<void> {
    if (deciding || data?.account.role !== 'operator') return;
    deciding = runId;
    decisionError = '';
    render();
    try {
      const path = '/api/runs/' + encodeURIComponent(runId) + (option === undefined ? '/cancel' : '/escalate');
      const result = await request<{ run: NonNullable<DashboardData['run']> }>(path, { optionIndex: option, reason: decisionReason.trim() });
      if (requestedRun === runId) {
        if (result.run.runId !== runId) selectRun(result.run.runId);
        if (data) data.run = result.run;
        if (option === 1) {
          selectRun(result.run.runId, 'delivery');
          tab = 'artifact';
        }
      }
    } catch (error) {
      if (requestedRun === runId) decisionError = '操作提交失败。' + (error instanceof Error ? error.message : '');
    } finally {
      deciding = '';
      render();
      await refresh();
    }
  }

  get('run-all').addEventListener('click', () => void start('all'));
  get('refresh-view').addEventListener('click', () => void refresh());
  get('project-sample').addEventListener('click', () => {
    const goal = get<HTMLTextAreaElement>('project-goal');
    if (!goal.value.trim()) {
      goal.value = '修复限流器容量、补充速率和令牌参数的边界校验，保证 consume() 拒绝非有限数值，并保留正常补充行为。';
    }
    goal.focus();
    notice('已填入示例任务目标，可继续编辑后提交。');
  });
  get<HTMLButtonElement>('sign-out').addEventListener('click', async event => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    try {
      const response = await fetch('/api/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Could not sign out');
      stream?.close();
      location.replace('/login');
    } catch {
      notice('退出失败，请重试。', true);
      button.disabled = false;
    }
  });
  get<HTMLFormElement>('project-form').addEventListener('submit', event => {
    event.preventDefault();
    const project = data?.repository;
    const goal = get<HTMLTextAreaElement>('project-goal').value.trim();
    if (!project?.ready || !project.project || get<HTMLSelectElement>('project-select').value !== project.project.id) return;
    if (!goal) {
      notice('请输入任务描述。', true);
      return;
    }
    void start(project.project.id, goal);
  });
  get<HTMLSelectElement>('run-history').addEventListener('change', event =>
    selectRun((event.target as HTMLSelectElement).value, page === 'delivery' ? 'delivery' : 'execution'));
  get('run-summary').addEventListener('input', event => {
    if ((event.target as HTMLElement).id === 'decision-reason') decisionReason = (event.target as HTMLInputElement).value;
  });
  document.addEventListener('click', async event => {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[data-route]');
    if (link && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      navigate(link.pathname + link.search);
      return;
    }
    const button = (event.target as HTMLElement).closest('button');
    if (!button || button.disabled) return;
    const action = button.dataset;
    if (action.settings) {
      settingsTab = action.settings;
      render();
    }
    if (action.agentHistory) {
      const id = action.agentHistory;
      agentHistories.set(id, '正在读取历史…');
      render();
      try {
        agentHistories.set(id, await request<AgentHistory>('/api/agents/' + encodeURIComponent(id) + '/history'));
      } catch {
        agentHistories.set(id, '无法读取历史，请重试。');
      }
      render();
    }
    if (action.run) void start(action.run);
    if (action.preview) {
      taskId = action.preview;
      selectRun('');
    }
    if (action.selectRun) selectRun(action.selectRun);
    if (action.node) {
      nodeId = nodeId === action.node ? '' : action.node;
      render();
    }
    if (action.tab) {
      tab = action.tab;
      render();
    }
    if (action.runsTab) {
      runsTab = action.runsTab as 'all' | 'active' | 'done';
      renderRuns();
      return;
    }
    if (action.cancelRun) {
      void decide(action.cancelRun);
      return;
    }
    const run = data?.run;
    if (!run || run.runId !== requestedRun) return;
    if (action.decision !== undefined) void decide(run.runId, Number(action.decision));
    if (action.cancel !== undefined) void decide(run.runId);
    const patch = run.patch?.patch;
    if (!patch) return;
    if (action.copy !== undefined) {
      try {
        await navigator.clipboard.writeText(patch);
        if (run.runId === requestedRun && tab === 'artifact') get('copy-result').textContent = '补丁已复制。';
      } catch {
        if (run.runId === requestedRun && tab === 'artifact') get('copy-result').textContent = '无法访问剪贴板，可使用下载补丁。';
      }
    }
    if (action.download !== undefined) {
      const url = URL.createObjectURL(new Blob([patch], { type: 'text/x-diff' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = run.runId + '-rate-limiter.patch';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  });

  window.addEventListener('popstate', () => {
    if (location.pathname + location.search !== routePath) syncRoute(false);
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) scheduleRefresh();
  });
  setInterval(() => {
    if (!connected || refreshFailed || streamRun || data?.runs.some(active)) scheduleRefresh();
  }, 3000);
  renderPage();
  void refresh();
}
