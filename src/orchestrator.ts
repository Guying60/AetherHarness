/**
 * Orchestrator — the platform façade.
 *
 * This is what the previous version was missing: a single object that wires the workflow
 * engine, the scheduler, the self-loop, the verifier and the optimizer into ONE run, and
 * emits a stream of structured events for a UI to consume.
 *
 * The old `SoftwareEngineeringScenario.runScenario()` bypassed `workflowEngine`,
 * `scheduler` and `optimizer` entirely (hence the "queue length: 0 / 0 prompt adjustments"
 * lines in the demo). Here every module is on the critical path.
 */
import { randomUUID } from 'node:crypto';
import { StudioService, PreparedStudioRun } from './studio/service.js';
import type { StudioSnapshot } from './studio/definitions.js';
import { hash, StudioError, clone, object, text } from './studio/definitions.js';
import { executionContext } from './workflow/execution-context.js';
import {
  ExecutionStatus,
  HumanEscalationRequest,
  NodeExecutionRecord,
  OrchestratorEvent,
  VerificationResult,
  WorkflowDefinition,
  WorkflowExecutionState,
  TaskSpec
} from './types/index.js';
import { AgentRegistry } from './agent/agent-registry.js';
import { ToolRegistry } from './tools/tool-registry.js';
import { createBuiltinTools } from './tools/builtin-tools.js';
import { KnowledgeBase } from './knowledge/knowledge-base.js';
import { DynamicScheduler } from './scheduler/dynamic-scheduler.js';
import { VerificationEngine } from './verification/verification-engine.js';
import { SelfLoopEngine, SelfLoopIterationRecord } from './selfloop/self-loop-engine.js';
import { FeedbackOptimizer } from './optimization/feedback-optimizer.js';
import { WorkflowEngine } from './workflow/workflow-engine.js';
import { RunStore } from './store/run-store.js';
import {
  RateLimiterTask,
  asCode,
  buildAgentTeam,
  buildRateLimiterWorkflow,
  createRateLimiterTasks,
  renderRateLimiter
} from './scenarios/rate-limiter.js';
import {
  buildRepositoryDeliveryWorkflow, buildRepositoryWorkflow, MAX_REPOSITORY_GOAL, repositoryTools,
  type RepositoryConfig, type RepositoryProject
} from './scenarios/repository-repair.js';
import {
  AppliedLlm,
  LlmProvider,
  LlmConfig,
  LlmTelemetry,
  applyLlm,
  createProviderFromConfig,
  DeepSeekProvider,
  isLlmConfigured,
  resolveLlmConfig
} from './agent/llm/index.js';

export interface RunSnapshot {
  resumeRecords?: Record<string, { record: NodeExecutionRecord; context: Record<string, any> }>;
  runInput?: Record<string, any>;
  activeElapsedMs?: number;
  approvals?: Array<{ id: string; nodeId: string; message: string; input: unknown; inputHash: string; createdAt: number; expiresAt: number;
    status: 'pending' | 'approved' | 'rejected' | 'expired'; actor?: string; reason?: string; decidedAt?: number; decisionKey?: string }>;
  runId: string;
  taskId: string;
  title: string;
  difficulty: string;
  status: ExecutionStatus;
  workflow: WorkflowDefinition;
  definitions?: StudioSnapshot;
  attempts?: NodeExecutionRecord[];
  result?: unknown;
  requestKey?: { actor: string; key: string; hash: string };
  state?: WorkflowExecutionState;
  startedAt: number;
  finishedAt?: number;
  escalation?: HumanEscalationRequest;
  summary?: string;
  patch?: { filePath: string; patch: string; hasChanges: boolean; stats?: any };
  verification?: VerificationResult;
  iterations?: number;
  artifact?: string;
  error?: string;
  citations?: string[];
  knowledgeHits?: Array<{ id: string; title: string; content: string; version?: string; citation: string }>;
  nodeProgress?: Record<string, Pick<NodeExecutionRecord, 'status' | 'startTime' | 'endTime' | 'branchTaken' | 'error'> & { nodeName?: string; toolId?: string }>;
  loopRounds?: Array<Omit<SelfLoopIterationRecord, 'output'> & { nodeId: string }>;
  humanDecision?: 'retry' | 'review' | 'abort';
  retryOf?: string;
  project?: RepositoryProject;
  goal?: string;
  baselineVerification?: VerificationResult;
  baselineScan?: Array<{ rule: string; severity: string; line: number; message: string }>;
  plan?: { acceptanceCriteria?: string[]; invariants?: string[] };
  retryAvailable?: boolean;
  restored?: boolean;
  modelLabel?: string;
  requestedBy?: string;
  cancellation?: { actor: string; reason: string; requestedAt: number };
}

export type EventListener = (event: OrchestratorEvent) => void;
type RunTask = RateLimiterTask & { repository?: true; studio?: never };
type StudioTask = { id: string; title: string; prompt: string; difficulty: string; repository?: never; studio: PreparedStudioRun };
type RunOptions = { maxIterationsOverride?: number; retryOf?: string; onStart?: (runId: string) => void; requestedBy?: string; resume?: RunSnapshot };

export interface OrchestratorOptions {
  onEvent?: EventListener;
  schedulerOptions?: ConstructorParameters<typeof DynamicScheduler>[1];
  maxConcurrentRuns?: number;
  project?: RepositoryConfig;
  dataDir?: string;
  /**
   * When provided (and configured), every agent with an LLM spec runs on the remote model
   * with the deterministic brain as a fallback. Omit it to stay fully offline.
   */
  llm?: LlmConfig;
}

const DEFAULT_MAX_CONCURRENT_RUNS = 3;

export class Orchestrator {
  public readonly tools = new ToolRegistry();
  public readonly agents: AgentRegistry;
  public readonly knowledge: KnowledgeBase;
  public readonly verification: VerificationEngine;
  public readonly selfLoop: SelfLoopEngine;
  public readonly scheduler: DynamicScheduler;
  public readonly optimizer: FeedbackOptimizer;
  public readonly workflow: WorkflowEngine;
  public readonly studio: StudioService;

  private runs: Map<string, RunSnapshot> = new Map();
  private runOrder: string[] = [];
  private taskById: Map<string, RateLimiterTask> = new Map();
  private taskByRun = new Map<string, RunTask>();
  private listeners: Set<EventListener> = new Set();
  private readonly events = new Map<string, OrchestratorEvent[]>();
  private store?: RunStore;
  private closing = false;
  private readonly idleWaiters: Array<() => void> = [];
  private counter = 0;
  private escalationsRaised = 0;
  private readonly maxConcurrentRuns: number;
  private runningCount = 0;
  private readonly runQueue = new Map<string, (reserved: boolean) => void>();
  private readonly runControllers = new Map<string, AbortController>();
  private llmApplied?: AppliedLlm;
  private llmLabel = 'offline · deterministic brains';
  private readonly repository?: RepositoryProject;
  private readonly strictLive: boolean;
  private readonly llmPolicy?: ReturnType<DeepSeekProvider['getPolicy']>;

  constructor(options: OrchestratorOptions = {}) {
    this.maxConcurrentRuns = options.maxConcurrentRuns ?? DEFAULT_MAX_CONCURRENT_RUNS;
    if (!Number.isSafeInteger(this.maxConcurrentRuns) || this.maxConcurrentRuns < 1) {
      throw new Error('maxConcurrentRuns must be a positive integer');
    }

    // --- infrastructure ---
    createBuiltinTools().forEach(tool => this.tools.register(tool));

    this.agents = new AgentRegistry(this.tools);
    this.knowledge = new KnowledgeBase({
      id: 'ai4se-kb',
      name: 'Enterprise secure coding + rate limiter standards',
      chunkSize: 120,
      hybridAlpha: 0.55
    });
    this.seedKnowledge();

    // --- engines ---
    this.verification = new VerificationEngine(this.agents, this.tools);
    this.selfLoop = new SelfLoopEngine(this.agents, this.verification);
    this.optimizer = new FeedbackOptimizer(this.agents, this.tools);
    this.scheduler = new DynamicScheduler(
      this.agents,
      options.schedulerOptions ?? {},
      (message, data) => this.emit('scheduler', data?.runId ?? 'system', message, 'sched', data)
    );
    this.workflow = new WorkflowEngine({
      agentRegistry: this.agents,
      toolRegistry: this.tools,
      scheduler: this.scheduler,
      verificationEngine: this.verification,
      selfLoopEngine: this.selfLoop,
      optimizer: this.optimizer
    });

    // --- team (optionally LLM-backed, with the deterministic brains as fallback) ---
    const offlineTeam = buildAgentTeam();
    let team = offlineTeam;

    const config = options.llm && resolveLlmConfig(options.llm);
    let provider: LlmProvider | undefined;
    this.strictLive = config?.fallbackToOffline === false;
    if (config && !isLlmConfigured(config) && config.fallbackToOffline === false) {
      throw new Error('Strict live mode requires a configured model provider.');
    }
    if (config && isLlmConfigured(config)) {
      provider = createProviderFromConfig(config);
      if (provider instanceof DeepSeekProvider) this.llmPolicy = provider.getPolicy();
      this.llmApplied = applyLlm(offlineTeam, provider, {
        fallbackToOffline: config.fallbackToOffline ?? true,
        onFallback: (error, primaryName, agentId) =>
          this.emit('log', 'system', `LLM fallback (${agentId} · ${primaryName}) → offline brain: ${error.message}`, 'llm')
      });
      team = this.llmApplied.blueprints;
      this.llmLabel = `${this.llmApplied.label}${config.fallbackToOffline === false ? ' (no fallback)' : ''}`;
    }
    if (options.project) {
      const { project, tools } = repositoryTools(options.project);
      this.repository = project;
      tools.forEach(tool => this.tools.register(tool));
      this.workflow.registerSubworkflow(buildRepositoryDeliveryWorkflow());
    }

    for (const { profile, brain } of team) {
      this.agents.register(profile, { brain });
    }

    // --- tasks ---
    for (const task of createRateLimiterTasks()) {
      this.taskById.set(task.id, task);
    }

    if (options.onEvent) this.listeners.add(options.onEvent);
    if (options.dataDir) {
      this.store = new RunStore(options.dataDir);
      try {
        const stored = this.store.load();
        for (const run of stored.runs) {
          this.runs.set(run.runId, run);
          this.runOrder.push(run.runId);
          this.counter = Math.max(this.counter, Number(run.runId.slice(4)));
          const task = run.definitions ? undefined : run.project
            ? this.restoredProjectTask(run)
            : this.taskById.get(run.taskId);
          if (task) this.taskByRun.set(run.runId, task);
          run.retryAvailable = !!task;
          run.restored = true;
        }
        let upgradedEvents = false;
        for (const [runId, events] of Object.entries(stored.events)) {
          for (const event of events) {
            if (event.id) continue;
            event.id = randomUUID();
            upgradedEvents = true;
          }
          this.events.set(runId, events);
        }
        for (const run of this.getRuns()) {
          if (run.status === 'paused' && run.definitions?.workflow && run.approvals?.some(a => ['pending', 'approved'].includes(a.status))) continue;
          if (!['pending', 'running', 'paused', 'cancelling'].includes(run.status)) continue;
          const interruptedCancellation = run.status === 'cancelling';
          run.status = 'failed';
          run.error = interruptedCancellation
            ? 'The previous service stopped during cancellation. Resource cleanup could not be confirmed.'
            : 'The previous service stopped during this run. Start a new run to continue.';
          run.summary = run.error;
          run.finishedAt = Date.now();
          run.patch = undefined;
          if (run.state) {
            run.state.status = run.status;
            run.state.endTime = run.finishedAt;
            run.state.currentActiveNodes = [];
          }
          for (const progress of Object.values(run.nodeProgress ?? {})) {
            if (progress.status === 'running') Object.assign(progress, { status: run.status, error: run.error, endTime: run.finishedAt });
          }
          for (const attempt of run.attempts ?? []) {
            if (attempt.status === 'running') Object.assign(attempt, { status: run.status, error: run.error, endTime: run.finishedAt });
          }
          this.emit('run.finished', run.runId, run.summary, 'run', { status: run.status });
        }
        if (upgradedEvents) this.persist();
      } catch (error) {
        this.store.close();
        throw error;
      }
    }
    try {
      this.studio = new StudioService(this.tools, this.agents.getAll().map(a => a.profile), provider, config, options.dataDir, this.repository);
    } catch (error) {
      this.store?.close();
      throw error;
    }
  }

  // ------------------------------------------------------------------ events

  public subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(
    kind: OrchestratorEvent['kind'],
    runId: string,
    message: string,
    tag?: string,
    data?: Record<string, any>
  ): void {
    const previous = this.events.get(runId);
    const event: OrchestratorEvent = { schemaVersion: 1, seq: (previous?.at(-1)?.seq ?? previous?.length ?? 0) + 1, id: randomUUID(), at: Date.now(), runId, kind, message, tag, data };
    const history = this.runs.get(runId)?.definitions ? [...(previous ?? []), event] : [...(previous ?? []), event].slice(-100);
    this.events.set(runId, history);
    try {
      if (kind !== 'scheduler') this.persist();
    } catch (error) {
      if (previous) this.events.set(runId, previous);
      else this.events.delete(runId);
      throw error;
    }
    for (const l of this.listeners) {
      try {
        l(event);
      } catch {
        /* a broken listener must never break a run */
      }
    }
  }

  private persist(): void {
    this.store?.save({ version: 1, runs: this.getRuns(), events: Object.fromEntries(this.events) });
  }

  public getEvents(runId: string): OrchestratorEvent[] {
    return [...(this.events.get(runId) ?? [])];
  }

  public hasPersistentStorage(): boolean {
    return !!this.store;
  }

  public async close(): Promise<void> {
    this.closing = true;
    if (this.runningCount > 0) await new Promise<void>(resolve => this.idleWaiters.push(resolve));
    this.store?.close();
    this.studio.close();
  }

  // ------------------------------------------------------------------- setup

  private seedKnowledge(): void {
    this.knowledge.addDocument(
      'sec-guidelines',
      'Enterprise Secure Coding Standard v3.2',
      `All submitted code must follow zero-trust rules.
Rule SEC-01: Dynamic eval(), Function() constructors and unvalidated string concatenation into queries or commands are forbidden.
Rule SEC-02: Cryptographic keys, secrets and auth tokens must never be hardcoded in repository sources; use environment variables.
Rule SEC-03: Concurrency and asynchronous operations require timeout guards and proper error propagation.
Rule SEC-04: 所有数值入参必须校验有限性（Number.isFinite），禁止 NaN 或 Infinity 污染状态。`,
      { version: '3.2' }
    );

    this.knowledge.addDocument(
      'rate-limiter-spec',
      'Token Bucket Distributed Rate Limiter API Specification',
      `RateLimiter must implement a token bucket:
- constructor(capacity, refillRatePerSec)
- consume(tokens = 1): boolean
- getAvailableTokens(): number
- reset(): void

Edge cases:
1. 容量为负数或零时必须抛出 RangeError。
2. 令牌数量在任何时刻都不得超过容量，也不得为负。
3. 令牌桶在分布式部署下必须与集群计数器对账，才能保证全局速率。（分布式对账）`,
      { version: '1.0' }
    );

    this.knowledge.addDocument(
      'workflow-notes',
      'Self-Loop Convergence Notes',
      'The convergence threshold is 0.90. An unsatisfiable acceptance rule must escalate to a human instead of silently shipping a partial artifact.',
      { version: '1.0' }
    );
  }

  // -------------------------------------------------------------------- runs

  public getTasks(): RateLimiterTask[] {
    return Array.from(this.taskById.values());
  }

  public getRun(runId: string): RunSnapshot | undefined {
    return this.runs.get(runId);
  }

  public getRuns(): RunSnapshot[] {
    return this.runOrder.map(id => this.runs.get(id)!).filter(Boolean);
  }

  public getAgents() {
    return this.agents.getAll();
  }

  public searchKnowledge(query: string, topK = 2) {
    return this.knowledge.query(query, topK);
  }

  public getToolReliability() {
    return this.optimizer.getToolReliability();
  }

  public getPromptOptimizations() {
    return this.optimizer.getOptimizationHistory();
  }

  /** Which brain each agent is running, plus LLM usage/cost telemetry. */
  public getLlmInfo(): {
    label: string;
    telemetry: LlmTelemetry | undefined;
    brains: Array<{ agentId: string; role: string; brain: string }>;
  } {
    return {
      label: this.llmLabel,
      telemetry: this.llmApplied?.telemetry,
      brains: this.agents.getAll().map(a => ({
        agentId: a.profile.id,
        role: a.profile.role,
        brain: a.brainName
      }))
    };
  }

  public getSettings() {
    const tasks: RunTask[] = this.getTasks();
    if (this.repository) tasks.push(this.projectTask(''));
    return {
      maxConcurrentRuns: this.maxConcurrentRuns,
      scheduler: this.scheduler.getPolicy(),
      model: this.llmApplied ? { strict: this.strictLive, ...this.llmPolicy } : null,
      workflows: tasks.map(task => {
        const workflow = this.buildWorkflow(task);
        return { taskId: task.id, version: workflow.version, timeoutMs: workflow.timeoutMs,
          loopLimits: workflow.nodes.flatMap(node => node.selfLoopConfig?.maxIterations ?? []) };
      }),
      tools: this.tools.getAll().map(({ id, description, timeoutMs, isSandboxed }) => ({
        id, description, timeoutMs, isSandboxed: !!isSandboxed
      }))
    };
  }

  public getProject() {
    const reason = !this.repository
      ? '服务端尚未配置仓库、基线提交和隔离镜像。'
      : !this.strictLive ? '仓库任务需要严格 Live 模式（--live --no-fallback）。' : undefined;
    return { project: this.repository, ready: reason === undefined, reason };
  }

  public runProjectTask(goal: string, onStart?: RunOptions['onStart'], requestedBy?: string): Promise<RunSnapshot> {
    const { project, reason } = this.getProject();
    if (!project || reason) throw new Error(reason ?? 'No configured repository.');
    const prompt = goal.trim();
    if (!prompt || prompt.length > MAX_REPOSITORY_GOAL) throw new Error('Invalid repository task description.');
    return this.runTask(this.projectTask(prompt), { onStart, requestedBy });
  }

  private projectTask(prompt: string): RunTask {
    const project = this.repository!;
    const template = this.taskById.get('rl-normal')!;
    return {
      ...template, repository: true, id: project.id, title: project.title, prompt,
      description: `Repair ${project.filePath} at ${project.revision} against the fixed acceptance suite.`
    };
  }

  private restoredProjectTask(run: RunSnapshot): RunTask | undefined {
    const project = this.repository;
    if (project && this.strictLive && run.goal &&
      run.project?.id === project.id && run.project.revision === project.revision &&
      run.project.runnerImage === project.runnerImage && run.project.filePath === project.filePath) {
      return this.projectTask(run.goal);
    }
  }

  private buildWorkflow(task: RunTask, maxIterationsOverride?: number): WorkflowDefinition {
    const effective = maxIterationsOverride
      ? { ...task, maxIterations: maxIterationsOverride }
      : task;
    return task.repository ? buildRepositoryWorkflow(effective) : buildRateLimiterWorkflow(effective);
  }

  public runStudio(body: unknown, options: Pick<RunOptions, 'onStart' | 'requestedBy'> = {}): Promise<RunSnapshot> {
    const prepared = this.studio.prepare(body);
    return this.executeTask({ id: prepared.workflow.id, title: prepared.title, difficulty: 'custom',
      prompt: typeof prepared.input.goal === 'string' ? prepared.input.goal : 'Agent/team test', studio: prepared }, options);
  }

  public runTask(task: RunTask, options: RunOptions = {}): Promise<RunSnapshot> {
    return this.executeTask(task, options);
  }

  private async executeTask(task: RunTask | StudioTask, options: RunOptions): Promise<RunSnapshot> {
    if (this.closing) throw new Error('The orchestrator is shutting down.');
    const runId = options.resume?.runId ?? `run-${(++this.counter).toString().padStart(2, '0')}`;
    const workflow = task.studio?.workflow ?? this.buildWorkflow(task as RunTask, options.maxIterationsOverride);
    const auxiliaryAgent: import('./types/index.js').AgentExecutor = async request => {
      const studio = task.studio!;
      const context = executionContext.getStore();
      const nodeId = (context?.nodePath ?? 'verification') + '/' + (request.taskId.includes('critic') ? 'critic' : 'audit') + '/' + request.agentId;
      return executionContext.run({ ...context, nodePath: nodeId, attemptId: randomUUID(), iteration: request.iteration }, () =>
        this.scheduler.run({ id: nodeId, name: nodeId, type: 'agent', agentId: request.agentId, maxRetries: 0 }, runId, runId, 5, [],
          agent => agent.execute(request), Date.now() + 120000, request.signal, studio.agents));
    };
    const verification = task.studio ? new VerificationEngine(task.studio.agents, task.studio.verificationTools ?? task.studio.tools, auxiliaryAgent) : this.verification;
    const engine = task.studio ? new WorkflowEngine({ agentRegistry: task.studio.agents, toolRegistry: task.studio.tools,
      scheduler: this.scheduler, verificationEngine: verification, selfLoopEngine: new SelfLoopEngine(task.studio.agents, verification, auxiliaryAgent),
      subworkflowRegistry: task.studio.subworkflows, approvedSubworkflowTools: task.studio.approvedSubworkflowTools }) : this.workflow;

    const nodeProgress: NonNullable<RunSnapshot['nodeProgress']> = options.resume?.nodeProgress ?? {};
    const loopRounds: NonNullable<RunSnapshot['loopRounds']> = options.resume?.loopRounds ?? [];
    const snapshot: RunSnapshot = options.resume ?? {
      runId,
      taskId: task.id,
      title: task.title,
      difficulty: task.difficulty,
      status: 'pending',
      workflow,
      startedAt: Date.now(),
      nodeProgress,
      loopRounds,
      retryOf: options.retryOf,
      project: task.repository ? this.repository : undefined,
      goal: task.repository ? task.prompt : undefined,
      retryAvailable: !task.studio,
      definitions: task.studio ? this.studio.safe(task.studio.snapshot) : undefined,
      attempts: task.studio ? [] : undefined,
      resumeRecords: task.studio ? {} : undefined,
      runInput: task.studio ? clone(task.studio.input) : undefined,
      approvals: task.studio ? [] : undefined,
      modelLabel: task.studio ? this.studio.model.label + ' (no fallback)' : this.llmLabel,
      requestedBy: options.requestedBy
    };
    this.runs.set(runId, snapshot);
    if (!task.studio) this.taskByRun.set(runId, task);
    if (!options.resume) this.runOrder.push(runId);
    snapshot.status = 'pending'; snapshot.finishedAt = undefined;
    const controller = new AbortController();
    this.runControllers.set(runId, controller);
    let cleanupFailure: string | undefined;

    let slotReserved = false;
    try {
      options.onStart?.(runId);
      controller.signal.throwIfAborted();
      if (this.runningCount < this.maxConcurrentRuns) {
        this.runningCount++;
        slotReserved = true;
      } else {
        const ready = new Promise<boolean>(resolve => this.runQueue.set(runId, resolve));
        this.emit('log', runId, 'Waiting for a run slot', 'run', { status: 'pending' });
        slotReserved = await ready;
      }
      controller.signal.throwIfAborted();
      snapshot.status = 'running';
      if (!options.resume) snapshot.startedAt = Date.now();
      this.emit('run.started', runId, `${task.title} [${task.difficulty}]`, 'run', {
        taskId: task.id,
        nodes: workflow.nodes.length,
        actor: options.requestedBy
      });

      const citations = task.studio ? [] : this.knowledge.query(task.prompt, 2);
      snapshot.citations = citations.map(c => c.citation);
      snapshot.knowledgeHits = citations.map(({ chunk, citation }) => ({
        id: chunk.id, title: chunk.title, content: chunk.content, version: chunk.metadata.version, citation
      }));
      if (citations.length > 0) {
        this.emit(
          'log', runId, `RAG: ${citations[0].chunk.title} (${(citations[0].score * 100).toFixed(0)}% relevance)`,
          'rag', { citations: snapshot.citations }
        );
      }

      const initialInput = task.studio ? { input: task.studio.input } : {
        goal: task.prompt,
        taskId: task.id,
        difficulty: task.difficulty,
        seedFeatures: task.seedFeatures,
        seedSource: task.repository ? undefined : renderRateLimiter(task.seedFeatures),
        knowledgeCitations: snapshot.citations,
        knowledgeHits: snapshot.knowledgeHits
      };
      const activeStarted = Date.now();
      const state = await executionContext.run(task.studio ? { emit: (kind, data) => this.emit(kind as OrchestratorEvent['kind'], runId, kind, 'studio', this.studio.safe(data)) } : {}, () => engine.execute(workflow, initialInput, {
        runId,
        signal: controller.signal,
        deadline: activeStarted + Math.max(1, (workflow.timeoutMs ?? 120000) - (snapshot.activeElapsedMs ?? 0)),
        resumeRecords: options.resume ? clone(snapshot.resumeRecords ?? {}) : undefined,
        onCheckpoint: task.studio ? (id, record, context) => { snapshot.resumeRecords![id] = this.studio.safe({ record, context }); } : undefined,
        requestApproval: task.studio ? (node, input) => {
          const inputHash = hash(input);
          let approval = snapshot.approvals!.find(a => a.nodeId === node.id && a.inputHash === inputHash);
          if (approval && approval.status === 'pending' && Date.now() > approval.expiresAt) approval.status = 'expired';
          if (!approval) {
            approval = { id: randomUUID(), nodeId: node.id, message: node.approval!.message, input: this.studio.safe(input), inputHash,
              createdAt: Date.now(), expiresAt: Date.now() + node.approval!.expiresInMs, status: 'pending' };
            snapshot.approvals!.push(approval); this.emit('approval.requested', runId, approval.message, 'approval', { ...approval });
          }
          return approval;
        } : undefined,
        onNodeStart: (node, record) => {
          if (task.studio) snapshot.attempts!.push(this.studio.safe(record));
          nodeProgress[node.id] = { status: 'running', startTime: record.startTime, nodeName: node.name, toolId: node.toolId };
          this.emit('node.started', runId, `${node.name} (${node.type})`, 'node', { nodeId: node.id });
        },
        onNodeEnd: (node, record) => {
          if (task.studio) {
            const attempt = snapshot.attempts!.findLast(a => a.nodeId === record.nodeId && a.status === 'running');
            const evidence = this.studio.safe(record);
            if (evidence.meta?.approvedDelivery && evidence.output?.patch?.patch !== record.output?.patch?.patch) evidence.meta.approvedDelivery = false;
            if (attempt) Object.assign(attempt, evidence);
            else snapshot.attempts!.push(evidence);
          }
          const { status, startTime, endTime, branchTaken, error } = record;
          nodeProgress[node.id] = { status, startTime, endTime, branchTaken, error, nodeName: node.name, toolId: node.toolId };
          if (task.repository && status === 'completed') {
            if (node.id === 'n_baseline_test') snapshot.baselineVerification = record.verification;
            if (node.id === 'n_baseline_scan' && Array.isArray(record.output?.issues)) snapshot.baselineScan = record.output.issues;
            if (node.id === 'n_requirement') snapshot.plan = { acceptanceCriteria: record.output?.acceptanceCriteria };
            if (node.id === 'n_architecture') snapshot.plan = { ...snapshot.plan, invariants: record.output?.invariants };
          }
          const meta = record.meta;
          if (meta?.cleanupFailed) cleanupFailure = error;
          const detail =
            meta?.iterations !== undefined
              ? ` · iterations=${meta.iterations} score=${(Number(meta.score ?? 0) * 100).toFixed(1)}%`
              : '';
          this.emit(
            'node.finished',
            runId,
            `${node.name} → ${record.status}${detail}` + (record.error ? ` (${record.error})` : ''),
            'node',
            {
              nodeId: node.id,
              status: record.status,
              iterations: meta?.iterations,
              score: meta?.score
            }
          );
        },
        onLoopIteration: (node, { output, ...round }) => {
          loopRounds.push({ nodeId: node.id, ...round });
          snapshot.iterations = round.iteration;
          if (task.studio) this.emit('loop.iteration', runId, `${node.id} / ${round.iteration}`, 'loop', this.studio.safe({ nodeId: node.id, output, ...round, candidateHash: hash(output) }));
        },
        onLog: (message, data) => {
          this.emit('log', runId, task.studio ? this.studio.redact(message) : message, 'engine', task.studio && data ? this.studio.safe(data) : data);
        }
      }));
      snapshot.activeElapsedMs = (snapshot.activeElapsedMs ?? 0) + Date.now() - activeStarted;

      snapshot.state = task.studio ? this.studio.safe(state) : state;
      controller.signal.throwIfAborted();
      snapshot.status = state.status;
      snapshot.finishedAt = state.status === 'paused' ? undefined : Date.now();
      if (state.status === 'failed') {
        snapshot.error = Object.values(nodeProgress).find(node => node.error)?.error;
      }

      const ctx = state.context;
      snapshot.verification = task.repository && !snapshot.loopRounds?.length
        ? undefined
        : (ctx.lastVerification as VerificationResult) ?? undefined;
      if (task.studio) snapshot.result = this.studio.safe(ctx.lastOutput);
      else snapshot.artifact = asCode(ctx.finalCode ?? ctx.lastOutput);
      snapshot.iterations = Object.values(state.iterationCounts).reduce((a, b) => Math.max(a, b), 0) || undefined;

      const patch = (task.repository ? ctx.delivery?.patch : ctx.patch) as RunSnapshot['patch'] | undefined;
      if (!task.studio && state.status === 'completed' && patch?.patch) snapshot.patch = patch;
      const delivery = snapshot.attempts?.findLast(record => record.status === 'completed' && record.meta?.approvedDelivery)?.output;
      if (state.status === 'completed' && delivery?.lastVerification?.passed && delivery.patch?.patch) {
        snapshot.project = this.repository;
        snapshot.verification = delivery.lastVerification;
        snapshot.artifact = asCode(delivery.finalCode);
        snapshot.patch = delivery.patch;
      }

      if (state.status === 'needs_human' && state.humanEscalation) {
        snapshot.escalation = state.humanEscalation;
        this.escalationsRaised++;
        this.emit(
          'escalation',
          runId,
          state.humanEscalation.reason,
          'human',
          { escalationId: state.humanEscalation.id }
        );
      }

      snapshot.summary = task.studio ? `${task.studio.snapshot.kind} 执行 ${state.status}；${snapshot.verification ? '验收结论见固定验证配置与执行证据。' : '此运行未进行正式交付验收。'}` : this.buildSummary(snapshot);
      this.emit('run.finished', runId, `${task.title} → ${state.status}`, 'run', {
        status: state.status,
        iterations: snapshot.iterations
      });
    } catch (err: any) {
      const cancellationRequested = controller.signal.aborted;
      const cancelled = cancellationRequested && !cleanupFailure;
      snapshot.status = cancelled ? 'cancelled' : 'failed';
      snapshot.error = cancelled ? undefined : cleanupFailure ?? (task.studio ? this.studio.redact(err?.message ?? String(err)) : err?.message ?? String(err));
      snapshot.finishedAt = Date.now();
      snapshot.summary = cancelled ? 'Run cancelled by an operator.' : `Run failed: ${snapshot.error}`;
      if (cancellationRequested) {
        if (snapshot.state) snapshot.state.status = snapshot.status;
        snapshot.artifact = undefined;
        for (const progress of Object.values(nodeProgress)) {
          if (progress.status === 'running') Object.assign(progress, { status: snapshot.status, endTime: snapshot.finishedAt });
        }
      }
      snapshot.patch = undefined;
      this.emit('run.finished', runId, snapshot.summary, 'run', { status: snapshot.status });
    } finally {
      this.runControllers.delete(runId);
      this.runQueue.delete(runId);
      if (slotReserved) {
        const next = this.runQueue.entries().next().value;
        if (next) {
          this.runQueue.delete(next[0]);
          next[1](true);
        } else this.runningCount--;
        if (this.runningCount === 0) this.idleWaiters.splice(0).forEach(resolve => resolve());
      }
    }

    return snapshot;
  }

  public cancelRun(runId: string, actor: string, reason?: string): RunSnapshot | undefined {
    const run = this.runs.get(runId);
    if (run?.status === 'paused' && run.definitions?.workflow) {
      const previous = { status: run.status, finishedAt: run.finishedAt, cancellation: run.cancellation, approvals: clone(run.approvals) };
      run.status = 'cancelled'; run.finishedAt = Date.now(); run.cancellation = { actor, reason: reason ?? '取消审批等待', requestedAt: Date.now() };
      for (const approval of run.approvals ?? []) if (approval.status === 'pending') { approval.status = 'rejected'; approval.actor = actor; approval.reason = reason; }
      try { this.emit('run.finished', runId, '取消审批等待', 'run', { status: 'cancelled' }); }
      catch (error) { Object.assign(run, previous); throw error; }
      return run;
    }
    const controller = this.runControllers.get(runId);
    if (!run || !controller || (run.status !== 'pending' && run.status !== 'running')) return undefined;

    const prior = run.status;
    run.status = 'cancelling';
    run.cancellation = { actor, reason: reason || 'Operator requested cancellation.', requestedAt: Date.now() };
    try {
      this.emit('log', runId, 'Operator requested cancellation', 'human', { ...run.cancellation, action: 'cancel' });
    } catch (error) {
      run.status = prior;
      run.cancellation = undefined;
      throw error;
    }
    const queued = this.runQueue.get(runId);
    this.runQueue.delete(runId);
    controller.abort(new Error('Run cancelled by an operator.'));
    queued?.(false);
    return run;
  }

  public decideApproval(runId: string, approvalId: string, body: unknown, actor: string): RunSnapshot {
    object(body, 'decision', ['decision', 'reason', 'key']); text(body.key, 'key', 100); text(body.reason ?? '', 'reason', 2000, true);
    if (!['approve', 'reject'].includes(body.decision)) throw new StudioError(422, 'DECISION', '请选择 approve 或 reject。');
    const run = this.getRun(runId), approval = run?.approvals?.find(a => a.id === approvalId);
    if (!run || !approval || !run.definitions?.workflow) throw new StudioError(404, 'NOT_FOUND', '审批不存在。');
    const status = body.decision === 'approve' ? 'approved' : 'rejected';
    if (approval.decisionKey === body.key && approval.status === status && approval.actor === actor && approval.reason === (body.reason ?? '')) {
      if (status === 'approved' && run.status === 'paused' && run.approvals?.at(-1) === approval) this.resumeStudio(run, actor);
      return run;
    }
    if (run.status !== 'paused' || approval.status !== 'pending') throw new StudioError(409, 'APPROVAL_CONFLICT', '审批已被处理或运行已结束。');
    if (Date.now() > approval.expiresAt) {
      const previous = { status: run.status, error: run.error, finishedAt: run.finishedAt };
      approval.status = 'expired'; run.status = 'failed'; run.error = '审批已过期'; run.finishedAt = Date.now();
      try { this.emit('approval.resolved', runId, run.error, 'approval', { approvalId, status: 'expired' }); }
      catch (error) { approval.status = 'pending'; Object.assign(run, previous); throw error; }
      throw new StudioError(409, 'APPROVAL_EXPIRED', run.error);
    }
    // Resolve frozen dependencies before committing a decision; configuration failure leaves it pending.
    const prepared = status === 'approved' ? this.studio.prepareWorkflow({ kind: 'workflow', workflowRef: { id: run.definitions.workflow.id, revision: run.definitions.workflow.revision },
      input: run.runInput }, run.definitions) : undefined;
    const previous = clone(approval);
    const previousRun = { status: run.status, error: run.error, finishedAt: run.finishedAt };
    Object.assign(approval, { status, actor, reason: body.reason ?? '', decidedAt: Date.now(), decisionKey: body.key });
    if (status === 'rejected') { run.status = 'failed'; run.error = '操作者拒绝审批'; run.finishedAt = Date.now(); }
    try { this.emit('approval.resolved', runId, `审批 ${status}`, 'approval', { ...approval }); }
    catch (error) {
      run.approvals![run.approvals!.indexOf(approval)] = previous;
      Object.assign(run, previousRun);
      throw error;
    }
    if (status === 'approved') this.resumeStudio(run, actor, prepared);
    return run;
  }
  private resumeStudio(run: RunSnapshot, actor: string, prepared?: PreparedStudioRun) {
    const workflow = run.definitions!.workflow!;
    const studio = prepared ?? this.studio.prepareWorkflow({ kind: 'workflow', workflowRef: { id: workflow.id, revision: workflow.revision }, input: run.runInput }, run.definitions);
    void this.executeTask({ id: studio.workflow.id, title: studio.title, difficulty: 'custom', prompt: '', studio }, { resume: run, requestedBy: actor }).catch(() => {});
  }

  /** Run several tasks concurrently — this is what makes the scheduler visible. */
  public async runAll(
    tasks: RateLimiterTask[],
    options: { concurrency?: number; requestedBy?: string } = {}
  ): Promise<RunSnapshot[]> {
    const limit = Math.max(1, Math.min(options.concurrency ?? this.maxConcurrentRuns, tasks.length));
    const results: RunSnapshot[] = new Array(tasks.length);
    let cursor = 0;

    const worker = async () => {
      for (;;) {
        const index = cursor++;
        if (index >= tasks.length) return;
        results[index] = await this.runTask(tasks[index], { requestedBy: options.requestedBy });
      }
    };

    await Promise.all(Array.from({ length: limit }, () => worker()));
    return results;
  }

  // -------------------------------------------------------------- escalation

  /**
   * Resolve a human-escalation card.
   *  0 → retry with a doubled iteration budget
   *  1 → accept the current draft (a human takes over the review)
   *  2 → abort
   */
  public async resolveEscalation(
    runId: string, optionIndex: number, actor = 'local operator', reason?: string
  ): Promise<RunSnapshot | undefined> {
    const run = this.runs.get(runId);
    if (!run) return undefined;
    if (!run.escalation || !Number.isInteger(optionIndex) || !run.escalation.options[optionIndex]) return run;

    const decision = { actor, reason: reason || run.escalation.reason, optionIndex };
    const task = this.taskByRun.get(runId);
    if (optionIndex === 0 && !task) throw new Error('The saved task configuration is unavailable for retry.');
    const previous = {
      status: run.status, escalation: run.escalation, humanDecision: run.humanDecision,
      summary: run.summary, artifact: run.artifact, patch: run.patch,
      state: run.state && { ...run.state }
    };
    run.escalation = undefined;

    try {
      if (optionIndex === 0) {
        run.status = 'completed';
        run.humanDecision = 'retry';
        run.summary = 'Escalation resolved by a human: re-running with a doubled budget.';
        const budget = Math.max(...run.workflow.nodes.map(node => node.selfLoopConfig?.maxIterations ?? 0));
        return await this.runTask(task!, {
          maxIterationsOverride: budget * 2,
          retryOf: runId,
          requestedBy: actor,
          onStart: retryRunId => this.emit('log', runId, 'human decision: retry with a doubled iteration budget', 'human', { ...decision, retryRunId })
        });
      }

      if (optionIndex === 1) {
        const artifact = run.artifact ?? asCode(run.state?.context.finalCode ?? '');

        const patchTool = this.tools.get('git_patch_manager');
        if (patchTool && artifact) {
          try {
            const patchRes: any = await this.tools.invoke('git_patch_manager', {
              originalContent: String(run.state?.context.seedSource ?? '// placeholder\n'),
              updatedContent: artifact,
              filePath: 'src/rate-limiter.js'
            });
            if (run.project && patchRes.patch) await this.tools.invoke('git_check_patch', { patch: patchRes.patch });
            run.patch = patchRes;
          } catch {
            /* the acceptance itself still stands */
          }
        }

        run.status = 'completed';
        run.humanDecision = 'review';
        run.summary = this.buildSummary(run, 'Human review requested for the draft; the automated verification verdict is unchanged.');
        this.emit('log', runId, 'human decision: send current draft for review', 'human', decision);
        return run;
      }

      run.status = 'failed';
      run.humanDecision = 'abort';
      const rolledBack = run.state && this.workflow.rollback(run.state.workflowExecutionId, run.state);
      run.artifact = undefined;
      run.patch = undefined;
      run.summary = rolledBack ? 'Aborted by a human and rolled back to the last checkpoint.' : 'Aborted by a human.';
      this.emit('log', runId, run.summary, 'human', decision);
      return run;
    } catch (error) {
      Object.assign(run, previous);
      throw error;
    }
  }

  // ----------------------------------------------------------------- summary

  private buildSummary(run: RunSnapshot, override?: string): string {
    if (override) return override;

    const v = run.verification;
    const lines: string[] = [];
    lines.push(`${run.title}`);
    lines.push(`status: ${run.status}${run.iterations ? ` · self-loop iterations: ${run.iterations}` : ''}`);
    if (v) {
      lines.push(
        `verification: score ${(v.score * 100).toFixed(1)}% · ` +
          `${v.passed ? 'PASSED' : 'BLOCKED'} · ` +
          `tiers ${(v.tiers ?? []).map(t => `${t.tier}:${t.passed ? 'ok' : 'fail'}`).join(' ')}`
      );
      if (!v.passed && v.blockingReasons?.length) {
        lines.push(`blocking: ${v.blockingReasons.slice(0, 3).join(' | ')}`);
      }
    }
    if (run.patch?.patch) {
      lines.push(`patch: ${run.patch.filePath} (+${run.patch.stats?.added ?? '?'} / -${run.patch.stats?.removed ?? '?'})`);
    }
    lines.push(
      run.status === 'needs_human'
        ? 'human attention required: 1 structured card raised'
        : 'human attention cost: 0'
    );
    return lines.join('\n');
  }

  // ------------------------------------------------------------------ status

  public getSnapshot() {
    return {
      agents: this.agents.getAll().map(a => ({
        id: a.profile.id,
        name: a.profile.name,
        role: a.profile.role,
        load: a.currentLoad,
        max: a.profile.maxConcurrency,
        tokens: a.profile.totalTokensUsed,
        brain: a.brainName
      })),
      scheduler: this.scheduler.getStats(),
      pending: this.scheduler.getPendingTasks(),
      tools: this.getToolReliability(),
      promptOptimizations: this.getPromptOptimizations().length,
      escalationsRaised: this.escalationsRaised,
      llm: this.getLlmInfo(),
      runs: this.getRuns(),
      knowledgeChunks: this.knowledge.getChunkCount()
    };
  }
}

export function isTaskSpec(value: unknown): value is TaskSpec {
  return !!value && typeof value === 'object' && 'id' in (value as any) && 'buildWorkflow' in (value as any);
}
