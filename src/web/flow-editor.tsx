import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Handle, Position, useReactFlow, applyNodeChanges, applyEdgeChanges,
  type NodeProps, type Node, type Edge, type Connection, type NodeChange, type EdgeChange } from '@xyflow/react';
import type { Graph, GraphNode, GraphKind, GraphDefinition, Binding, GraphIssue } from '../studio/graph.js';
import type { TeamDefinition } from '../studio/definitions.js';
import './flow-editor.css';

const kinds: Array<[GraphKind, string, string]> = [['start', 'Start', '输入边界'], ['agent', 'Agent', '固定团队成员'], ['tool', 'Tool', '授权工具'], ['condition', 'Condition', '互斥 true / false'],
  ['parallel', 'Parallel', '子流程分支全部汇合'], ['loop', 'Repair Loop', '开发 → 验收 → 反馈'], ['subworkflow', 'Subworkflow', '固定子流程版本'],
  ['verification', 'Verification', '服务端验收契约'], ['approval', 'Human Approval', '持久等待与批准'], ['delivery', 'Patch Delivery', '审批后检查并交付补丁'], ['end', 'End', '输出边界']];
const statuses: Record<string, string> = { pending: '排队', running: '运行中', completed: '完成', failed: '失败', paused: '等待审批', needs_human: '未收敛，待人工处理', cancelled: '取消', cancelling: '正在取消' };
const json = (value: unknown) => JSON.stringify(value, null, 2);
async function api(path: string, method = 'GET', body?: unknown, etag?: string): Promise<any> {
  const response = await fetch('/api/studio/' + path, { method, headers: { 'Content-Type': 'application/json', ...(etag ? { 'If-Match': etag } : {}),
    ...(path === 'runs' && method === 'POST' ? { 'Idempotency-Key': crypto.randomUUID() } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (response.status === 401) { location.href = '/login?next=' + encodeURIComponent(location.pathname); throw new Error('请登录。'); }
  const value = await response.json(); if (!response.ok) throw new Error(value.error?.message ?? value.error ?? '请求失败'); return value;
}
type CanvasNode = Node<{ label: string; kind: GraphKind; status?: string; detail: string }>;
function StudioNode({ data, selected }: NodeProps<CanvasNode>) {
  return <div className={`studio-node ${selected ? 'selected' : ''} ${data.status ?? ''}`}>
    {data.kind !== 'start' && <Handle type="target" position={Position.Left} id="in" />}
    <span className="node-kind">{kinds.find(k => k[0] === data.kind)?.[1]}</span><strong>{data.label}</strong>
    <div className="flow-node-meta">{data.detail}</div><span className="node-status">{data.status ? statuses[data.status] ?? data.status : '待运行'}</span>
    {data.kind === 'condition' ? <><Handle type="source" position={Position.Right} id="true" style={{ top: '35%' }} /><Handle type="source" position={Position.Right} id="false" style={{ top: '75%' }} /></>
      : data.kind !== 'end' && <Handle type="source" position={Position.Right} id="out" />}
  </div>;
}
const nodeTypes = { studio: StudioNode };
function JsonEditor({ value, label, onChange }: { value: unknown; label: string; onChange: (value: any) => void }) {
  const [source, setSource] = useState(json(value)), [error, setError] = useState('');
  useEffect(() => { setSource(json(value)); setError(''); }, [json(value)]);
  return <label>{label}<textarea className="select" aria-label={label} rows={5} value={source} aria-invalid={!!error} onChange={e => { setSource(e.target.value); try { const parsed = JSON.parse(e.target.value); setError(''); onChange(parsed); } catch { setError('JSON 格式不完整，尚未应用；修正后才能保存或运行。'); } }} />{error && <span role="alert">{error}</span>}</label>;
}
function Editor() {
  const flow = useReactFlow();
  const [graph, setGraph] = useState<Graph>(); const [saved, setSaved] = useState<GraphDefinition>(); const [items, setItems] = useState<any[]>([]);
  const [teams, setTeams] = useState<TeamDefinition[]>([]); const [catalog, setCatalog] = useState<any>(); const [blank, setBlank] = useState<Graph>();
  const [selected, setSelected] = useState(''); const [revision, setRevision] = useState('draft'); const [template, setTemplate] = useState('sequence');
  const [notice, setNotice] = useState(''); const [saving, setSaving] = useState(false); const [validation, setValidation] = useState<GraphIssue[]>([]);
  const [history, setHistory] = useState<Graph[]>([]), [redo, setRedo] = useState<Graph[]>([]);
  const [dimensions, setDimensions] = useState<Record<string, { width: number; height: number }>>({});
  const [input, setInput] = useState('{"goal":"实现一个有参数校验的函数，并验证输出。"}'); const [run, setRun] = useState<any>(); const [debugTab, setDebugTab] = useState('attempts');
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [port, setPort] = useState('out'); const [compare, setCompare] = useState('');
  const stream = useRef<EventSource | undefined>(undefined); const latestRun = useRef(''); const loading = useRef(false); const refreshPending = useRef(false); const busy = useRef(false);
  const editable = revision === 'draft' && !saved?.archivedAt;
  const dirty = revision === 'draft' && !!graph && (!saved || json(graph) !== json(saved.draft));
  const matchingRun = !!run && json(graph) === json(run.definitions.workflow?.graph);
  function validEditors() { if (document.querySelector('textarea[aria-invalid="true"]')) throw new Error('请先修正属性面板中的 JSON 错误。'); }
  const team = teams.find(t => t.id === graph?.teamRef?.id)?.revisions.find(r => r.revision === graph?.teamRef?.revision)?.config;
  const node = graph?.nodes.find(n => n.id === selected);
  const update = (next: Graph, remember = true) => { if (!editable) return; if (remember && graph) { setHistory(h => [...h.slice(-39), structuredClone(graph)]); setRedo([]); } setGraph(next); setValidation([]); };
  const patchNode = (patch: Partial<GraphNode>) => graph && update({ ...graph, nodes: graph.nodes.map(n => n.id === selected ? { ...n, ...patch } : n) });
  const config = (patch: Partial<GraphNode['config']>) => node && patchNode({ config: { ...node.config, ...patch } });
  async function action(fn: () => Promise<void>) { if (busy.current) return; busy.current = true; setSaving(true); setNotice(''); try { await fn(); } catch (e: any) { setNotice(e.message); } finally { busy.current = false; setSaving(false); } }
  async function list() { setItems(await api('workflows')); }
  async function open(id: string) {
    if (dirty && !confirm('放弃未保存修改并打开其他工作流？')) return;
    const item = await api('workflows/' + id); setSaved(item); setGraph(item.draft); setRevision('draft'); setHistory([]); setRedo([]); setSelected(''); setValidation([]);
    historyReplace('/workflows/' + id); setTimeout(() => flow.setViewport(item.draft.viewport), 0);
  }
  function historyReplace(path: string) { window.history.replaceState(null, '', path); }
  async function refreshRun(id: string) {
    refreshPending.current = true;
    if (loading.current) return; loading.current = true;
    try { while (refreshPending.current) {
      refreshPending.current = false; const requested = latestRun.current || id;
      const value = await api('runs/' + requested);
      if (latestRun.current === requested) { setRun(value); if (!['pending', 'running', 'cancelling'].includes(value.status)) stream.current?.close(); }
    } }
    finally { loading.current = false; }
  }
  async function followRun(id: string) {
    stream.current?.close(); latestRun.current = id;
    historyReplace(location.pathname + '?run=' + id);
    stream.current = new EventSource('/api/runs/' + id + '/events');
    stream.current.onmessage = () => { void refreshRun(id).catch(e => setNotice(e.message)); };
    stream.current.addEventListener('reset', () => { void refreshRun(id).catch(e => setNotice(e.message)); });
    stream.current.onerror = () => setNotice('执行事件连接中断，正在重连；可手动刷新证据。');
    await refreshRun(id);
  }
  useEffect(() => {
    void action(async () => {
      const [directory, templates, ts] = await Promise.all([api('catalog'), api('workflow-templates'), api('teams')]);
      setCatalog(directory); setBlank(templates.blank); setTeams(await Promise.all(ts.map((t: any) => api('teams/' + t.id))));
      await list(); const initialRun = new URLSearchParams(location.search).get('run');
      const id = /^\/workflows\/([\w-]+)$/.exec(location.pathname)?.[1];
      if (id) { const item = await api('workflows/' + id); setSaved(item); setGraph(item.draft); setTimeout(() => flow.setViewport(item.draft.viewport), 0); }
      else setGraph(templates.blank);
      if (initialRun && /^run-\d+$/.test(initialRun)) await followRun(initialRun);
    }); return () => stream.current?.close();
  }, []);
  useEffect(() => { const listener = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', listener); return () => window.removeEventListener('beforeunload', listener); }, [dirty]);
  function undoChange(forward = false) { const stack = forward ? redo : history; const previous = stack.at(-1); if (!previous || !graph || !editable) return;
    if (forward) { setRedo(stack.slice(0, -1)); setHistory([...history, graph]); } else { setHistory(stack.slice(0, -1)); setRedo([...redo, graph]); } setGraph(previous); }
  const defaults = (kind: GraphKind): GraphNode['config'] => {
    const first = team?.members[0]?.memberId ?? '', second = team?.members[1]?.memberId ?? first;
    return kind === 'agent' ? { memberId: first } : kind === 'tool' ? { toolId: 'static_analyzer' } : kind === 'condition' ? { predicate: { left: { source: 'input', path: ['approved'] }, operator: 'eq', right: true } }
      : kind === 'loop' ? { developer: first, tester: second, maxIterations: 3, threshold: 1, verification: 'static-review' }
      : kind === 'verification' ? { auditors: [second], verification: 'static-review', target: { source: 'input', path: ['candidate'] } }
      : kind === 'subworkflow' ? {} : kind === 'parallel' ? { branches: [] } : kind === 'delivery' ? { sourceNodeId: graph?.nodes.find(n => n.type === 'loop' && n.config.verification === 'repository')?.id, message: '批准交付已通过固定仓库验收的候选补丁？', expiresInMs: 3600000 } : kind === 'approval' ? { message: '请核对上游产物后批准继续执行。', expiresInMs: 3600000 } : {};
  };
  function addNode(kind: GraphKind, position = { x: 250 + (graph?.nodes.length ?? 0) * 25, y: 120 + (graph?.nodes.length ?? 0) * 20 }) {
    if (!graph || !editable) return; const id = kind + '-' + crypto.randomUUID().slice(0, 8);
    const added: GraphNode = { id, name: kinds.find(k => k[0] === kind)![1], type: kind, position, bindings: {}, config: defaults(kind), timeoutMs: 120000 };
    update({ ...graph, nodes: [...graph.nodes, added] }); setSelected(id);
  }
  function connect(connection: Connection) {
    if (!graph || !editable || !connection.source || !connection.target || connection.source === connection.target) return;
    const source = graph.nodes.find(n => n.id === connection.source)!;
    if (source.type !== 'condition' && graph.edges.some(e => e.from === source.id)) { setNotice('普通节点只能有一个后继；并行请使用 Parallel。'); return; }
    const port = source.type === 'condition' ? connection.sourceHandle as 'true' | 'false' : undefined;
    if (source.type === 'condition' && !['true', 'false'].includes(port ?? '')) { setNotice('请选择 true 或 false 出口。'); return; }
    if (graph.edges.some(e => e.from === source.id && e.port === port)) { setNotice('该出口已连接，请先断开。'); return; }
    update({ ...graph, edges: [...graph.edges, { id: 'edge-' + crypto.randomUUID().slice(0, 8), from: connection.source, to: connection.target, port }] });
  }
  const nodes: CanvasNode[] = useMemo(() => (graph?.nodes ?? []).map(n => ({ id: n.id, type: 'studio', position: n.position, selected: n.id === selected, measured: dimensions[n.id],
    data: { label: n.name, kind: n.type, status: matchingRun ? run?.attempts?.filter((a: any) => a.nodeId === n.id).at(-1)?.status : undefined,
      detail: n.config.memberId ?? n.config.toolId ?? (n.type === 'loop' ? `${n.config.maxIterations} 轮 · ${n.config.verification}` : n.config.workflowRef ? `${n.config.workflowRef.id} v${n.config.workflowRef.revision}` : n.id) } })), [graph, selected, dimensions, run, matchingRun]);
  const edges: Edge[] = (graph?.edges ?? []).map(e => ({ id: e.id, source: e.from, target: e.to, sourceHandle: e.port ?? 'out', targetHandle: 'in', label: e.port, type: 'smoothstep' }));
  function onNodesChange(changes: NodeChange<CanvasNode>[]) {
    const measured = changes.filter(c => c.type === 'dimensions' && c.dimensions);
    if (measured.length) setDimensions(previous => { const next = { ...previous }; let changed = false;
      for (const change of measured) if (change.type === 'dimensions' && change.dimensions && (next[change.id]?.width !== change.dimensions.width || next[change.id]?.height !== change.dimensions.height)) { next[change.id] = change.dimensions; changed = true; }
      return changed ? next : previous;
    });
    if (!graph) return; const select = changes.find(c => c.type === 'select' && c.selected); if (select && 'id' in select) setSelected(select.id);
    if (!editable || !changes.some(c => c.type === 'position' || c.type === 'remove')) return;
    const next = applyNodeChanges(changes, nodes);
    update({ ...graph, nodes: graph.nodes.filter(n => next.some(c => c.id === n.id)).map(n => ({ ...n, position: next.find(c => c.id === n.id)!.position })), edges: graph.edges.filter(e => next.some(n => n.id === e.from) && next.some(n => n.id === e.to)) }, changes.some(c => c.type === 'remove'));
  }
  function onEdgesChange(changes: EdgeChange[]) { if (!graph || !editable || !changes.some(c => c.type === 'remove')) return; const kept = applyEdgeChanges(changes, edges); update({ ...graph, edges: graph.edges.filter(e => kept.some(k => k.id === e.id)) }); }
  async function validate() { validEditors(); const result = await api('workflow-validate', 'POST', graph); setValidation(result.errors); setNotice(result.valid ? '校验通过：可编译为 Harness 工作流。' : '校验未通过，请修正下方问题。'); return result.valid; }
  async function save(fixVersion = false) {
    validEditors();
    if (!graph || !editable) return; let item = saved;
    if (!item) { const slug = prompt('工作流唯一标识（字母开头）：', 'workflow-' + Date.now()); if (!slug) return; item = await api('workflows', 'POST', { slug, config: graph }); }
    else item = await api('workflows/' + item.id + '/draft', 'PUT', graph, item.etag);
    setSaved(item); historyReplace('/workflows/' + item!.id);
    if (fixVersion) { item = await api('workflows/' + item!.id + '/revisions', 'POST', {}, item!.etag); setSaved(item); setNotice('可执行固定版本 v' + item!.revisions.length + ' 已保存。'); }
    else setNotice('草稿已保存；只有通过校验的固定版本可运行。');
    await list();
  }
  async function test(single = false) {
    validEditors();
    if (!saved || dirty || !saved.revisions.length) throw new Error('请先保存可执行固定版本；测试不会使用未保存草稿。');
    const version = revision === 'draft' ? saved.revisions.length : Number(revision);
    if (revision === 'draft' && json(graph) !== json(saved.revisions.at(-1)!.config)) throw new Error('当前草稿与最后固定版本不同，请保存固定版本后再运行。');
    const value = await api('runs', 'POST', { kind: single ? 'node-test' : 'workflow', workflowRef: { id: saved.id, revision: version }, input: JSON.parse(input), ...(single ? { nodeId: selected } : {}) });
    await followRun(value.runId);
  }
  function newWorkflow() {
    if (!blank || dirty && !confirm('放弃未保存修改？')) return;
    const next = structuredClone(blank); next.teamRef = graph?.teamRef ?? blank.teamRef;
    if (template !== 'blank' && team?.members.length) {
      const body: GraphNode[] = ['repair', 'repository'].includes(template) ? [{ id: 'repair', name: 'Developer / Tester 修复循环', type: 'loop', config: { ...defaults('loop'), verification: template === 'repository' ? 'repository' : 'static-review' }, bindings: {}, position: { x: 350, y: 160 }, timeoutMs: 180000 }]
        : team.members.map((m, i) => ({ id: 'agent-' + (i + 1), name: m.memberId, type: 'agent', config: { memberId: m.memberId },
          bindings: i ? { goal: { source: 'input', path: ['goal'] }, previous: { source: 'node', nodeId: 'agent-' + i, path: [] } } : {}, position: { x: 320 + i * 250, y: 160 }, timeoutMs: 120000 } as GraphNode));
      if (template === 'repository') body.push({ id: 'delivery', type: 'delivery', name: '审批并交付补丁', position: { x: 640, y: 160 }, bindings: {}, config: { ...defaults('delivery'), sourceNodeId: 'repair' }, timeoutMs: 30000 });
      const end = next.nodes[1]; end.position.x = 350 + body.length * 250; end.bindings = { result: { source: 'node', nodeId: body.at(-1)!.id, path: [] } };
      next.nodes = [next.nodes[0], ...body, end]; next.edges = next.nodes.slice(1).map((n, i) => ({ id: 'e-' + i, from: next.nodes[i].id, to: n.id }));
      next.name = template === 'repository' ? '固定仓库修复与补丁交付' : template === 'repair' ? '验证与失败反馈' : '团队顺序协作';
    }
    setSaved(undefined); setRevision('draft'); setGraph(next); setHistory([]); setRedo([]); setValidation([]); setSelected(''); historyReplace('/workflows');
    setTimeout(() => flow.fitView(), 0);
  }
  const selectMembers = (value: string | undefined, onChange: (value: string) => void, optional = false) => <select className="select" value={value ?? ''} onChange={e => onChange(e.target.value)}>
    <option value="">{optional ? '工作流主体' : '选择成员'}</option>{team?.members.map(m => <option key={m.memberId} value={m.memberId}>{m.memberId} · Agent v{m.agentRef.revision}</option>)}</select>;
  const referenceSelect = (ref: { id: string; revision: number } | undefined, onChange: (value: { id: string; revision: number }) => void) =>
    <select className="select" value={ref ? `${ref.id}@${ref.revision}` : ''} onChange={e => { const [id, r] = e.target.value.split('@'); onChange({ id, revision: Number(r) }); }}><option value="">选择子工作流版本</option>
      {items.filter(w => !w.archivedAt && w.id !== saved?.id).flatMap(w => Array.from({ length: w.revision }, (_, i) => <option key={w.id + i} value={`${w.id}@${i + 1}`}>{w.name} · v{i + 1}</option>))}</select>;
  if (!graph) return <div className="shell"><h1>Workflow Studio</h1><p role="alert">{notice || '正在载入…'}</p><a href="/">返回工作台</a></div>;
  return <div className="flow-app">
    <nav className="flow-nav" aria-label="控制台导航"><a className="brand" href="/">AetherHarness</a><a href="/studio/agents">Agent 中心</a><a href="/teams">团队</a><a href="/workflows" aria-current="page">工作流</a><a href="/runs">运行记录</a><span className="flow-status">Workflow Studio · Harness 执行内核</span></nav>
    <header className="flow-bar"><select aria-label="打开工作流" className="select" value={saved?.id ?? ''} onChange={e => e.target.value && void action(() => open(e.target.value))}><option value="">未保存工作流</option>{items.map(w => <option key={w.id} value={w.id}>{w.name}{w.archivedAt ? '（已归档）' : ''}</option>)}</select>
      <input aria-label="工作流名称" className="select" disabled={!editable} value={graph.name} onChange={e => update({ ...graph, name: e.target.value })} />
      <select aria-label="工作流版本" className="select" value={revision} onChange={e => { if (dirty && !confirm('切换版本将放弃未保存修改。继续？')) return; const v = e.target.value; setRevision(v); setGraph(structuredClone(v === 'draft' ? saved!.draft : saved!.revisions.find(r => r.revision === Number(v))!.config)); setHistory([]); setRedo([]); setSelected(''); const next = v === 'draft' ? saved!.draft : saved!.revisions.find(r => r.revision === Number(v))!.config; void flow.setViewport(next.viewport); }} disabled={!saved}><option value="draft">草稿</option>{saved?.revisions.map(r => <option key={r.revision} value={r.revision}>v{r.revision}{saved.publishedRevision === r.revision ? ' · 已发布' : ''}</option>)}</select>
      <button className="btn" disabled={!editable || saving} onClick={() => void action(() => save())}>保存草稿</button><button className="btn" disabled={saving} onClick={() => void action(async () => { await validate(); })}>校验</button>
      <button className="btn" disabled={!editable || saving} onClick={() => void action(() => save(true))}>保存固定版本</button><button className="btn primary" disabled={saving || !saved?.revisions.length || (revision === 'draft' && (dirty || json(graph) !== json(saved.revisions.at(-1)?.config)))} onClick={() => void action(() => test())}>运行</button>
      <button className="btn" disabled={saving || !saved?.revisions.length || dirty} onClick={() => void action(async () => { const item = await api('workflows/' + saved!.id + '/publish', 'POST', { revision: revision === 'draft' ? saved!.revisions.length : Number(revision) }, saved!.etag); setSaved(item); setNotice('已发布为本地可选版本。'); })}>发布</button>
      <span className="flow-status">{dirty ? '有未保存修改' : revision === 'draft' ? '草稿' : '固定版本只读'}{saved?.publishedRevision ? ` · 发布 v${saved.publishedRevision}` : ''}</span>
    </header>
    <p className="flow-error" role="alert">{notice}</p>
    <div className="flow-workspace"><aside className="flow-library"><h3>节点库</h3><small>点击添加，或拖到画布</small>{kinds.map(([kind, label, description]) => <button key={kind} className="btn" disabled={!editable || kind === "delivery" && !catalog?.repositoryDelivery} draggable={editable && (kind !== "delivery" || !!catalog?.repositoryDelivery)} onDragStart={e => e.dataTransfer.setData('application/aether-node', kind)} onClick={() => addNode(kind)} title={description}>{label}</button>)}
      <small>Loop 是验证修复循环。并行分支引用独立子工作流，全部成功后才汇合。</small></aside>
      <div className="flow-canvas" onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }} onDrop={e => { e.preventDefault(); const kind = e.dataTransfer.getData('application/aether-node') as GraphKind; if (kinds.some(k => k[0] === kind)) addNode(kind, flow.screenToFlowPosition({ x: e.clientX, y: e.clientY })); }}>
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={connect}
          onNodeClick={(_, n) => setSelected(n.id)} onPaneClick={() => setSelected('')} onNodeDragStart={() => { if (editable) { setHistory(h => [...h.slice(-39), structuredClone(graph)]); setRedo([]); } }}
          onMoveEnd={(event, viewport) => { if (event && editable) setGraph(g => g && ({ ...g, viewport })); }} nodesDraggable={editable} nodesConnectable={editable} deleteKeyCode={editable ? ['Backspace', 'Delete'] : null}
          colorMode="dark" defaultViewport={graph.viewport} minZoom={0.1} maxZoom={4} fitView><Background gap={22} size={1} /><Controls /><MiniMap pannable zoomable nodeColor="#5167a8" maskColor="#0b1120bb" /></ReactFlow>
        <div className="flow-controls flow-actions"><button className="btn" disabled={!history.length || !editable} onClick={() => undoChange()}>撤销</button><button className="btn" disabled={!redo.length || !editable} onClick={() => undoChange(true)}>重做</button></div>
      </div>
      <aside className="flow-properties"><div className="flow-prop-title"><h3>{node ? node.name : '工作流属性'}</h3>{node && <button className="link" onClick={() => setSelected('')}>工作流</button>}</div>
        <fieldset disabled={!editable} style={{ border: 0, padding: 0, display: 'grid', gap: 12 }}>
        {!node ? <><label>固定团队版本<select className="select" aria-label="固定团队版本" value={graph.teamRef ? `${graph.teamRef.id}@${graph.teamRef.revision}` : ''} onChange={e => { const [id, r] = e.target.value.split('@'); update({ ...graph, teamRef: { id, revision: Number(r) } }); }}><option value="">选择团队</option>{teams.filter(t => t.enabled && !t.archivedAt).flatMap(t => t.revisions.map(r => <option key={t.id + r.revision} value={`${t.id}@${r.revision}`}>{r.config.name} · v{r.revision}</option>))}</select></label>
          <label>说明<textarea className="select" value={graph.description} onChange={e => update({ ...graph, description: e.target.value })} /></label>
          <label>执行预算（毫秒）<input className="select" type="number" min={100} max={600000} value={graph.timeoutMs} onChange={e => update({ ...graph, timeoutMs: Number(e.target.value) })} /></label>
          <label>最大步骤<input className="select" type="number" min={1} max={500} value={graph.maxSteps} onChange={e => update({ ...graph, maxSteps: Number(e.target.value) })} /></label>
          <details><summary>输入／输出契约</summary><JsonEditor label="输入 Schema" value={graph.inputSchema} onChange={inputSchema => update({ ...graph, inputSchema })} /><JsonEditor label="输出 Schema" value={graph.outputSchema} onChange={outputSchema => update({ ...graph, outputSchema })} /></details></>
          : <><label>节点名称<input className="select" value={node.name} onChange={e => patchNode({ name: e.target.value })} /></label><small className="muted">{node.id} · {node.type}</small>
            <label>超时（毫秒）<input className="select" type="number" value={node.timeoutMs} min={100} max={600000} onChange={e => patchNode({ timeoutMs: Number(e.target.value) })} /></label>
            {['agent', 'tool'].includes(node.type) && <label>执行成员{selectMembers(node.config.memberId, memberId => config({ memberId: memberId || undefined }), node.type === 'tool')}</label>}
            {node.type === 'tool' && <label>工具<select className="select" value={node.config.toolId ?? ''} onChange={e => config({ toolId: e.target.value })}>{catalog?.tools.filter((t: any) => t.available).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
            {node.type === 'condition' && <JsonEditor label="分支条件（false 为默认出口）" value={node.config.predicate} onChange={predicate => config({ predicate })} />}
            {node.type === 'subworkflow' && <label>子工作流版本{referenceSelect(node.config.workflowRef, workflowRef => config({ workflowRef }))}</label>}
            {node.type === 'parallel' && <><small>每个分支使用相同输入，输出位于 branches.1、branches.2。分支必须使用同一团队版本。</small>{(node.config.branches ?? []).map((ref, i) => <div key={i}>{referenceSelect(ref, value => config({ branches: node.config.branches!.map((r, j) => i === j ? value : r) }))}<button className="link" onClick={() => config({ branches: node.config.branches!.filter((_, j) => i !== j) })}>移除分支</button></div>)}<button className="btn" onClick={() => config({ branches: [...(node.config.branches ?? []), { id: '', revision: 1 }] })}>添加分支</button></>}
            {node.type === 'loop' && <><label>Developer{selectMembers(node.config.developer, developer => config({ developer }))}</label><label>Tester／诊断成员{selectMembers(node.config.tester, tester => config({ tester }))}</label><label>最大轮数<input className="select" type="number" min={1} max={8} value={node.config.maxIterations} onChange={e => config({ maxIterations: Number(e.target.value) })} /></label><label>收敛阈值<input className="select" type="number" min={0.5} max={1} step={0.05} value={node.config.threshold} onChange={e => config({ threshold: Number(e.target.value) })} /></label><small>通过验收且达到阈值才结束。输出包含 artifact、verification 和 iterations。</small></>}
            {['verification', 'loop'].includes(node.type) && <label>固定验收配置<select className="select" value={node.config.verification ?? 'static-review'} onChange={e => config({ verification: e.target.value as any })}><option value="static-review">静态安全 + 指定成员审查（不含功能测试）</option><option value="repository" disabled={!catalog?.repositoryVerification}>服务端固定限流器仓库容器验收{catalog?.repositoryVerification ? "" : "（未配置）"}</option></select></label>}
            {node.type === 'verification' && <><JsonEditor label="被验收产物映射" value={node.config.target} onChange={target => config({ target })} /><label>审查成员（逗号分隔）<input className="select" value={(node.config.auditors ?? []).join(',')} onChange={e => config({ auditors: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} /></label></>}
            {node.type === 'delivery' && <label>候选来源<select className="select" value={node.config.sourceNodeId ?? ''} onChange={e => config({ sourceNodeId: e.target.value })}><option value="">选择上游固定仓库修复循环</option>{graph.nodes.filter(n => n.type === 'loop' && n.config.verification === 'repository').map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select></label>}
            {['approval', 'delivery'].includes(node.type) && <><label>审批问题<textarea className="select" value={node.config.message} onChange={e => config({ message: e.target.value })} /></label><label>过期时间（毫秒）<input className="select" type="number" min={1000} max={86400000} value={node.config.expiresInMs} onChange={e => config({ expiresInMs: Number(e.target.value) })} /></label><small>审批绑定此次运行与映射输入，等待时释放执行名额。</small></>}
            {node.type !== 'delivery' && <><JsonEditor label="输入映射（字段 → 来源）" value={node.bindings} onChange={bindings => patchNode({ bindings })} />
            <small>来源：input / node / literal。例：{`{"goal":{"source":"input","path":["goal"]}}`}。空映射使用工作流输入。</small></>}
            <button className="btn" onClick={() => { update({ ...graph, nodes: graph.nodes.filter(n => n.id !== selected), edges: graph.edges.filter(e => e.from !== selected && e.to !== selected) }); setSelected(''); }}>删除节点</button>
          </>}
        </fieldset>
        <details><summary>键盘连线与连接管理</summary><div className="flow-connection"><label>起点<select aria-label="起点" className="select" value={from} onChange={e => setFrom(e.target.value)}><option value="">请选择</option>{graph.nodes.filter(n => n.type !== 'end').map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select></label><label>出口<select aria-label="出口" className="select" value={port} onChange={e => setPort(e.target.value)}><option value="out">out</option><option value="true">true</option><option value="false">false</option></select></label><label>终点<select aria-label="终点" className="select" value={to} onChange={e => setTo(e.target.value)}><option value="">请选择</option>{graph.nodes.filter(n => n.type !== 'start').map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select></label><button className="btn" disabled={!editable} onClick={() => connect({ source: from, target: to, sourceHandle: port, targetHandle: 'in' })}>连接节点</button>
          {graph.edges.map(e => <div key={e.id} className="small">{e.from} → {e.to} {e.port}<button className="link" disabled={!editable} onClick={() => update({ ...graph, edges: graph.edges.filter(edge => edge.id !== e.id) })}>断开</button></div>)}</div></details>
        <details><summary>模板与版本</summary><div className="stack"><select className="select" aria-label="工作流模板" value={template} onChange={e => setTemplate(e.target.value)}><option value="sequence">当前团队顺序协作</option><option value="repair">Developer + Tester 修复循环</option><option value="repository" disabled={!catalog?.repositoryDelivery}>固定仓库修复与补丁交付</option><option value="blank">Start / End</option></select><button className="btn" onClick={newWorkflow}>从模板新建</button>
          <button className="btn" disabled={!saved?.revisions.length} onClick={() => void action(async () => { const slug = prompt('副本标识'); if (!slug) return; const item = await api('workflows', 'POST', { slug, copyFrom: { id: saved!.id, revision: revision === 'draft' ? saved!.revisions.length : Number(revision) } }); await list(); setSaved(item); setGraph(item.draft); setRevision('draft'); historyReplace('/workflows/' + item.id); })}>复制工作流</button>
          <button className="btn" disabled={revision === 'draft'} onClick={() => { setRevision('draft'); setNotice('基于历史版本编辑，保存将创建新版本。'); }}>基于此版本编辑</button>
          <select aria-label="对比版本" className="select" value={compare} onChange={e => setCompare(e.target.value)}><option value="">与历史版本比较</option>{saved?.revisions.map(r => <option key={r.revision} value={r.revision}>v{r.revision}</option>)}</select>{compare && <pre className="flow-versions small">{json({ currentHash: saved?.revisions.find(r => r.revision === Number(revision))?.hash ?? '草稿', comparedHash: saved?.revisions.find(r => r.revision === Number(compare))?.hash,
            changedFields: Object.keys(graph).filter(key => json((graph as any)[key]) !== json((saved?.revisions.find(r => r.revision === Number(compare))?.config as any)?.[key])) })}</pre>}
          <button className="btn" disabled={!saved?.revisions.length} onClick={() => void action(async () => { const bundle = await api(`workflows/${saved!.id}/export?revision=${revision === 'draft' ? saved!.revisions.length : revision}`); const href = URL.createObjectURL(new Blob([json(bundle)], { type: 'application/json' })); const a = document.createElement('a'); a.href = href; a.download = saved!.slug + '.json'; a.click(); URL.revokeObjectURL(href); })}>导出模板 JSON</button>
          <label>导入模板<input type="file" accept=".json,application/json" onChange={e => { const file = e.target.files?.[0]; if (file) void action(async () => { if (file.size > 1000000) throw new Error('模板最多 1 MB'); const bundle = JSON.parse(await file.text()); const slug = prompt('导入后唯一标识'); if (!slug) return; const item = await api('workflow-import', 'POST', { slug, bundle }); await list(); setSaved(item); setGraph(item.draft); setRevision('draft'); historyReplace('/workflows/' + item.id); }); }} /></label>
          <button className="btn" disabled={!saved || !!saved.archivedAt} onClick={() => void action(async () => { if (!confirm('归档后不能开始新运行，历史记录保留。继续？')) return; const item = await api('workflows/' + saved!.id, 'DELETE', undefined, saved!.etag); setSaved(item); await list(); })}>归档工作流</button>
        </div></details>
      </aside></div>
    <section className="flow-debug"><div className="row between"><h3>运行调试与执行证据</h3><span className="flow-status">{run ? `${run.runId} · ${statuses[run.status] ?? run.status}` : '尚未运行'}</span></div>
      {!!validation.length && <div className="flow-issues" role="alert">{validation.map((issue, i) => <button className="btn" key={i} onClick={() => { if (issue.nodeId) { setSelected(issue.nodeId); void flow.fitView({ nodes: [{ id: issue.nodeId }] }); } }}>{issue.nodeId ?? '工作流'} · {issue.message}</button>)}</div>}
      <div className="flow-debug-grid"><div className="stack"><label>测试输入（JSON）<textarea className="select" aria-label="测试输入（JSON）" rows={6} value={input} onChange={e => setInput(e.target.value)} /></label><small className="muted">单节点测试需提供映射后的完整输入；全流程测试使用工作流原始输入。</small>
        <div className="flow-actions"><button className="btn primary" disabled={saving || !saved?.revisions.length || (revision === 'draft' && (dirty || json(graph) !== json(saved.revisions.at(-1)?.config)))} onClick={() => void action(() => test())}>测试全流程</button><button className="btn" disabled={saving || !node || !['agent', 'tool', 'start', 'end', 'verification'].includes(node.type)} onClick={() => void action(() => test(true))}>测试所选节点</button></div>
        {run && <><button className="btn" onClick={() => void action(() => refreshRun(run.runId))}>刷新执行证据</button><button className="btn" disabled={!['pending', 'running', 'paused'].includes(run.status)} onClick={() => void action(async () => { const response = await fetch('/api/runs/' + run.runId + '/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json({ reason: '设计器取消' }) }); if (!response.ok) throw new Error('取消失败，请刷新运行状态后重试。'); await refreshRun(run.runId); })}>取消运行</button><a href={'/runs/' + run.runId}>运行详情与报告</a>{!matchingRun && <><small>当前画布与运行版本不同，节点状态叠加已关闭。</small><button className="btn" onClick={() => void action(async () => { if (dirty && !confirm('查看运行版本将放弃未保存修改。继续？')) return; const ref = run.definitions.workflow; const item = await api('workflows/' + ref.id); setSaved(item); setGraph(ref.graph); setRevision(String(ref.revision)); setSelected(''); setHistory([]); setRedo([]); historyReplace('/workflows/' + ref.id + '?run=' + run.runId); })}>查看运行使用的画布</button></>}<small className="muted">固定版本 v{run.definitions.workflow?.revision} · {run.definitions.executionHash.slice(0, 16)}<br />{run.verification ? `验收 ${run.verification.passed ? '通过' : '未通过'} · ${run.verification.score}` : '尚无正式验收结论'}</small></>}
      </div><div className="stack">{run?.approvals?.map((approval: any) => <div className="flow-approval" key={approval.id}><strong>{approval.message}</strong><p>{approval.status} · {approval.nodeId}</p><details><summary>核对审批输入</summary><pre>{json(approval.input)}</pre></details>{approval.status === 'pending' && run.status === 'paused' && <div className="flow-actions">{['approve', 'reject'].map(decision => <button className="btn" key={decision} disabled={saving} onClick={() => void action(async () => { const reason = prompt('审批备注（可选）') ?? ''; await api(`runs/${run.runId}/approvals/${approval.id}`, 'POST', { decision, reason, key: crypto.randomUUID() }); await followRun(run.runId); })}>{decision === 'approve' ? '批准继续' : '拒绝'}</button>)}</div>}</div>)}
        <div className="flow-actions">{[['attempts', '节点记录'], ['events', 'Agent／工具事件'], ['rounds', '修复轮次'], ['snapshot', '版本快照']].map(([key, label]) => <button className="btn" aria-pressed={debugTab === key} key={key} onClick={() => setDebugTab(key)}>{label}</button>)}</div>
        <div className="flow-logs">{run?.error && <p className="flow-error">{run.error}</p>}{!run && <p className="muted">保存固定版本并运行后，这里显示 Harness 的真实执行事件。</p>}
          {debugTab === 'attempts' && run?.attempts?.map((attempt: any, i: number) => <details key={attempt.meta?.attemptId ?? i}><summary><span className="badge">{statuses[attempt.status] ?? attempt.status}</span>{attempt.nodeName} · {attempt.nodeId}{attempt.endTime ? ` · ${attempt.endTime - attempt.startTime} ms` : ''}{attempt.meta?.iteration ? ` · 第 ${attempt.meta.iteration} 轮` : ''}</summary><pre>{json({ input: attempt.input, output: attempt.output, error: attempt.error, verification: attempt.verification, meta: attempt.meta })}</pre></details>)}
          {debugTab === 'events' && run?.events?.map((event: any) => <details key={event.id}><summary>#{event.seq} {event.kind} · {event.data?.nodePath ?? event.message}</summary><pre>{json(event.data)}</pre></details>)}
          {debugTab === 'rounds' && run?.events?.filter((e: any) => e.kind === 'loop.iteration').map((event: any) => <details key={event.id}><summary>{event.data.nodeId} · 第 {event.data.iteration} 轮 · {event.data.passed ? '通过' : '未通过'} · {event.data.score}</summary><pre>{json(event.data)}</pre></details>)}
          {debugTab === 'snapshot' && run && <pre>{json(run.definitions)}</pre>}
        </div></div></div>
    </section></div>;
}
createRoot(document.getElementById('flow-root')!).render(<ReactFlowProvider><Editor /></ReactFlowProvider>);
