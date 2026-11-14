import { join } from 'node:path';
import { AgentRegistry } from '../agent/agent-registry.js';
import type { LlmConfig, LlmProvider } from '../agent/llm/index.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import type { AgentProfile, WorkflowDefinition } from '../types/index.js';
import { StudioCatalog, agentTemplate } from './catalog.js';
import { AgentConfig, StudioSnapshot, RevisionRef, StudioError, clone, definition, hash, object, text, number, validateValue } from './definitions.js';
import { ConfiguredBrain } from './configured-brain.js';
import { WorkflowStore } from './workflow-store.js';
import { compileGraph, Graph, GraphError } from './graph.js';
import type { VerificationSpec } from '../types/index.js';
import { makeVerificationSpec } from '../scenarios/rate-limiter.js';
import { buildRepositoryDeliveryWorkflow, type RepositoryProject } from '../scenarios/repository-repair.js';

// VM subprocesses are not an OS security boundary; generated code execution requires an approval/sandbox policy.
const allowedTools = new Set(['static_analyzer', 'git_patch_manager']);
export interface PreparedStudioRun {
  title: string;
  input: Record<string, any>;
  workflow: WorkflowDefinition;
  snapshot: StudioSnapshot;
  agents: AgentRegistry;
  tools: ToolRegistry;
  verificationTools?: ToolRegistry;
  subworkflows?: Map<string, WorkflowDefinition>;
  approvedSubworkflowTools?: Map<string, ToolRegistry>;
}
export class StudioService {
  readonly catalog: StudioCatalog;
  readonly model: StudioSnapshot['model'];
  readonly workflows: WorkflowStore;
  private readonly delivery?: WorkflowDefinition;
  constructor(private readonly tools: ToolRegistry, profiles: AgentProfile[], private readonly provider?: LlmProvider,
    private readonly config?: LlmConfig, directory?: string, private readonly repositoryProfile?: RepositoryProject) {
    if (repositoryProfile && tools.has('git_read_baseline') && tools.has('git_check_patch')) {
      const workflow = buildRepositoryDeliveryWorkflow();
      const baseline = { id: 'n_git_baseline', name: 'Read pinned baseline', type: 'tool' as const, toolId: 'git_read_baseline', outputKey: 'seedSource', inputTransformer: () => ({}) };
      this.delivery = { ...workflow, entryNodeId: baseline.id, nodes: [baseline, ...workflow.nodes],
        edges: [{ from: baseline.id, to: workflow.entryNodeId }, ...workflow.edges] };
    }
    this.model = { ref: { id: 'default', revision: hash({ provider: provider?.name, model: provider?.model,
      endpoint: config?.baseUrl, temperature: config?.temperature, maxTokens: config?.maxTokens, timeoutMs: config?.timeoutMs }).slice(0, 16) },
      label: provider ? `${provider.name}:${provider.model}` : '模型尚未配置', ready: !!provider };
    const agents = profiles.map(profile => {
      const config: AgentConfig = { ...agentTemplate('developer', this.model.ref), name: profile.name, role: profile.role,
        roleLabel: profile.role, description: profile.description, systemPrompt: profile.systemPrompt,
        capabilities: profile.capabilities, toolIds: profile.toolIds, behavior: 'template',
        limits: { maxTurns: 1, timeoutMs: 60000, maxTokens: 2200, maxConcurrency: profile.maxConcurrency } };
      return definition(profile.id, config, 'system', 'system', profile.id);
    });
    const members = agents.map(a => ({ memberId: a.id, agentRef: { id: a.id, revision: 1 },
      responsibility: a.draft.description, eligibleCapabilities: Object.keys(a.draft.capabilities) }));
    const team = definition('default-team', { name: '系统工程团队', description: '现有六角色团队模板。复制后配置执行顺序与工具权限。',
      members, routing: 'sequence' as const, handoffs: members.slice(1).map((m, i) => ({ from: members[i].memberId, to: m.memberId })),
      toolIds: [...new Set(agents.flatMap(a => a.draft.toolIds))] }, 'system', 'system', 'default-team');
    this.catalog = new StudioCatalog(tools.getAll().map(t => t.id), agents, [team], directory ? join(directory, 'studio') : undefined);
    try { this.workflows = new WorkflowStore(directory ? join(directory, 'workflows') : undefined, graph => this.compile(graph)); }
    catch (error) { this.catalog.close(); throw error; }
  }
  redact = (value: string): string => this.config?.apiKey ? value.split(this.config.apiKey).join('[REDACTED]') : value;
  close(): void { this.catalog.close(); this.workflows.close(); }
  safe<T>(value: T): T { return value === undefined ? value : JSON.parse(this.redact(JSON.stringify(value))) as T; }
  getCatalog() {
    return { model: clone(this.model), roles: ['orchestrator', 'requirement_analyst', 'architect', 'developer', 'code_reviewer', 'security_auditor', 'qa_verifier', 'critic'],
      tools: this.tools.getAll().map(({ id, name, description, parameters }) => ({ id, name, description, parameters,
        available: allowedTools.has(id), reason: allowedTools.has(id) ? undefined : '尚未开放自定义运行审批；该工具在 Studio 中禁止调用。' })),
      templates: { developer: agentTemplate('developer', this.model.ref), tester: agentTemplate('qa_verifier', this.model.ref) },
      repositoryVerification: !!this.repositoryProfile && this.tools.has('container_test_runner'),
      repositoryDelivery: !!this.delivery,
      persistentStorage: this.catalog.persistent() };
  }
  private checkModel(config: AgentConfig): void {
    if (!this.provider) throw new StudioError(503, 'MODEL_UNAVAILABLE', '尚未配置服务端模型。请配置模型后测试，自定义运行不使用离线降级。');
    if (config.modelConfigRef.id !== this.model.ref.id || config.modelConfigRef.revision !== this.model.ref.revision) {
      throw new StudioError(409, 'MODEL_REVISION_UNAVAILABLE', '该模型配置版本已不可用。请在新 Agent 版本中选择当前模型。');
    }
  }
  prepare(body: unknown): PreparedStudioRun {
    if (body && typeof body === 'object' && ['workflow', 'node-test'].includes((body as any).kind)) return this.prepareWorkflow(body);
    object(body, 'request', ['kind', 'agentRef', 'teamRef', 'input', 'capability']);
    if (!['agent-test', 'team'].includes(body.kind)) throw new StudioError(422, 'INVALID_RUN', '请选择 agent-test 或 team。');
    object(body.input, 'input');
    if (JSON.stringify(body.input).length > 64000) throw new StudioError(422, 'INPUT_TOO_LARGE', '测试输入最多 64000 字符。');
    const ref: RevisionRef = body.kind === 'team' ? body.teamRef : body.agentRef;
    object(ref, 'ref', ['id', 'revision']); text(ref.id, 'ref.id', 64); number(ref.revision, 'ref.revision', 1, 1000000);
    let snapshot: StudioSnapshot;
    if (body.kind === 'team') {
      const team = this.catalog.revision('teams', ref, true);
      snapshot = { schemaVersion: 1, compilerVersion: 'team-v1', kind: 'team', team: { ...ref, hash: team.hash, config: team.config },
        agents: team.config.members.map(member => {
          const agent = this.catalog.revision('agents', member.agentRef, true);
          return { memberId: member.memberId, ...member.agentRef, hash: agent.hash, config: agent.config };
        }), executionHash: '', model: clone(this.model) };
    } else {
      const agent = this.catalog.revision('agents', ref, true);
      snapshot = { schemaVersion: 1, compilerVersion: 'team-v1', kind: 'agent-test', agents: [{ memberId: 'agent', ...ref, hash: agent.hash, config: agent.config }], executionHash: '', model: clone(this.model) };
    }
    const team = snapshot.team?.config;
    const { agents: registry, tools: runTools } = this.runtime(snapshot);
    const capability = team?.routing === 'capability' ? body.capability : undefined;
    if (team?.routing === 'capability') {
      text(capability, 'capability', 64);
      if (!registry.getAll().some(a => (a.profile.capabilities[capability] ?? 0) >= 0.5)) throw new StudioError(422, 'NO_CAPABLE_MEMBER', '团队中没有具备该能力的启用成员。');
    }
    const ordered = capability ? [snapshot.agents[0]] : snapshot.agents;
    if (team && !capability) {
      for (let i = 1; i < ordered.length; i++) {
        if (!team.handoffs.some(h => h.from === ordered[i - 1].memberId && h.to === ordered[i].memberId)) {
          throw new StudioError(422, 'MISSING_HANDOFF', `缺少 ${ordered[i - 1].memberId} → ${ordered[i].memberId} 的交接。`);
        }
      }
    }
    const workflow: WorkflowDefinition = {
      id: `studio-${snapshot.team?.id ?? snapshot.agents[0].id}`, version: String(ref.revision),
      name: team?.name ?? snapshot.agents[0].config.name, description: team?.description ?? 'Agent test',
      entryNodeId: 'step-1', maxSteps: ordered.length, timeoutMs: Math.min(600000, snapshot.agents.reduce((sum, a) => sum + a.config.limits.timeoutMs, 0)),
      nodes: ordered.map((agent, i) => ({ id: `step-${i + 1}`, name: capability ? `按能力分配：${capability}` : agent.config.name,
        type: 'agent', agentId: capability ? undefined : agent.memberId, agentCapability: capability, maxRetries: 0,
        timeoutMs: capability ? Math.min(...snapshot.agents.map(a => a.config.limits.timeoutMs)) : agent.config.limits.timeoutMs,
        outputKey: `output-${i + 1}`, inputTransformer: ctx => i === 0 ? clone(ctx.input) : { ...clone(ctx.input), previous: clone(ctx.lastOutput) } })),
      edges: ordered.slice(1).map((_, i) => ({ from: `step-${i + 1}`, to: `step-${i + 2}` }))
    };
    snapshot.executionHash = hash({ compilerVersion: snapshot.compilerVersion, team: snapshot.team, agents: snapshot.agents, model: this.model, capability, workflow });
    return { title: workflow.name, workflow, input: clone(body.input), snapshot: clone(snapshot), agents: registry, tools: runTools };
  }
  private runtime(snapshot: StudioSnapshot) {
    snapshot.agents.forEach(a => this.checkModel(a.config));
    const team = snapshot.team?.config;
    const runTools = this.tools.scoped((team?.toolIds ?? snapshot.agents[0].config.toolIds).filter(id => allowedTools.has(id)));
    const registry = new AgentRegistry(runTools);
    for (const agent of snapshot.agents) {
      const config = agent.config, member = team?.members.find(m => m.memberId === agent.memberId);
      const toolIds = config.toolIds.filter(id => runTools.has(id));
      const profile: AgentProfile = { id: agent.memberId, capacityKey: agent.id, name: config.name, role: config.role,
        description: config.description, systemPrompt: config.systemPrompt + (member ? `\nTeam responsibility: ${member.responsibility}` : ''),
        capabilities: snapshot.kind === 'team' && team?.routing === 'capability'
          ? Object.fromEntries((member?.eligibleCapabilities ?? []).map(key => [key, config.capabilities[key]])) : config.capabilities,
        toolIds, currentLoad: 0, totalTokensUsed: 0, maxConcurrency: config.limits.maxConcurrency, version: String(agent.revision),
        memoryWindow: config.memoryPolicy.mode === 'none' ? 0 : config.memoryPolicy.maxMessages + 1 };
      registry.register(profile, { brain: new ConfiguredBrain(config, this.provider!, runTools.scoped(toolIds).getAll().map(({ id, description, parameters }) => ({ id, description, parameters })), this.redact) });
    }
    return { agents: registry, tools: runTools };
  }
  verification(profile: string, auditors: string[]): VerificationSpec {
    if (profile === 'repository') {
      if (!this.repositoryProfile || !this.tools.has('container_test_runner')) throw new Error('服务端尚未配置固定仓库与容器验收。');
      const spec = makeVerificationSpec({ auditors, requireCluster: false });
      return { ...spec, executableSandboxCheck: { ...spec.executableSandboxCheck, toolId: 'container_test_runner', timeoutMs: 15000 },
        multiAgentVoting: { auditorAgentIds: auditors, minPassRatio: 1 } };
    }
    if (profile !== 'static-review') throw new Error('未知的服务端验收配置。');
    return { rules: [{ id: 'CODE-001', name: '非空代码与静态安全检查', severity: 'critical', check: output => {
      const code = typeof output === 'string' ? output : output?.code;
      const passed = typeof code === 'string' && code.trim().length > 0 && !/(^|[^.\w])eval\s*\(|new\s+Function\s*\(/.test(code);
      return { passed, score: passed ? 1 : 0, message: passed ? '静态契约通过；未运行功能测试。' : '缺少代码或包含动态执行。' }; } }],
      confidenceThreshold: 1, multiAgentVoting: { auditorAgentIds: auditors, minPassRatio: 1 } };
  }
  compile(graph: Graph, id = 'draft', revision = 0, frozen?: StudioSnapshot) {
    if (!graph.teamRef) throw new GraphError([{ code: 'TEAM_REQUIRED', message: '请绑定一个固定团队版本。' }]);
    const team = frozen?.team?.config ?? this.catalog.revision('teams', graph.teamRef, true).config;
    const dependencies: NonNullable<StudioSnapshot['dependencies']> = [];
    const memberTools = Object.fromEntries(team.members.map(member => [member.memberId,
      (frozen?.agents.find(a => a.memberId === member.memberId)?.config ?? this.catalog.revision('agents', member.agentRef, true).config).toolIds]));
    const compiled = compileGraph(graph, { team, memberTools, tools: [...allowedTools].filter(tool => this.tools.has(tool)), delivery: this.delivery, dependencies, stack: [`${id}@${revision}`],
      resolve: ref => frozen ? clone(frozen.dependencies!.find(d => d.ref.id === ref.id && d.ref.revision === ref.revision)?.graph ?? (() => { throw new Error('快照依赖缺失'); })()) : this.workflows.revision(ref, true).config,
      verification: (profile, auditors) => this.verification(profile, auditors) }, id, revision);
    return { ...compiled, dependencies };
  }
  prepareWorkflow(body: unknown, frozen?: StudioSnapshot): PreparedStudioRun {
    object(body, 'request', ['kind', 'workflowRef', 'input', 'nodeId']); object(body.input, 'input');
    if (JSON.stringify(body.input).length > 64000) throw new StudioError(422, 'INPUT_TOO_LARGE', '输入最多 64000 字符。');
    object(body.workflowRef, 'workflowRef', ['id', 'revision']);
    const ref = { id: body.workflowRef.id, revision: body.workflowRef.revision };
    const revision = frozen?.workflow ? { config: frozen.workflow.graph, hash: frozen.workflow.hash } : this.workflows.revision(ref, true);
    const graph = revision.config;
    const team = frozen?.team ?? { ...graph.teamRef!, ...this.catalog.revision('teams', graph.teamRef!, true) };
    const snapshot: StudioSnapshot = frozen ? clone(frozen) : { schemaVersion: 1, compilerVersion: 'graph-v1', kind: body.kind,
      workflow: { ...ref, hash: revision.hash, graph }, team: { ...graph.teamRef!, hash: team.hash, config: team.config },
      agents: team.config.members.map(member => ({ memberId: member.memberId, ...member.agentRef, ...this.catalog.revision('agents', member.agentRef, true) })),
      model: clone(this.model), executionHash: '' };
    const compiled = this.compile(graph, ref.id, ref.revision, frozen);
    snapshot.dependencies = compiled.dependencies;
    const repositoryVerification = [graph, ...compiled.dependencies.map(d => d.graph)].some(g => g.nodes.some(n => n.config.verification === 'repository'));
    if (repositoryVerification) {
      const profileHash = hash(this.repositoryProfile);
      if (frozen && frozen.verificationProfileHash !== profileHash) throw new StudioError(409, 'VERIFICATION_PROFILE_CHANGED', '固定仓库或容器配置已改变，不能恢复旧运行。');
      snapshot.verificationProfileHash = profileHash;
    }
    if (body.kind === 'node-test') {
      const node = compiled.workflow.nodes.find(n => n.id === body.nodeId);
      if (!node || !['agent', 'tool', 'transform', 'verification'].includes(node.type)) throw new StudioError(422, 'NODE_TEST', '单节点测试仅支持 Agent、Tool、Start/End、Verification；请输入映射后的样例输入。');
      node.inputTransformer = context => clone(context.input); snapshot.testNodeId = node.id;
      compiled.workflow = { ...compiled.workflow, entryNodeId: node.id, nodes: [node], edges: [] };
    } else validateValue(body.input, graph.inputSchema, 'workflow.input');
    snapshot.executionHash = hash({ compilerVersion: snapshot.compilerVersion, workflow: snapshot.workflow, team: snapshot.team, agents: snapshot.agents,
      dependencies: snapshot.dependencies, model: snapshot.model, testNodeId: snapshot.testNodeId, verificationProfileHash: snapshot.verificationProfileHash });
    const approvedSubworkflowTools = this.delivery && compiled.subworkflows.has(this.delivery.id)
      ? new Map([[this.delivery.id, this.tools.scoped(['git_read_baseline', 'static_analyzer', 'git_patch_manager', 'git_check_patch'])]]) : undefined;
    return { title: graph.name, input: clone(body.input), workflow: compiled.workflow, subworkflows: compiled.subworkflows, approvedSubworkflowTools,
      snapshot, ...this.runtime(snapshot),
      // Only the server-authored verification contract receives container access; agents and Tool nodes do not.
      verificationTools: this.tools.scoped(repositoryVerification ? ['container_test_runner'] : []) };
  }
}
