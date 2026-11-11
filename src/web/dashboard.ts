import type { Orchestrator, RunSnapshot } from '../orchestrator.js';
import type { OrchestratorEvent, VerificationResult, WorkflowDefinition, WorkflowNode } from '../types/index.js';

type Snapshot = ReturnType<Orchestrator['getSnapshot']>;
type RunSummary = Pick<RunSnapshot, 'runId' | 'taskId' | 'status' | 'startedAt' | 'finishedAt' | 'humanDecision' | 'retryOf'>;
interface DashboardData {
  account: { username: string; role: 'operator' | 'viewer' };
  tasks: Array<{ id: string; title: string; description: string; prompt: string; difficulty: string; workflow: WorkflowDefinition }>;
  repository: ReturnType<Orchestrator['getProject']>;
  persistentStorage: boolean;
  agents: Array<Snapshot['agents'][number] & { version: string; toolIds: string[]; capabilities: Record<string, number> }>;
  scheduler: Snapshot['scheduler'];
  pending: Array<{ runId: string; nodeId: string; basePriority: number; effectivePriority: number; submittedAt: number }>;
  tools: Snapshot['tools'];
  llm: Snapshot['llm'];
  knowledgeChunks: number;
  optimizations: ReturnType<Orchestrator['getPromptOptimizations']>;
  runs: RunSummary[];
  run: Omit<RunSnapshot, 'state'> | null;
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
    'rl-easy': { title: '基线验收', detail: '检验已有实现，观察需求分析、沙箱测试和交叉审查。', label: '基础案例', color: 'good', action: '运行基线验收' },
    'rl-normal': { title: '边界缺陷自愈', detail: '从带缺陷的草稿开始，观察测试拦截、根因诊断和重试修复。', label: '推荐起点', color: 'good', action: '运行缺陷修复' },
    'rl-hard': { title: '分布式对账阻塞', detail: '加入跨节点令牌对账要求，观察系统在无法满足验收条件时如何请求人工决策。', label: '人工介入', color: 'warn', action: '运行阻塞案例' }
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
  const routeRun = () => /^\/runs\/(run-\d+)$/.exec(location.pathname)?.[1];

  let data: DashboardData | undefined;
  let requestedRun = routeRun();
  let routePath = location.pathname;
  let revealOnLoad = !!requestedRun;
  let unavailableRun: string | undefined;
  let taskId = 'rl-normal';
  let nodeId = '';
  let tab = 'verification';
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
    const indicator = get('connection');
    if (indicator.textContent === label) return;
    indicator.className = 'badge ' + color;
    indicator.textContent = label;
  }

  function notice(message: string, error = false): void {
    const element = get('notice');
    element.textContent = message;
    element.dataset.error = String(error);
  }

  function render(): void {
    if (!data) return;
    const run = data.run?.runId === requestedRun ? data.run : null;
    const task = data.tasks.find(item => item.id === taskId) ?? (run?.project ? undefined : data.tasks[0]);
    const live = !data.llm.label.startsWith('offline');
    const busy = data.runs.some(active);
    const telemetry = data.llm.telemetry;
    const canOperate = data.account.role === 'operator';
    get('session-account').textContent = data.account.username + ' · ' + (canOperate ? '操作者' : '只读');
    get('storage-status').textContent = data.persistentStorage
      ? 'AetherHarness · 历史运行、验收证据与补丁已启用本地持久化。'
      : 'AetherHarness · 当前服务使用进程内运行历史。';
    get('mode').textContent = live ? '实时模型 · ' + data.llm.label + (telemetry ?
      ' · 调用 ' + telemetry.calls + ' 次 · 降级 ' + telemetry.fallbacks + ' 次' : '') :
      '离线演示 · 无需 API 密钥。参赛演示可启用大模型。';
    get<HTMLButtonElement>('run-all').hidden = !canOperate;
    get<HTMLButtonElement>('run-all').disabled = starting || busy || data.tasks.length === 0;
    const { project, ready, reason } = data.repository;
    get('project-status').textContent = ready && project
      ? project.title + ' · ' + project.filePath + ' @ ' + project.revision.slice(0, 12)
      : reason ?? '仓库任务不可用。';
    get('project-form').hidden = !canOperate;
    get<HTMLTextAreaElement>('project-goal').disabled = !canOperate || !ready;
    get<HTMLButtonElement>('project-submit').disabled = !canOperate || starting || !ready ||
      data.runs.some(item => item.taskId === project?.id && active(item));

    show('scenario-cards', data.tasks.map((item, index) => {
      const copy = scenarios[item.id];
      const title = taskName(item.id);
      const latest = data!.runs.findLast(record => record.taskId === item.id);
      const running = data!.runs.some(record => record.taskId === item.id && active(record));
      return '<article class="card scenario ' + (item.id === task?.id ? 'selected' : '') + '">' +
        '<div class="row between"><span class="eyebrow">案例 ' + String(index + 1).padStart(2, '0') + '</span>' +
        badge(copy?.label ?? item.difficulty, copy?.color) + '</div><h3>' + esc(title) + '</h3><p class="muted small">' +
        esc(copy?.detail ?? item.description) + '</p>' +
        '<div class="row small muted">最近运行 ' + (latest ? stateBadge(latest.humanDecision ?? latest.status) : '暂无') + '</div>' +
        '<div class="actions row">' + (canOperate ? '<button type="button" class="btn ' + (item.id === 'rl-normal' ? 'primary' : '') +
        '" data-run="' + esc(item.id) + '" data-focus="run-' + esc(item.id) + '"' + (starting || running ? ' disabled' : '') +
        '>' + esc(running ? '案例运行中…' : copy?.action ?? '运行案例') + '</button>' : '') +
        '<button type="button" class="link" data-preview="' + esc(item.id) + '" data-focus="preview-' + esc(item.id) +
        '" aria-label="预览' + esc(title) + '编排">预览编排</button></div></article>';
    }).join('') || empty('当前服务没有可用的案例。'));

    const history = get<HTMLSelectElement>('run-history');
    show('run-history', '<option value="">预览 · ' + esc(task ? taskName(task.id) : '工作流') + '</option>' +
      data.runs.slice().reverse().map(item => '<option value="' + esc(item.runId) + '">' +
        esc(item.runId + ' · ' + taskName(item.taskId) + ' · ' + statusNames[item.humanDecision ?? item.status][0]) + '</option>').join(''));
    history.disabled = data.runs.length === 0;
    history.value = requestedRun ?? '';

    renderWorkflow(run?.workflow ?? task?.workflow, run);
    renderRun(run, run?.project ? run.title : task ? taskName(task.id) : '', run?.goal ?? task?.prompt);
    renderEvidence(run);
    renderOperations(data);
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
      const status = progress[node.id]?.status ?? (branches.has(node.id) || (run && run.status !== 'running') ? 'skipped' : 'pending');
      return '<button type="button" class="node" data-node="' + esc(node.id) + '" data-focus="' + esc(node.id) +
        '" aria-pressed="' + String(node.id === nodeId) + '"><strong>' + esc(nodeName(node.id, node.name)) +
        '</strong>' + stateBadge(status) + '</button>';
    };
    const innerIds = new Set(workflow.nodes.flatMap(node => node.selfLoopConfig ?
      [node.selfLoopConfig.targetNodeId, node.selfLoopConfig.verificationNodeId] : []));
    const insideLoop = [...innerIds].map(id => nodes.get(id)).filter((node): node is WorkflowNode => !!node);
    show('pipeline-flow', stages.map(stage => '<div class="stage">' + stage.map(nodeButton).join('') + '</div>').join(''));
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
        (selected.agentId ? '<p>配置 Agent · ' + esc(agentName(selected.agentId)) + '</p>' : '') +
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
    show('node-inspector', '<div class="stack">' + (insideLoop.length ?
      '<div><p class="muted small">自愈循环内部 · 开发、验证、诊断后决定是否重试</p><div class="subnodes">' +
      insideLoop.map(nodeButton).join('') + '</div></div>' : '') + detail + '</div>');
  }

  function renderRun(run: DashboardData['run'], title: string, prompt?: string): void {
    const brief = prompt ? '<details id="task-brief" class="small"><summary>查看任务原文</summary><p>' + esc(prompt) + '</p></details>' : '';
    if (!run) {
      if (unavailableRun) {
        show('run-summary', empty('找不到运行 ' + unavailableRun + '。') + '<a class="link" href="/">返回工作台</a>');
        return;
      }
      show('run-summary', '<h4>' + esc(title) + '</h4>' + empty(requestedRun ?
        '正在读取所选运行…' : '当前正在预览工作流。点击案例的运行按钮开始，或通过运行历史查看已有结果。') + brief);
      return;
    }
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
    show('run-summary', '<div class="row between"><h4>' + esc(title) + '</h4>' + stateBadge(outcome ?? run.status) + '</div>' +
      '<p class="muted small mono">' + esc(run.runId) + ' · ' + time(run.startedAt) +
      (run.finishedAt ? ' · ' + duration(run.finishedAt - run.startedAt) : '') + '</p>' +
      (run.retryOf ? '<p class="small">重试自 <button class="link" type="button" data-select-run="' + esc(run.retryOf) +
        '">' + esc(run.retryOf) + '</button></p>' : '') +
      '<div class="inset"><span class="muted small">自动验证</span><div class="row">' +
      (v ? badge(v.passed ? '通过' : '阻塞', v.passed ? 'good' : 'bad') + ' <strong>' + pct(v.score) + '</strong>' :
        '<span class="muted small">尚无最终结论</span>') +
      (run.iterations ? '<span class="muted small">已记录 ' + run.iterations + ' 轮</span>' : '') + '</div></div>' +
      '<p class="small muted">' + esc(description) + '</p>' +
      (run.cancellation ? '<p class="small muted">取消申请 · ' + esc(run.cancellation.actor + ' · ' +
        time(run.cancellation.requestedAt) + ' · ' + run.cancellation.reason) + '</p>' : '') +
      (run.modelLabel ? '<p class="small muted">运行模型 · ' + esc(run.modelLabel) + '</p>' : '') +
      (run.project ? '<p class="small muted">Git 基线 · <code>' + esc(run.project.revision.slice(0, 12)) + '</code></p>' : '') + brief +
      (outcome === 'retry' && retry ? '<button class="btn" type="button" data-select-run="' + esc(retry.runId) + '">查看本次重试</button>' : '') +
      (run.patch?.patch ? '<button class="btn" type="button" data-tab="artifact" data-focus="open-artifact">查看' +
        (outcome === 'review' ? '草稿' : '交付') + '补丁</button>' : '') + controls +
      (run.finishedAt ? '<a class="btn" href="/api/runs/' + esc(run.runId) + '/report" download>下载验收报告（JSON）</a>' : '') +
      (deciding === run.runId ? '<p class="small" role="status">正在处理决策…</p>' : '') +
      (decisionError ? '<p class="notice" data-error="true" role="alert">' + esc(decisionError) + '</p>' : ''));
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
    if (!run) {
      show('evidence', empty('启动案例或选择历史运行后，这里会展示该次运行的证据。'));
      return;
    }
    if (tab === 'artifact') {
      const patch = run.patch?.patch;
      const draft = !run.verification?.passed || run.status !== 'completed' || !!run.humanDecision;
      const lines = patch?.split('\n').map(line => '<span class="' +
        (line.startsWith('+') ? 'added' : line.startsWith('-') ? 'removed' : '') + '">' + esc(line) + '</span>').join('\n');
      show('evidence', '<div class="stack">' +
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
      show('evidence', !data?.events.length ? empty('当前没有可显示的运行事件。') :
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
    show('evidence', '<div class="stack">' +
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
    const s = snapshot.scheduler;
    show('scheduler', '<div class="metrics">' + [
      ['等待派发', s.queued], ['正在执行', s.running], ['累计派发', s.dispatches], ['重试', s.retried]
    ].map(([label, value]) => '<div class="inset metric"><span class="muted small">' + esc(label) +
      '</span><strong>' + esc(value) + '</strong></div>').join('') +
      '</div><p class="small muted">优先级老化提权 ' + s.agingPromotions + ' 次 · 最长等待 ' + duration(s.maxObservedWaitMs) +
      ' · 调度失败 ' + s.failed + ' 次</p>' +
      (snapshot.pending.length ? '<ul class="plain-list small">' + snapshot.pending.map(item =>
        '<li>' + esc(item.runId + ' · ' + nodeName(item.nodeId)) + ' · 优先级 ' + item.basePriority + ' → ' +
        item.effectivePriority + ' · 已等待 ' + duration(Math.max(0, Date.now() - item.submittedAt)) + '</li>').join('') +
        '</ul>' : '<p class="muted small">等待队列为空。并发运行全部案例可以观察队列和负载变化。</p>'));

    show('team', snapshot.agents.map(agent => '<details id="agent-' + esc(agent.id) +
      '" class="card agent"><summary>' + esc(roles[agent.role] ?? agent.role) + ' · ' + esc(agent.name) +
      '</summary><p class="muted small">并发负载 ' + agent.load + ' / ' + agent.max + '</p>' +
      '<progress value="' + agent.load + '" max="' + agent.max + '" aria-label="' + esc(agent.name) +
      ' 并发负载"></progress><p class="small muted">配置 v' + esc(agent.version) + ' · ' + esc(agent.brain) +
      ' · 累计 Token ' + agent.tokens.toLocaleString('zh-CN') + '</p><ul class="plain-list small">' +
      Object.entries(agent.capabilities).map(([name, score]) => '<li>' + esc(capabilities[name] ?? name) +
        ' · ' + pct(score) + '</li>').join('') + '</ul><p class="small muted">绑定工具 · ' +
      esc(agent.toolIds.map(id => tools[id] ?? id).join('、') || '无') + '</p>' +
      '<button class="link" type="button" data-agent-history="' + esc(agent.id) + '" data-focus="agent-history-' + esc(agent.id) +
      '">查看 Agent 历史</button>' + agentHistory(agent.id) + '</details>').join(''));

    const policy = snapshot.settings;
    show('settings-policy', '<div class="workspace"><div><h3>模型与调度</h3><ul class="policy-list small">' +
      '<li>' + esc(snapshot.llm.label) + '</li>' +
      (policy.model ? '<li>降级策略 · ' + (policy.model.strict ? '严格 Live，失败即停止' : '允许离线降级') + '</li>' +
        (policy.model.timeoutMs === undefined ? '' : '<li>单次模型请求超时 ' + duration(policy.model.timeoutMs) +
          ' · 最多重试 ' + policy.model.maxRetries + ' 次 · 输出上限 ' + policy.model.maxTokens + ' Token</li>') : '') +
      '<li>并发运行上限 ' + policy.maxConcurrentRuns + ' · 调度等待上限 ' + duration(policy.scheduler.maxWaitMs) +
      ' · 节点最多重试 ' + policy.scheduler.maxRetries + ' 次</li></ul></div>' +
      '<div><h3>工作流预算</h3><ul class="policy-list small">' + policy.workflows.map(flow => '<li>' +
        esc(taskName(flow.taskId)) + ' · v' + esc(flow.version) +
        (flow.timeoutMs ? ' · ' + duration(flow.timeoutMs) : '') + ' · 自愈最多 ' + Math.max(...flow.loopLimits, 0) +
        ' 轮</li>').join('') + '</ul></div></div><div><h3>工具权限与超时</h3>' +
      '<p class="small muted">Agent 可调用各自绑定的工具。工作流工具由服务端模板指定。</p><ul class="policy-list small">' +
      policy.tools.map(tool => '<li>' + esc(tools[tool.id] ?? tool.id) +
        (tool.timeoutMs ? ' · ' + duration(tool.timeoutMs) : '') + ' · ' + esc(tool.description) + '</li>').join('') +
      '</ul></div>');

    show('system', '<div class="workspace"><div class="panel"><h3>工具调用</h3><div class="stack">' +
      (snapshot.tools.length ? '<ul class="plain-list small">' + snapshot.tools.map(tool => '<li>' +
        esc(tools[tool.toolId] ?? tool.toolId) + ' · ' + tool.calls + ' 次调用 · 成功率 ' + pct(tool.reliability) +
        '</li>').join('') + '</ul>' : '<p class="small muted">运行案例后展示工具调用统计。</p>') +
      '<p class="small muted">知识库 · ' + snapshot.knowledgeChunks + ' 个索引分块</p></div></div>' +
      '<div class="panel"><h3>提示词优化</h3><div class="stack">' +
      (snapshot.optimizations.length ? snapshot.optimizations.slice().reverse().map((record, index) =>
        '<details id="optimization-' + (snapshot.optimizations.length - index) + '-' + record.timestamp +
        '" class="small"><summary>' + time(record.timestamp) + ' · ' + esc(agentName(record.agentId)) +
        ' · 新增 ' + record.addedGuardrails.length + ' 条约束</summary><ul>' +
        record.addedGuardrails.map(rule => '<li>' + esc(rule) + '</li>').join('') + '</ul></details>').join('') :
        '<p class="small muted">当验证失败触发新的提示词约束时，这里会显示优化记录。</p>') + '</div></div></div>');
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
        '<li><a href="/runs/' + esc(item.runId) + '">' + esc(item.runId + ' · ' + item.title) + '</a>' +
        '<p>' + esc([...item.dispatches.map(dispatch => nodeName(dispatch.nodeId) + '（优先级 ' + dispatch.priority + '）'),
          ...item.reviews.map(review => '第 ' + review.iteration + ' 轮' +
            (review.role === 'critic' ? '诊断' : review.approved ? '审查通过' : '审查拦截'))].join('、')) +
        '</p></li>').join('') + '</ul>' : '<p>尚无可查看的活动。</p>') + '</div>';
  }

  async function request<T>(url: string, body?: object): Promise<T> {
    const response = await fetch(url, body ? {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    } : undefined);
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
    try {
      const query = selection === undefined ? '' : '?runId=' + encodeURIComponent(selection);
      const snapshot = await request<DashboardData>('/api/dashboard' + query);
      if (selection !== requestedRun) return;
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
      if (revealOnLoad) {
        revealOnLoad = false;
        revealExecution();
      }
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

  function revealExecution(): void {
    get('execution-title').focus({ preventScroll: true });
    get('execution').scrollIntoView({ block: 'start' });
  }

  function selectRun(id: string | undefined, updateHistory = true): void {
    const path = id ? '/runs/' + encodeURIComponent(id) : '/';
    if (updateHistory && location.pathname !== path) window.history.pushState(null, '', path);
    routePath = location.pathname;
    requestedRun = id;
    unavailableRun = undefined;
    const match = data?.runs.find(run => run.runId === id);
    if (match) taskId = match.taskId;
    nodeId = '';
    tab = 'verification';
    decisionError = '';
    decisionReason = '';
    render();
    scheduleRefresh();
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
      revealExecution();
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
        if (option === 1) tab = 'artifact';
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
  get<HTMLFormElement>('project-form').addEventListener('submit', event => {
    event.preventDefault();
    const project = data?.repository;
    const goal = get<HTMLTextAreaElement>('project-goal').value.trim();
    if (!project?.ready || !project.project) return;
    if (!goal) {
      notice('请输入任务描述。', true);
      return;
    }
    void start(project.project.id, goal);
  });
  get<HTMLSelectElement>('run-history').addEventListener('change', event => selectRun((event.target as HTMLSelectElement).value));
  get('run-summary').addEventListener('input', event => {
    if ((event.target as HTMLElement).id === 'decision-reason') decisionReason = (event.target as HTMLInputElement).value;
  });
  document.addEventListener('click', async event => {
    const button = (event.target as HTMLElement).closest('button');
    if (!button || button.disabled) return;
    const action = button.dataset;
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
      revealExecution();
    }
    if (action.selectRun) selectRun(action.selectRun);
    if (action.node) {
      nodeId = nodeId === action.node ? '' : action.node;
      render();
    }
    if (action.tab) {
      tab = action.tab;
      render();
      if (!button.classList.contains('tab')) get('evidence').scrollIntoView({ block: 'nearest' });
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
    if (location.pathname === routePath) return;
    const runId = routeRun();
    revealOnLoad = !!runId;
    selectRun(runId, false);
  });
  setInterval(() => {
    if (!connected || refreshFailed || streamRun || data?.runs.some(active)) scheduleRefresh();
  }, 3000);
  void refresh();
}
