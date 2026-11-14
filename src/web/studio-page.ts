import { CONSOLE_STYLE } from './console-style.js';
import type { AgentConfig, AgentDefinition, TeamConfig, TeamDefinition } from '../studio/definitions.js';

function studioPage(): void {
  const get = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  const kind = location.pathname.startsWith('/teams') ? 'teams' : 'agents';
  const root = kind === 'teams' ? '/teams' : '/studio/agents';
  const initialRunId = new URLSearchParams(location.search).get('run');
  const api = '/api/studio/' + kind;
  let selected: AgentDefinition | TeamDefinition | undefined;
  let draft: any;
  let items: any[] = [];
  let agents: AgentDefinition[] = [];
  let catalog: any;
  let operator = false;
  let dirty = false;
  let busy = false;
  let stream: EventSource | undefined;
  let currentRun: string | undefined;
  let runRefreshing = false;
  let runAgain = false;
  const val = (id: string) => get<HTMLInputElement>(id).value;
  const json = (value: unknown) => JSON.stringify(value, null, 2);
  function notice(message: string) { get('notice').textContent = message; }
  async function request(url: string, method = 'GET', body?: unknown, etag?: string): Promise<any> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (etag) headers['If-Match'] = etag;
    if (method === 'POST' && (url.endsWith('/runs') || url.endsWith('/tests'))) headers['Idempotency-Key'] = crypto.randomUUID();
    const response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (response.status === 401) { location.href = '/login?next=' + encodeURIComponent(location.pathname); throw new Error('请重新登录。'); }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message ?? data.error ?? '请求失败。');
    return data;
  }
  function field(id: string, label: string, value: unknown, type = 'text', extra = ''): string {
    return `<label class="stack small">${esc(label)}<input class="select" id="${id}" type="${type}" value="${esc(value)}" ${extra}></label>`;
  }
  function area(id: string, label: string, value: unknown, rows = 3): string {
    return `<label class="stack small">${esc(label)}<textarea class="select" id="${id}" rows="${rows}">${esc(value)}</textarea></label>`;
  }
  function toolFields(ids: string[]): string {
    return '<fieldset class="stack"><legend>工具白名单</legend>' + catalog.tools.map((t: any) =>
      `<label class="small"><input type="checkbox" name="tool" value="${esc(t.id)}" ${ids.includes(t.id) ? 'checked' : ''}> ${esc(t.name)} <span class="muted">${esc(t.id)}${t.available ? '' : ' · 运行时禁止调用'}</span></label>`).join('') +
      '<p class="muted small">实际权限取成员、团队和服务端策略的交集。需要审批的工具尚未开放。</p></fieldset>';
  }
  function renderList() {
    const filter = val('filter'); const query = val('search').trim().toLowerCase();
    const filtered = items.filter(i => (!query || (i.name + i.slug).toLowerCase().includes(query)) &&
      (filter === 'all' || filter === i.origin || filter === 'archived' && i.archivedAt));
    get('list').innerHTML = filtered.map(i => `<button class="definition-row ${i.id === selected?.id ? 'selected' : ''}" data-open="${esc(i.id)}" type="button">
      <span class="row between"><strong>${esc(i.name)}</strong><span class="badge">v${i.revision}</span></span>
      <span class="muted small">${esc(i.slug)} · ${i.origin === 'system' ? '系统' : '自定义'} · ${i.archivedAt ? '已归档' : i.enabled ? '启用' : '停用'}</span>
      <span class="small">${esc(i.description)}</span></button>`).join('') || '<p class="empty">没有匹配的定义。</p>';
    get('list-count').textContent = `${filtered.length} 项`;
  }
  function renderMembers() {
    get('members').innerHTML = draft.members.map((m: TeamConfig['members'][number], index: number) => {
      const options = agents.flatMap(a => a.revisions.map(r => `<option value="${esc(a.id)}@${r.revision}" ${a.id === m.agentRef.id && r.revision === m.agentRef.revision ? 'selected' : ''}>${esc(r.config.name)} · v${r.revision}${!a.enabled || a.archivedAt ? '（已停用）' : ''}</option>`));
      return `<section class="inset stack member" data-member="${index}"><div class="row between"><strong>成员 ${index + 1}</strong><div class="row">
        <button class="btn" type="button" data-move="${index}" data-direction="-1" ${index === 0 ? 'disabled' : ''}>上移</button>
        <button class="btn" type="button" data-move="${index}" data-direction="1" ${index === draft.members.length - 1 ? 'disabled' : ''}>下移</button>
        <button class="btn" type="button" data-remove="${index}">移除</button></div></div>
        <label class="stack small">Agent 固定版本<select class="select" data-ref>${options.join('')}</select></label>
        <label class="stack small">岗位标识<input class="select" data-member-id value="${esc(m.memberId)}"></label>
        <label class="stack small">分工职责<textarea class="select" data-responsibility rows="2">${esc(m.responsibility)}</textarea></label>
        <label class="stack small">可参与路由的能力（逗号分隔）<input class="select" data-capabilities value="${esc(m.eligibleCapabilities.join(', '))}"></label>
      </section>`;
    }).join('');
  }
  function renderEditor() {
    if (!operator) {
      get('editor-content').innerHTML = '<p class="muted">你可以查看目录。创建、编辑、测试和运行需要操作者权限。</p>';
      get('save-draft').hidden = true; get('save-version').hidden = true; get('testing').hidden = true;
      get('version').hidden = true; get('reload').hidden = true;
      return;
    }
    get('editor').hidden = false;
    get('editor-title').textContent = selected ? selected.revisions.at(-1)!.config.name : kind === 'agents' ? '创建 Agent' : '创建团队';
    get('version-info').textContent = selected ? `${selected.origin === 'system' ? '系统只读' : '自定义'} · ${selected.revisions.length} 个版本 · ${new Date(selected.createdAt).toLocaleString()}` : '保存后生成第一个固定版本';
    get('version').innerHTML = '<option value="draft">草稿</option>' + (selected?.revisions.map(r => `<option value="${r.revision}">v${r.revision} · ${esc(r.createdBy)}</option>`).reverse().join('') ?? '');
    const common = '<div class="form-grid">' + field('name', '名称', draft.name) + field('slug', '唯一标识', selected?.slug ?? '', 'text', selected ? 'disabled' : 'required placeholder="例如 my-developer"') + '</div>' + area('description', '职责说明', draft.description);
    let content = common;
    if (kind === 'agents') {
      content += '<div class="form-grid">' + field('role-label', '岗位名称', draft.roleLabel) +
        '<label class="stack small">基础角色<select class="select" id="role">' + catalog.roles.map((r: string) => `<option ${r === draft.role ? 'selected' : ''}>${esc(r)}</option>`).join('') + '</select></label></div>' +
        '<div class="form-grid"><label class="stack small">执行行为<select class="select" id="behavior"><option value="configured">通用自定义 Agent</option><option value="template">继承限流器专用角色模板</option></select></label>' +
        '<label class="stack small">模型配置<select class="select" id="model">' +
        (draft.modelConfigRef.revision !== catalog.model.ref.revision ? `<option value="previous">原版本 ${esc(draft.modelConfigRef.revision)}（当前不可用）</option>` : '') +
        `<option value="current">${esc(catalog.model.label)} · ${esc(catalog.model.ref.revision)}</option></select></label></div>` +
        area('prompt', '系统指令', draft.systemPrompt, 7) + area('constraints', '行为约束（每行一条）', draft.constraints.join('\n')) +
        field('capabilities', '能力标签与评分（例如 code_generation:0.9, debugging:0.8）', Object.entries(draft.capabilities).map(([k, v]) => `${k}:${v}`).join(', ')) + toolFields(draft.toolIds) +
        '<details><summary>记忆、预算与输入输出契约</summary><div class="stack advanced"><div class="form-grid">' +
        '<label class="stack small">记忆策略<select class="select" id="memory"><option value="none">无记忆</option><option value="run-window">本次运行窗口</option></select></label>' +
        field('messages', '窗口消息数', draft.memoryPolicy.maxMessages, 'number', 'min="0" max="50"') +
        field('turns', '模型与工具最大轮数', draft.limits.maxTurns, 'number', 'min="1" max="12"') + field('timeout', '执行超时（毫秒）', draft.limits.timeoutMs, 'number', 'min="100" max="120000"') +
        field('tokens', '每轮最大输出 Token', draft.limits.maxTokens, 'number', 'min="16" max="8192"') + field('concurrency', '并发上限', draft.limits.maxConcurrency, 'number', 'min="1" max="8"') +
        field('temperature', '温度', draft.temperature, 'number', 'min="0" max="2" step="0.1"') + '</div>' +
        area('input-schema', '输入 Schema（JSON）', json(draft.inputSchema), 4) + area('output-schema', '输出 Schema（JSON）', json(draft.outputSchema), 4) + '</div></details>';
    } else {
      content += '<div class="form-grid"><label class="stack small">任务分配<select class="select" id="routing"><option value="sequence">按成员顺序交接</option><option value="capability">按能力选择一名成员</option></select></label>' +
        field('coordinator', '协调成员岗位标识（可选，无自主委派）', draft.coordinatorMemberId ?? '') + '</div>' +
        '<div class="row between"><h3>团队成员与固定版本</h3><button class="btn" type="button" id="add-member">添加成员</button></div><div id="members" class="stack"></div>' +
        area('handoffs', '顺序交接（每行 from > to；能力分配请留空）', draft.handoffs.map((h: any) => `${h.from} > ${h.to}`).join('\n')) +
        '<button class="link" type="button" id="sequence-handoffs">按当前成员顺序生成交接关系</button>' + toolFields(draft.toolIds);
    }
    get('editor-content').innerHTML = content;
    if (kind === 'agents') { get<HTMLSelectElement>('behavior').value = draft.behavior; get<HTMLSelectElement>('memory').value = draft.memoryPolicy.mode; }
    else { get<HTMLSelectElement>('routing').value = draft.routing; renderMembers(); }
    get<HTMLFieldSetElement>('config-fields').disabled = !!selected && (selected.origin === 'system' || !!selected.archivedAt);
    get<HTMLButtonElement>('save-draft').disabled = !!selected && (selected.origin === 'system' || !!selected.archivedAt);
    get<HTMLButtonElement>('save-version').disabled = !!selected && (selected.origin === 'system' || !!selected.archivedAt);
    get('copy').hidden = !selected; get('toggle').hidden = !selected || selected.origin === 'system' || !!selected.archivedAt;
    get('archive').hidden = get('toggle').hidden; get('toggle').textContent = selected?.enabled ? '停用' : '启用';
    get('test').hidden = !selected; get('use-version').hidden = true;
    get('test-caption').textContent = '测试只使用已保存的固定版本；草稿修改不会自动生效。';
    get('save-state').textContent = '已载入';
  }
  function readMembers(): TeamConfig['members'] {
    return Array.from(document.querySelectorAll<HTMLElement>('.member')).map(row => {
      const ref = row.querySelector<HTMLSelectElement>('[data-ref]')!.value.split('@');
      return { memberId: row.querySelector<HTMLInputElement>('[data-member-id]')!.value.trim(), agentRef: { id: ref[0], revision: Number(ref[1]) },
        responsibility: row.querySelector<HTMLTextAreaElement>('[data-responsibility]')!.value,
        eligibleCapabilities: row.querySelector<HTMLInputElement>('[data-capabilities]')!.value.split(',').map(s => s.trim()).filter(Boolean) };
    });
  }
  function readConfig(): AgentConfig | TeamConfig {
    const toolIds = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="tool"]:checked')).map(i => i.value);
    const common = { ...draft, name: val('name'), description: val('description'), toolIds };
    if (kind === 'teams') return { ...common, routing: val('routing'), coordinatorMemberId: val('coordinator').trim() || undefined,
      members: readMembers(), handoffs: val('handoffs').split('\n').filter(s => s.trim()).map(s => { const [from, to] = s.split('>').map(v => v.trim()); return { from, to }; }) };
    const capabilities = Object.fromEntries(val('capabilities').split(',').filter(s => s.trim()).map(s => { const [k, v] = s.split(':'); return [k.trim(), Number(v)]; }));
    return { ...common, role: val('role'), roleLabel: val('role-label'), behavior: val('behavior'), systemPrompt: val('prompt'),
      constraints: val('constraints').split('\n').map(s => s.trim()).filter(Boolean), capabilities,
      modelConfigRef: val('model') === 'current' ? catalog.model.ref : draft.modelConfigRef,
      temperature: Number(val('temperature')), memoryPolicy: { mode: val('memory'), maxMessages: Number(val('messages')) },
      limits: { maxTurns: Number(val('turns')), timeoutMs: Number(val('timeout')), maxTokens: Number(val('tokens')), maxConcurrency: Number(val('concurrency')) },
      inputSchema: JSON.parse(val('input-schema')), outputSchema: JSON.parse(val('output-schema')) };
  }
  async function refreshList() { items = await request(api); renderList(); }
  async function open(id: string) {
    if (dirty && !confirm('有未保存的修改，离开后将丢失。继续？')) return;
    if (!operator) return;
    selected = await request(api + '/' + encodeURIComponent(id)); draft = structuredClone(selected!.draft); dirty = false;
    history.replaceState(null, '', root + '/' + encodeURIComponent(id)); renderList(); renderEditor();
  }
  function newDefinition(template = 'developer') {
    if (dirty && !confirm('放弃未保存的修改并创建新定义？')) return;
    selected = undefined;
    draft = kind === 'agents' ? structuredClone(catalog.templates[template]) : { name: '我的工程团队', description: 'Developer 和 Tester 协作。', members: [], routing: 'sequence', handoffs: [], toolIds: ['static_analyzer'] };
    dirty = false; history.replaceState(null, '', root); renderList(); renderEditor();
  }
  async function save(publish: boolean) {
    const config = readConfig();
    get('save-state').textContent = '正在保存…';
    if (!selected) selected = await request(api, 'POST', { slug: val('slug'), config });
    else {
      selected = await request(api + '/' + selected.id + '/draft', 'PUT', config, selected.etag);
      if (publish) selected = await request(api + '/' + selected!.id + '/revisions', 'POST', {}, selected!.etag);
    }
    dirty = false; draft = structuredClone(selected!.draft); history.replaceState(null, '', root + '/' + selected!.id);
    await refreshList(); renderEditor(); get('save-state').textContent = publish ? `已保存固定版本 v${selected!.revisions.length}` : '草稿已保存';
  }
  async function refreshRun() {
    if (!currentRun) return;
    if (runRefreshing) { runAgain = true; return; }
    runRefreshing = true;
    try {
      const id = currentRun;
      const run = await request('/api/studio/runs/' + id);
      if (currentRun !== id) return;
      const names: Record<string, string> = { pending: '排队', running: '运行中', completed: '完成', failed: '失败', cancelled: '已取消', cancelling: '正在取消' };
      get('run-result').innerHTML = `<div class="row between"><strong>${esc(id)} · ${esc(names[run.status] ?? run.status)}</strong><a href="/runs/${esc(id)}">查看运行详情</a></div>` +
        `<p class="small muted">固定版本：${run.definitions.agents.map((a: any) => `${esc(a.config.name)} v${a.revision}`).join(' → ')} · 执行结果不等于正式验收</p>` +
        `<details><summary>查看本次运行的完整固定配置</summary><pre>${esc(json(run.definitions))}</pre></details>` +
        (run.error ? `<p class="notice">${esc(run.error)}</p>` : '') +
        (run.attempts ?? []).map((a: any) => `<details class="inset" open><summary>${esc(a.nodeName)} · ${esc(names[a.status] ?? a.status)}${a.endTime ? ' · ' + (a.endTime - a.startTime) + ' ms' : ''}</summary>
          <h4>实际输入</h4><pre>${esc(json(a.input))}</pre><h4>输出／错误</h4><pre>${esc(json(a.output ?? a.error))}</pre>
          ${(a.meta?.toolCalls ?? []).map((t: any) => `<h4>${esc(t.toolId)} · ${t.success ? '调用成功' : '调用失败／拒绝'}</h4><pre>${esc(json(t))}</pre>`).join('')}</details>`).join('');
      get<HTMLButtonElement>('cancel-run').disabled = !['pending', 'running'].includes(run.status);
      if (['completed', 'failed', 'cancelled'].includes(run.status)) stream?.close();
    } finally { runRefreshing = false; if (runAgain) { runAgain = false; void refreshRun().catch(e => notice(e.message)); } }
  }
  async function test() {
    if (!selected) return;
    if (dirty) throw new Error('请先保存新版本，或重新载入已保存配置后测试。');
    const revision = val('version') === 'draft' ? selected.revisions.length : Number(val('version'));
    const input = JSON.parse(val('test-input'));
    const body = kind === 'agents' ? { agentRef: { id: selected.id, revision }, input }
      : { kind: 'team', teamRef: { id: selected.id, revision }, input, ...(val('test-capability').trim() ? { capability: val('test-capability').trim() } : {}) };
    const run = await request(kind === 'agents' ? '/api/studio/tests' : '/api/studio/runs', 'POST', body);
    await followRun(run.runId);
  }
  async function followRun(runId: string) {
    currentRun = runId; stream?.close(); get('test-results').hidden = false;
    history.replaceState(null, '', location.pathname + '?run=' + encodeURIComponent(runId));
    stream = new EventSource('/api/runs/' + encodeURIComponent(currentRun!) + '/events');
    stream.onmessage = () => { void refreshRun().catch(e => notice(e.message)); };
    stream.addEventListener('reset', () => { void refreshRun().catch(e => notice(e.message)); });
    stream.onerror = () => notice('事件连接中断，正在重连；可手动刷新运行结果。');
    await refreshRun();
  }
  async function action(fn: () => Promise<void> | void) {
    if (busy) return; busy = true; notice('');
    try { await fn(); } catch (error: any) { notice(error.message); get('save-state').textContent = '操作未完成；编辑内容保留'; }
    finally { busy = false; }
  }
  get('editor-form').addEventListener('submit', e => { e.preventDefault(); void action(() => save(true)); });
  get('save-draft').onclick = () => { void action(() => save(false)); };
  get('new').onclick = () => { void action(() => newDefinition(val('template'))); };
  get('reload').onclick = () => { if (selected) void action(() => open(selected!.id)); };
  get('filter').onchange = renderList; get('search').oninput = renderList;
  get('list').onclick = e => { const id = (e.target as HTMLElement).closest<HTMLElement>('[data-open]')?.dataset.open; if (id) void action(() => open(id)); };
  get('copy').onclick = () => { void action(async () => {
    if (!selected) return;
    const slug = prompt('副本的唯一标识（以字母开头）：', selected.slug + '-copy'); if (!slug) return;
    const copy = await request(api, 'POST', { slug, copyFrom: { id: selected.id, revision: val('version') === 'draft' ? selected.revisions.length : Number(val('version')) } });
    dirty = false; await refreshList(); await open(copy.id);
  }); };
  get('toggle').onclick = () => { void action(async () => {
    if (!selected || dirty) throw new Error('请先保存修改或重新载入。');
    selected = await request(api + '/' + selected.id, 'PATCH', { enabled: !selected.enabled }, selected.etag);
    await refreshList(); renderEditor();
  }); };
  get('archive').onclick = () => { void action(async () => {
    if (!selected || !confirm('归档后禁止新运行，历史引用保留。确认删除此自定义定义？')) return;
    selected = await request(api + '/' + selected.id, 'DELETE', undefined, selected.etag); dirty = false; await refreshList(); renderEditor();
  }); };
  get('version').onchange = () => {
    if (!selected) return;
    if (dirty && !confirm('切换版本将放弃未保存修改。继续？')) { get<HTMLSelectElement>('version').value = 'draft'; return; }
    const revision = val('version'); draft = structuredClone(revision === 'draft' ? selected.draft : selected.revisions.find(r => r.revision === Number(revision))!.config);
    dirty = false; renderEditor(); get<HTMLSelectElement>('version').value = revision;
    if (revision !== 'draft') { get<HTMLFieldSetElement>('config-fields').disabled = true; get<HTMLButtonElement>('save-draft').disabled = true; get<HTMLButtonElement>('save-version').disabled = true; get('use-version').hidden = selected.origin === 'system' || !!selected.archivedAt; }
  };
  get('use-version').onclick = () => { renderEditor(); dirty = true; get('save-state').textContent = '基于历史版本编辑，保存将创建新修订'; };
  get('editor-content').addEventListener('input', () => { dirty = true; get('save-state').textContent = '有未保存修改'; });
  get('editor-content').addEventListener('change', () => { dirty = true; get('save-state').textContent = '有未保存修改'; });
  get('editor-content').addEventListener('click', e => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button || kind !== 'teams') return;
    draft.members = readMembers();
    if (button.id === 'add-member') {
      const a = agents.find(a => a.enabled && !a.archivedAt); if (!a) return notice('请先创建一个 Agent。');
      draft.members.push({ memberId: `member-${draft.members.length + 1}`, agentRef: { id: a.id, revision: a.revisions.length }, responsibility: a.draft.description, eligibleCapabilities: [] });
    } else if (button.dataset.remove !== undefined) draft.members.splice(Number(button.dataset.remove), 1);
    else if (button.dataset.move !== undefined) { const i = Number(button.dataset.move); const j = i + Number(button.dataset.direction); [draft.members[i], draft.members[j]] = [draft.members[j], draft.members[i]]; }
    else if (button.id === 'sequence-handoffs') get<HTMLTextAreaElement>('handoffs').value = draft.members.slice(1).map((m: any, i: number) => `${draft.members[i].memberId} > ${m.memberId}`).join('\n');
    else return;
    renderMembers(); dirty = true; get('save-state').textContent = '有未保存修改';
  });
  get('test').onclick = () => { void action(test); };
  get('refresh-run').onclick = () => { void action(refreshRun); };
  get('cancel-run').onclick = () => { void action(async () => { if (currentRun) { await request('/api/runs/' + currentRun + '/cancel', 'POST', { reason: 'Studio 操作者取消测试' }); await refreshRun(); } }); };
  addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  void action(async () => {
    const [snapshot, directory] = await Promise.all([request('/api/dashboard'), request('/api/studio/catalog')]);
    operator = snapshot.account.role === 'operator'; catalog = directory;
    get('account').textContent = snapshot.account.username + ' · ' + snapshot.account.role;
    get('heading').textContent = kind === 'agents' ? 'Agent 定义与版本' : '团队构建器';
    get('caption').textContent = kind === 'agents' ? '将指令、模型、工具和执行契约保存为可复用角色。' : '固定成员版本，定义分工与交接，再执行真实团队任务。';
    document.querySelector(`nav a[href="${root}"]`)?.setAttribute('aria-current', 'page');
    get('storage').textContent = directory.persistentStorage ? '定义与运行记录已启用持久化' : '当前为内存模式；重启后自定义配置不保留';
    get('template').hidden = kind !== 'agents'; get('test-capability-label').hidden = kind !== 'teams';
    if (kind === 'teams' && operator) {
      const list = await request('/api/studio/agents');
      agents = await Promise.all(list.map((a: any) => request('/api/studio/agents/' + a.id)));
    }
    await refreshList();
    const id = location.pathname.slice(root.length + 1);
    if (operator && id) await open(id);
    else if (operator && items.length) await open(items[0].id);
    else if (!operator) renderEditor();
    if (operator && initialRunId && /^run-\d+$/.test(initialRunId)) await followRun(initialRunId);
    get<HTMLButtonElement>('new').disabled = !operator;
  });
}

export const STUDIO_HTML = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>AetherHarness · Agent 与团队</title><style>${CONSOLE_STYLE}
.studio-grid{display:grid;grid-template-columns:270px minmax(0,1fr);gap:20px;align-items:start}.definition-row{display:grid;gap:8px;text-align:left;width:100%;color:var(--ink);background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:14px;overflow-wrap:anywhere}.definition-row.selected{border-color:var(--accent)}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}fieldset{border:1px solid var(--line);border-radius:8px;min-width:0;padding:14px}#config-fields{border:0;padding:0}#editor-content{gap:20px}.advanced{padding-top:15px}.studio-grid input,.studio-grid select,.studio-grid textarea{max-width:100%;width:100%}.studio-grid input[type=checkbox]{width:auto}#run-result pre{max-height:320px;padding:10px 0}#run-result h4{margin-top:14px}#run-result details{padding:12px}#editor h2{font-size:22px}#save-state{min-height:1.6em}.toolbar{border-top:1px solid var(--line);padding-top:16px}.studio-grid>aside{position:sticky;top:18px}#list{max-height:72vh;overflow:auto}button{touch-action:manipulation}@media(max-width:1000px){.studio-grid{grid-template-columns:1fr}.studio-grid>aside{position:static}#list{max-height:300px}}@media(max-width:600px){.form-grid{grid-template-columns:1fr}.shell{padding:16px}.studio-grid .select{min-width:0}}
</style></head><body><aside class="sidebar"><a class="brand" href="/"><span class="mark">A</span>AetherHarness</a><nav aria-label="控制台导航"><a href="/">工作台</a><a href="/runs">任务执行</a><a href="/studio/agents">Agent 中心</a><a href="/teams">团队</a><a href="/workflows">工作流</a><a href="/delivery">验收与交付</a><a href="/settings">系统设置</a></nav><p class="sidebar-footer muted small" id="storage"></p></aside>
<div class="surface"><header class="top"><div class="row between"><strong>Agent Studio</strong><span id="account" class="muted small"></span></div></header><main class="shell stack">
<div class="section-title"><div class="stack"><h1 id="heading">Agent 与团队</h1><p id="caption" class="muted"></p></div><a class="link" href="/agents">系统 Agent 实时负载</a></div>
<p class="notice" id="notice" role="alert"></p><div class="studio-grid"><aside class="stack"><div class="row"><select id="template" class="select" aria-label="新建模板"><option value="developer">Developer 模板</option><option value="tester">Tester 模板</option></select><button id="new" class="btn primary" disabled>创建</button></div>
<input id="search" class="select" placeholder="搜索名称或标识" aria-label="搜索定义"><div class="row between"><select id="filter" class="select" aria-label="筛选定义"><option value="all">全部定义</option><option value="custom">自定义</option><option value="system">系统</option><option value="archived">已归档</option></select><span id="list-count" class="muted small"></span></div><div id="list" class="stack"></div></aside>
<div class="stack"><section class="panel stack" id="editor"><div class="row between"><h2 id="editor-title">选择一个定义</h2><span id="version-info" class="muted small"></span></div><div class="row"><label>版本 <select class="select" id="version"><option value="draft">草稿</option></select></label><button class="btn" id="use-version" hidden>基于此版本编辑</button><button class="btn" id="reload">重新载入</button><button class="btn" id="copy" hidden>复制</button><button class="btn" id="toggle" hidden>停用</button><button class="btn" id="archive" hidden>删除／归档</button></div>
<form id="editor-form" class="stack"><fieldset id="config-fields"><div id="editor-content" class="stack"></div></fieldset><div class="row toolbar"><button class="btn" type="button" id="save-draft">保存草稿</button><button class="btn primary" type="submit" id="save-version">保存固定版本</button><span id="save-state" class="muted small" role="status"></span></div></form>
<details id="testing"><summary>真实测试与执行预览</summary><div class="stack advanced"><p class="muted small" id="test-caption"></p><label class="stack small">测试输入（JSON）<textarea id="test-input" class="select" rows="4">{"goal":"检查输入参数验证，并给出改进建议。"}</textarea></label><label class="stack small" id="test-capability-label">所需能力（仅能力路由时填写）<input class="select" id="test-capability" placeholder="例如 code_generation"></label><button class="btn primary" type="button" id="test" hidden>运行已保存版本</button></div></details></section>
<section id="test-results" class="panel stack" hidden><div class="row between"><h3>真实运行证据</h3><div class="row"><button class="btn" id="refresh-run">刷新</button><button class="btn" id="cancel-run">取消运行</button></div></div><div id="run-result" class="stack"></div></section></div></div></main></div><script>(${studioPage.toString()})();</script></body></html>`;
