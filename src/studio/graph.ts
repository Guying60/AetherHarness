import type { RevisionRef, ValueSchema, Definition, TeamConfig } from './definitions.js';
import { clone, object, text, identifier, number, validateSchema, validateValue, StudioError } from './definitions.js';
import type { WorkflowDefinition, WorkflowNode, VerificationSpec } from '../types/index.js';
import { asCode } from '../scenarios/rate-limiter.js';

export type Binding = { source: 'input' | 'node' | 'literal'; nodeId?: string; path?: string[]; value?: unknown };
export type Predicate = { left: Binding; operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'exists'; right?: unknown };
export type GraphKind = 'start' | 'end' | 'agent' | 'tool' | 'condition' | 'parallel' | 'loop' | 'subworkflow' | 'verification' | 'approval' | 'delivery';
export interface GraphNode {
  id: string; name: string; type: GraphKind; position: { x: number; y: number };
  bindings: Record<string, Binding>;
  config: { memberId?: string; toolId?: string; predicate?: Predicate; workflowRef?: RevisionRef; branches?: RevisionRef[];
    developer?: string; tester?: string; maxIterations?: number; threshold?: number; verification?: 'static-review' | 'repository';
    auditors?: string[]; target?: Binding; message?: string; expiresInMs?: number; sourceNodeId?: string };
  timeoutMs: number;
}
export interface Graph {
  schemaVersion: 1; name: string; description: string; teamRef?: RevisionRef;
  inputSchema: ValueSchema; outputSchema: ValueSchema;
  nodes: GraphNode[]; edges: Array<{ id: string; from: string; to: string; port?: 'true' | 'false' }>;
  timeoutMs: number; maxSteps: number; viewport: { x: number; y: number; zoom: number };
}
export type GraphDefinition = Definition<Graph> & { publishedRevision?: number };
export interface GraphIssue { code: string; message: string; nodeId?: string; path?: string }
export class GraphError extends StudioError {
  constructor(public issues: GraphIssue[]) { super(422, 'INVALID_GRAPH', issues.map(i => (i.nodeId ? i.nodeId + ': ' : '') + i.message).join('\n')); }
}
export const graphKinds: GraphKind[] = ['start', 'end', 'agent', 'tool', 'condition', 'parallel', 'loop', 'subworkflow', 'verification', 'approval', 'delivery'];
const safePart = (part: unknown) => typeof part === 'string' && part.length <= 80 && !['__proto__', 'prototype', 'constructor'].includes(part);
export function validateBinding(value: unknown): asserts value is Binding {
  object(value, 'binding', ['source', 'nodeId', 'path', 'value']);
  if (!['input', 'node', 'literal'].includes(value.source)) throw new GraphError([{ code: 'BINDING', message: '映射来源仅支持 input、node 或 literal。' }]);
  if (value.source === 'node') identifier(value.nodeId, 'binding.nodeId');
  if (value.path !== undefined && (!Array.isArray(value.path) || value.path.length > 12 || !value.path.every(safePart))) throw new GraphError([{ code: 'PATH', message: '映射路径无效或含保留字段。' }]);
  if (value.source === 'literal' && !Object.hasOwn(value, 'value')) throw new GraphError([{ code: 'LITERAL', message: '常量映射需要 value。' }]);
}
export function readBinding(binding: Binding, context: Record<string, any>): any {
  let value = binding.source === 'literal' ? binding.value : binding.source === 'input' ? context.input : context['node_' + binding.nodeId];
  for (const part of binding.path ?? []) {
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, part)) throw new Error(`映射路径不存在: ${(binding.path ?? []).join('.')}`);
    value = value[part];
  }
  if (value === undefined) throw new Error('映射来源尚未产生输出。');
  return clone(value);
}
export function predicateMatches(predicate: Predicate, context: Record<string, any>): boolean {
  if (predicate.operator === 'exists') { try { return readBinding(predicate.left, context) !== undefined; } catch { return false; } }
  const left = readBinding(predicate.left, context), right = predicate.right;
  switch (predicate.operator) {
    case 'eq': return JSON.stringify(left) === JSON.stringify(right);
    case 'neq': return JSON.stringify(left) !== JSON.stringify(right);
    case 'contains': return typeof left === 'string' && typeof right === 'string' ? left.includes(right) : Array.isArray(left) && left.includes(right);
    default:
      if (typeof left !== 'number' || typeof right !== 'number') throw new Error('数值条件需要左右两侧均为 number。');
      return predicate.operator === 'gt' ? left > right : predicate.operator === 'gte' ? left >= right : predicate.operator === 'lt' ? left < right : left <= right;
  }
}
export function graphShape(value: unknown): Graph {
  object(value, 'workflow', ['schemaVersion', 'name', 'description', 'teamRef', 'inputSchema', 'outputSchema', 'nodes', 'edges', 'timeoutMs', 'maxSteps', 'viewport']);
  if (value.schemaVersion !== 1) throw new GraphError([{ code: 'SCHEMA_VERSION', message: '不支持该工作流格式。' }]);
  text(value.name, 'name', 100); text(value.description, 'description', 2000, true);
  if (value.teamRef) { object(value.teamRef, 'teamRef', ['id', 'revision']); identifier(value.teamRef.id, 'teamRef.id'); number(value.teamRef.revision, 'teamRef.revision', 1, 1000000); }
  validateSchema(value.inputSchema); validateSchema(value.outputSchema);
  if (value.inputSchema.type !== 'object' || value.outputSchema.type !== 'object') throw new GraphError([{ code: 'SCHEMA', message: '工作流输入与输出必须为 object。' }]);
  number(value.timeoutMs, 'timeoutMs', 100, 600000); number(value.maxSteps, 'maxSteps', 1, 500);
  object(value.viewport, 'viewport', ['x', 'y', 'zoom']);
  number(value.viewport.x, 'viewport.x', -100000, 100000, false); number(value.viewport.y, 'viewport.y', -100000, 100000, false); number(value.viewport.zoom, 'zoom', 0.1, 4, false);
  if (!Array.isArray(value.nodes) || value.nodes.length > 100 || !Array.isArray(value.edges) || value.edges.length > 250) throw new GraphError([{ code: 'SIZE', message: '最多 100 个节点、250 条连接。' }]);
  for (const n of value.nodes) {
    object(n, 'node', ['id', 'name', 'type', 'position', 'bindings', 'config', 'timeoutMs']); identifier(n.id, 'node.id'); text(n.name, 'node.name', 100);
    if (n.id.includes('__')) throw new GraphError([{ code: 'RESERVED_ID', nodeId: n.id, message: '双下划线保留给编译器内部节点。' }]);
    if (!graphKinds.includes(n.type)) throw new GraphError([{ code: 'NODE_TYPE', nodeId: n.id, message: '不支持此节点类型。' }]);
    number(n.timeoutMs, 'node.timeoutMs', 100, 600000); object(n.position, 'position', ['x', 'y']);
    number(n.position.x, 'x', -100000, 100000, false); number(n.position.y, 'y', -100000, 100000, false);
    object(n.bindings, 'bindings'); if (Object.keys(n.bindings).length > 64) throw new GraphError([{ code: 'BINDINGS', nodeId: n.id, message: '映射字段过多。' }]);
    Object.values(n.bindings).forEach(validateBinding);
    const fields: Record<GraphKind, string[]> = { start: [], end: [], agent: ['memberId'], tool: ['toolId', 'memberId'], condition: ['predicate'],
      parallel: ['branches'], loop: ['developer', 'tester', 'maxIterations', 'threshold', 'verification'], subworkflow: ['workflowRef'],
      verification: ['verification', 'auditors', 'target'], approval: ['message', 'expiresInMs'], delivery: ['sourceNodeId', 'message', 'expiresInMs'] };
    object(n.config, 'config', fields[n.type as GraphKind]);
  }
  for (const edge of value.edges) { object(edge, 'edge', ['id', 'from', 'to', 'port']); identifier(edge.id, 'edge.id'); identifier(edge.from, 'edge.from'); identifier(edge.to, 'edge.to'); if (edge.port !== undefined && !['true', 'false'].includes(edge.port)) throw new GraphError([{ code: 'PORT', message: '条件端口无效。' }]); }
  return clone(value as Graph);
}

export interface CompileContext {
  team: TeamConfig; tools: string[];
  memberTools: Record<string, string[]>;
  resolve: (ref: RevisionRef) => Graph;
  verification: (profile: string, auditors: string[]) => VerificationSpec;
  delivery?: WorkflowDefinition;
  dependencies: Array<{ ref: RevisionRef; graph: Graph }>;
  stack?: string[]; parallel?: boolean;
  budget?: { nodes: number };
}
export function compileGraph(raw: unknown, ctx: CompileContext, id = 'draft', revision = 0): { graph: Graph; workflow: WorkflowDefinition; subworkflows: Map<string, WorkflowDefinition> } {
  const graph = graphShape(raw);
  const budget = ctx.budget ?? { nodes: 0 }; ctx = { ...ctx, budget };
  budget.nodes += graph.nodes.reduce((sum, n) => sum + 1 + (n.type === 'loop' ? 2 : n.type === 'parallel' ? n.config.branches?.length ?? 0 : 0), 0);
  if (budget.nodes > 500) throw new GraphError([{ code: 'EXPANSION_LIMIT', message: '含子工作流的执行节点总数不能超过 500。' }]);
  const issues: GraphIssue[] = [], map = new Map(graph.nodes.map(n => [n.id, n]));
  const issue = (nodeId: string | undefined, code: string, message: string) => issues.push({ nodeId, code, message });
  if (map.size !== graph.nodes.length) issue(undefined, 'DUPLICATE', '节点 ID 重复。');
  if (new Set(graph.edges.map(e => e.id)).size !== graph.edges.length) issue(undefined, 'DUPLICATE_EDGE', '连接 ID 重复。');
  const starts = graph.nodes.filter(n => n.type === 'start'), ends = graph.nodes.filter(n => n.type === 'end');
  if (starts.length !== 1 || ends.length < 1) issue(undefined, 'BOUNDARY', '需要一个 Start 和至少一个 End。');
  for (const e of graph.edges) if (!map.has(e.from) || !map.has(e.to)) issue(e.from, 'DANGLING', '连接引用不存在的节点。');
  const outgoing = (id: string) => graph.edges.filter(e => e.from === id);
  const incoming = (id: string) => graph.edges.filter(e => e.to === id);
  const seen = new Set<string>(), active = new Set<string>();
  const visit = (nodeId: string) => {
    if (active.has(nodeId)) { issue(nodeId, 'CYCLE', '顶层图不能有环；请使用验证修复循环。'); return; }
    if (seen.has(nodeId)) return; seen.add(nodeId); active.add(nodeId);
    for (const e of outgoing(nodeId)) if (map.has(e.to)) visit(e.to);
    active.delete(nodeId);
  };
  if (starts[0]) visit(starts[0].id);
  for (const n of graph.nodes) {
    const out = outgoing(n.id), inc = incoming(n.id);
    if (!seen.has(n.id)) issue(n.id, 'UNREACHABLE', '节点不可从 Start 到达。');
    if (n.type === 'start' && inc.length || n.type === 'end' && out.length) issue(n.id, 'BOUNDARY_EDGE', 'Start 不能有入边，End 不能有出边。');
    if (n.type === 'condition') {
      if (out.length !== 2 || !out.some(e => e.port === 'true') || !out.some(e => e.port === 'false')) issue(n.id, 'CONDITION_PORTS', '条件必须有 true 和 false（默认）两个出口。');
    } else if (out.some(e => e.port) || out.length !== (n.type === 'end' ? 0 : 1)) issue(n.id, 'OUTGOING', '普通节点需要一条后继连接；并行请使用 Parallel 节点。');
  }
  if (issues.length) throw new GraphError(issues);
  // Dominators enforce that every referenced output exists on every route to this node.
  const dominators = new Map(graph.nodes.map(n => [n.id, n.type === 'start' ? new Set([n.id]) : new Set(map.keys())]));
  for (let pass = 0; pass < graph.nodes.length; pass++) for (const n of graph.nodes.filter(n => n.type !== 'start')) {
    const parents = incoming(n.id).map(e => dominators.get(e.from)!);
    dominators.set(n.id, new Set([n.id, ...[...parents[0]].filter(key => parents.every(set => set.has(key)))]));
  }
  const checkBinding = (binding: Binding, nodeId: string) => {
    validateBinding(binding);
    if (binding.source === 'node' && (binding.nodeId === nodeId || !dominators.get(nodeId)!.has(binding.nodeId!))) issue(nodeId, 'UNAVAILABLE_INPUT', '映射只能引用所有路径上均已执行的上游节点。');
    if (binding.source === 'input' && binding.path?.length && graph.inputSchema.additionalProperties === false && !Object.hasOwn(graph.inputSchema.properties ?? {}, binding.path[0])) issue(nodeId, 'INPUT_PATH', '输入 Schema 中没有该映射字段。');
  };
  const members = new Map(ctx.team.members.map(m => [m.memberId, m]));
  const member = (id: unknown) => { if (typeof id !== 'string' || !members.has(id)) throw new Error('必须选择固定团队中的成员。'); return id; };
  const subworkflows = new Map<string, WorkflowDefinition>();
  const nodes: WorkflowNode[] = [];
  const key = (nodeId: string) => 'node_' + nodeId;
  const sub = (ref: RevisionRef, node: GraphNode, suffix: string, parallel: boolean) => {
    object(ref, 'workflowRef', ['id', 'revision']); identifier(ref.id, 'workflowRef.id'); number(ref.revision, 'revision', 1, 1000000);
    const refKey = `${ref.id}@${ref.revision}`, stack = ctx.stack ?? [];
    if (stack.includes(refKey) || stack.length >= 5) throw new Error('子工作流递归或嵌套超过 5 层。');
    const child = ctx.resolve(ref);
    if (child.teamRef?.id !== graph.teamRef?.id || child.teamRef?.revision !== graph.teamRef?.revision) throw new Error('子工作流必须绑定相同团队版本。');
    ctx.dependencies.push({ ref, graph: child });
    const compiled = compileGraph(child, { ...ctx, stack: [...stack, refKey], parallel: ctx.parallel || parallel }, ref.id, ref.revision);
    const subId = `${node.id}__${suffix}__${refKey}`;
    subworkflows.set(subId, compiled.workflow); compiled.subworkflows.forEach((v, k) => subworkflows.set(k, v));
    return subId;
  };
  for (const n of graph.nodes) {
    try {
      Object.values(n.bindings).forEach(b => checkBinding(b, n.id));
      const input = (context: Record<string, any>) => Object.keys(n.bindings).length
        ? Object.fromEntries(Object.entries(n.bindings).map(([key, binding]) => [key, readBinding(binding, context)])) : clone(context.input ?? {});
      const node: WorkflowNode = { id: n.id, name: n.name, type: 'transform', timeoutMs: n.timeoutMs, outputKey: key(n.id), inputTransformer: input };
      const c = n.config;
      if (n.type === 'start') node.inputTransformer = context => { validateValue(context.input, graph.inputSchema, 'workflow.input'); return input(context); };
      if (n.type === 'agent') { node.type = 'agent'; node.agentId = member(c.memberId); node.maxRetries = 0; }
      if (n.type === 'tool') {
        if (!c.toolId || !ctx.tools.includes(c.toolId) || !ctx.team.toolIds.includes(c.toolId)) throw new Error('工具不在团队与服务端许可范围内。');
        if (c.memberId && !ctx.memberTools[member(c.memberId)].includes(c.toolId)) throw new Error('工具不在指定成员白名单。');
        node.type = 'tool'; node.toolId = c.toolId; node.toolMemberId = c.memberId;
      }
      if (n.type === 'condition') {
        object(c.predicate, 'predicate', ['left', 'operator', 'right']); checkBinding(c.predicate.left, n.id);
        if (!['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'exists'].includes(c.predicate.operator)) throw new Error('条件运算符不受支持。');
        node.type = 'condition'; node.conditionFn = context => outgoing(n.id).find(e => e.port === String(predicateMatches(c.predicate!, context)))!.to;
      }
      if (n.type === 'subworkflow') {
        node.type = 'subworkflow'; node.subworkflowId = sub(c.workflowRef!, n, 'sub', false);
        node.inputTransformer = context => ({ input: input(context) }); node.subworkflowOutputOnly = true;
      }
      if (n.type === 'parallel') {
        if (!Array.isArray(c.branches) || c.branches.length < 2 || c.branches.length > 8) throw new Error('并行需要 2–8 个固定子工作流分支。');
        node.type = 'parallel_group'; node.parallelChildIds = c.branches.map((ref, i) => {
          const childId = n.id + '__branch' + (i + 1);
          nodes.push({ id: childId, name: n.name + ' / 分支 ' + (i + 1), type: 'subworkflow', subworkflowId: sub(ref, n, String(i), true),
            subworkflowOutputOnly: true, inputTransformer: context => ({ input: input(context) }), outputKey: key(childId), timeoutMs: n.timeoutMs });
          return childId;
        });
      }
      if (n.type === 'verification') {
        const auditors = c.auditors ?? []; if (!Array.isArray(auditors) || auditors.length > 8) throw new Error('最多 8 位审查成员。'); auditors.forEach(member);
        checkBinding(c.target!, n.id); node.type = 'verification';
        node.verificationSpec = ctx.verification(c.verification ?? 'static-review', auditors);
        node.verifyInputTarget = true; node.inputTransformer = context => readBinding(c.target!, context);
      }
      if (n.type === 'loop') {
        const developer = member(c.developer), tester = member(c.tester);
        number(c.maxIterations, 'maxIterations', 1, 8); number(c.threshold, 'threshold', 0.5, 1, false);
        node.type = 'self_loop';
        node.loopEnvelope = true;
        const targetId = n.id + '__develop', verifyId = n.id + '__verify';
        node.selfLoopConfig = { targetNodeId: targetId, verificationNodeId: verifyId, criticAgentId: tester, maxIterations: c.maxIterations, convergenceThreshold: c.threshold };
        nodes.push({ id: targetId, name: n.name + ' / Developer', type: 'agent', agentId: developer, maxRetries: 0, timeoutMs: n.timeoutMs,
          inputTransformer: context => ({ ...input(context), previous: clone(context.previousAttempt ?? null), feedback: context.diagnosticFeedback ?? '', iteration: context.__loopIteration ?? 1 }) },
        { id: verifyId, name: n.name + ' / 验收', type: 'verification', verificationSpec: ctx.verification(c.verification ?? 'static-review', [tester]) });
      }
      if (n.type === 'approval' || n.type === 'delivery') {
        if (ctx.parallel) throw new Error('当前版本不支持并行分支内等待审批。');
        text(c.message, 'approval.message', 2000); number(c.expiresInMs, 'approval.expiresInMs', 1000, 86400000);
        node.type = 'human_approval'; node.approval = { message: c.message, expiresInMs: c.expiresInMs };
      }
      if (n.type === 'delivery') {
        if (!ctx.delivery) throw new Error('服务端尚未配置固定仓库交付。');
        const source = c.sourceNodeId && map.get(c.sourceNodeId);
        if (!source || source.type !== 'loop' || source.config.verification !== 'repository' || !dominators.get(n.id)!.has(source.id)) {
          throw new Error('补丁交付必须引用所有路径上均已执行的固定仓库修复循环。');
        }
        if (Object.keys(n.bindings).length) throw new Error('补丁交付的输入只能来自指定的修复循环。');
        node.type = 'subworkflow'; node.subworkflowId = ctx.delivery.id;
        subworkflows.set(ctx.delivery.id, ctx.delivery);
        node.inputTransformer = context => {
          const candidate = context[key(source.id)];
          if (!candidate?.verification?.passed || !asCode(candidate.artifact)) throw new Error('候选产物未通过固定仓库验收。');
          return { finalCode: candidate.artifact, lastVerification: candidate.verification };
        };
      }
      if (n.type === 'end') node.outputSchema = graph.outputSchema;
      nodes.push(node);
    } catch (error: any) { issue(n.id, 'NODE_CONFIG', error.message); }
  }
  if (issues.length) throw new GraphError(issues);
  return { graph, workflow: { id, version: String(revision), name: graph.name, description: graph.description, entryNodeId: starts[0].id,
    timeoutMs: graph.timeoutMs, maxSteps: graph.maxSteps, nodes, edges: graph.edges.map(e => ({ from: e.from, to: e.to })) }, subworkflows };
}

export function blankGraph(teamRef?: RevisionRef): Graph {
  return { schemaVersion: 1, name: '新工作流', description: '', teamRef, inputSchema: { type: 'object' }, outputSchema: { type: 'object' },
    nodes: [{ id: 'start', name: '开始', type: 'start', position: { x: 80, y: 160 }, bindings: {}, config: {}, timeoutMs: 60000 },
      { id: 'end', name: '结束', type: 'end', position: { x: 450, y: 160 }, bindings: { result: { source: 'node', nodeId: 'start', path: [] } }, config: {}, timeoutMs: 60000 }],
    edges: [{ id: 'start-end', from: 'start', to: 'end' }], timeoutMs: 180000, maxSteps: 100, viewport: { x: 0, y: 0, zoom: 1 } };
}
