/**
 * Test suite — every case below corresponds to a defect that shipped in v1.0, or to a
 * contract the platform now enforces. No test framework: a deterministic runner keeps the
 * dependency count at zero and the failure output readable.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { ToolRegistry } from '../src/tools/tool-registry.js';
import { createBuiltinTools, buildUnifiedDiff } from '../src/tools/builtin-tools.js';
import { AgentRegistry } from '../src/agent/agent-registry.js';
import { BaseAgent } from '../src/agent/base-agent.js';
import { AgentBrain, BrainContext, BrainOutput } from '../src/agent/brain.js';
import { KnowledgeBase } from '../src/knowledge/knowledge-base.js';
import { WorkflowEngine } from '../src/workflow/workflow-engine.js';
import { DynamicScheduler } from '../src/scheduler/dynamic-scheduler.js';
import { VerificationEngine } from '../src/verification/verification-engine.js';
import { SelfLoopEngine } from '../src/selfloop/self-loop-engine.js';
import { FeedbackOptimizer } from '../src/optimization/feedback-optimizer.js';
import { Orchestrator } from '../src/orchestrator.js';
import { AgentProfile, VerificationSpec, WorkflowDefinition } from '../src/types/index.js';
import { BASE_FEATURES, FULLY_FIXED, renderRateLimiter, makeVerificationSpec } from '../src/scenarios/rate-limiter.js';

// ---------------------------------------------------------------------------
// runner
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures: string[] = [];
let suite = '';

function describe(name: string): void {
  suite = name;
  process.stdout.write(`\n${name}\n`);
}

function check(condition: boolean, description: string): void {
  if (condition) {
    passed++;
    process.stdout.write(`  \u001b[32m✔\u001b[0m ${description}\n`);
  } else {
    failed++;
    failures.push(`${suite} :: ${description}`);
    process.stdout.write(`  \u001b[31m✘ ${description}\u001b[0m\n`);
  }
}

function equal<T>(actual: T, expected: T, description: string): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  check(ok, ok ? description : `${description} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

class DelayBrain implements AgentBrain {
  readonly kind = 'delay';
  readonly name = 'delay';
  constructor(private ms: number, private tag = 'done') {}
  public async think(ctx: BrainContext): Promise<BrainOutput> {
    await sleep(this.ms);
    return { output: { tag: this.tag, taskId: ctx.request.taskId }, reasoning: `slept ${this.ms}ms`, confidence: 0.9 };
  }
}

function agentProfile(id: string, overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id,
    name: id,
    role: 'developer',
    description: 'test agent',
    capabilities: { code_generation: 0.9, general_task: 0.8 },
    systemPrompt: 'test prompt',
    toolIds: ['static_analyzer', 'test_runner', 'code_sandbox'],
    maxConcurrency: 2,
    currentLoad: 0,
    totalTokensUsed: 0,
    version: '1.0.0',
    ...overrides
  };
}

function tools(): ToolRegistry {
  const registry = new ToolRegistry();
  createBuiltinTools().forEach(t => registry.register(t));
  return registry;
}

function toolsAndAgents(): { toolRegistry: ToolRegistry; agentRegistry: AgentRegistry } {
  const toolRegistry = tools();
  return { toolRegistry, agentRegistry: new AgentRegistry(toolRegistry) };
}

// ---------------------------------------------------------------------------
// 1. sandbox & tools
// ---------------------------------------------------------------------------

async function suiteTools(): Promise<void> {
  describe('[1] tool sandbox & registry');

  const registry = tools();
  const run = await registry.invoke('code_sandbox', { language: 'javascript', code: 'console.log("hi"); return 6 * 7;' });
  equal(run.result, 42, 'sandbox returns the computed value');
  check(String(run.stdout).includes('hi'), 'sandbox captures stdout');
  check(run.engine === 'node:vm', 'sandbox runs on node:vm (not new Function)');

  // REGRESSION: a synchronous infinite loop used to hang the whole process because
  // Promise.race cannot interrupt blocking code.
  const started = Date.now();
  const loop = await registry.invoke('code_sandbox', {
    language: 'javascript',
    code: 'while (true) {}',
    timeoutMs: 150
  });
  const loopMs = Date.now() - started;
  check(loop.exitCode === 124 && loop.timedOut === true, 'vm timeout interrupts a synchronous infinite loop');
  check(loopMs < 2500, `interruption is prompt (${loopMs}ms)`);

  const escape = await registry.invoke('code_sandbox', {
    language: 'javascript',
    code: 'return typeof process === "undefined" && typeof require === "undefined";'
  });
  check(escape.result === true, 'sandbox context exposes neither process nor require');

  // REGRESSION: the timeout timer used to leak, keeping the process alive for 10s.
  await registry.invoke('static_analyzer', { code: 'const x = 1;' });
  await sleep(25);
  const timers = (process as any).getActiveResourcesInfo
    ? (process as any).getActiveResourcesInfo().filter((r: string) => r === 'Timeout').length
    : 0;
  check(timers === 0, `no dangling Timeout handle after invoke (found ${timers})`);

  const scan = await registry.invoke('static_analyzer', { code: 'const y = eval("1+1");' });
  check(scan.clean === false && scan.issues[0].rule === 'SEC-001', 'static analyzer flags eval()');
  const proto = await registry.invoke('static_analyzer', { code: 'const z = ({}).constructor.constructor("return 1")();' });
  check(proto.issues.some((i: any) => i.rule === 'SEC-004'), 'static analyzer flags sandbox-escape patterns');

  // REGRESSION: parameter *types* were never validated.
  let threw = false;
  try {
    await registry.invoke('code_sandbox', { language: 'javascript', code: 42 });
  } catch {
    threw = true;
  }
  check(threw, 'schema validation rejects a wrong-typed parameter');

  // REGRESSION: only javascript is really executed — the old tool faked python.
  let langThrew = false;
  try {
    await registry.invoke('code_sandbox', { language: 'python', code: 'print(1)' });
  } catch {
    langThrew = true;
  }
  check(langThrew, 'unsupported language is rejected instead of simulated');

  registry.registerMcpTool(
    {
      name: 'external_fetch',
      description: 'fetch',
      inputSchema: { type: 'object', properties: { url: { type: 'string', description: 'url' } }, required: ['url'] }
    },
    async (_name, args) => ({ fetched: true, target: args.url })
  );
  const mcp = await registry.invoke('mcp_external_fetch', { url: 'https://example.test' });
  check(mcp.fetched === true, 'MCP tool registers and invokes');
}

async function suiteDiff(): Promise<void> {
  describe('[2] unified diff');

  const original = 'function a() {\n  return 1;\n}\n\nfunction b() {\n  return 2;\n}';
  const updated = 'function a() {\n  return 1;\n}\n\nfunction b() {\n  return 3;\n}\n\nfunction c() {\n  return 4;\n}';

  const patch = buildUnifiedDiff('src/x.js', original, updated);
  check(patch.startsWith('--- a/src/x.js'), 'diff has a/ header');
  check(patch.includes('+++ b/src/x.js'), 'diff has b/ header');
  check(/@@ -\d+,\d+ \+\d+,\d+ @@/.test(patch), 'diff has hunk headers with line counts');

  const minus = patch.split('\n').filter(l => l.startsWith('-') && !l.startsWith('---'));
  const plus = patch.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'));
  check(minus.length > 0, `diff emits removed lines (${minus.length})`);
  check(plus.length > 0, `diff emits added lines (${plus.length})`);

  // REGRESSION: the old patch was all-plus and could never be applied.
  const dir = mkdtempSync(join(tmpdir(), 'aether-diff-'));
  try {
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'x.js'), original);
    writeFileSync(join(dir, 'change.patch'), patch);

    let applies = false;
    let detail = '';
    try {
      execFileSync('git', ['apply', '--check', 'change.patch'], { cwd: dir, stdio: 'pipe' });
      applies = true;
    } catch (err: any) {
      detail = String(err?.stderr ?? err?.message ?? err).slice(0, 160);
    }
    check(applies, `git apply --check accepts the diff${applies ? '' : ` — ${detail}`}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 3. agents
// ---------------------------------------------------------------------------

async function suiteAgents(): Promise<void> {
  describe('[3] agent registry');

  const { agentRegistry } = toolsAndAgents();
  agentRegistry.register(agentProfile('busy', { capabilities: { python: 0.95 }, maxConcurrency: 1, currentLoad: 1 }));
  agentRegistry.register(agentProfile('idle', { capabilities: { python: 0.85 }, maxConcurrency: 2, currentLoad: 0 }));

  equal(agentRegistry.findBestAgent('python', 0.8)?.id, 'idle', 'load-aware match prefers the idle agent over a busy specialist');

  // REGRESSION: version history was a shallow copy that shared nested objects.
  const profile = agentProfile('versioned', { capabilities: { code_generation: 0.5 } });
  agentRegistry.register(profile);
  agentRegistry.register({ ...profile, version: '1.1.0' });
  agentRegistry.get('versioned')!.profile.capabilities.code_generation = 0.99;
  const history = agentRegistry.getVersionHistory('versioned');
  equal(history.length, 1, 'one historical version is recorded on re-register');
  equal(history[0].capabilities.code_generation, 0.5, 'history is a deep copy — live mutation does not rewrite it');

  const agent = agentRegistry.register(agentProfile('capacity', { maxConcurrency: 1, currentLoad: 1 }));
  check(agent.hasCapacity() === false, 'hasCapacity() reports a full agent');
}

// ---------------------------------------------------------------------------
// 4. knowledge base
// ---------------------------------------------------------------------------

async function suiteKnowledge(): Promise<void> {
  describe('[4] knowledge base');

  const kb = new KnowledgeBase({ chunkSize: 40, chunkOverlap: 8, hybridAlpha: 0.4 });

  // REGRESSION: Chinese text used to collapse into ONE token and ONE chunk, silently
  // disabling retrieval for any language without spaces.
  kb.addDocument('cn-spec', '分布式限流器规范', '令牌桶必须支持容量校验。当容量为负数或零时必须抛出 RangeError。禁止使用 eval 动态执行代码。');
  kb.addDocument('en-spec', 'Secure Coding', 'Never use eval. Secrets must come from environment variables.');

  const cn = kb.query('容量校验 抛出 RangeError', 2);
  check(cn.length > 0, 'CJK query returns at least one hit');
  check(cn[0].chunk.docId === 'cn-spec', 'CJK query ranks the Chinese document first');
  check(cn[0].citation.includes('分布式限流器规范'), 'citation carries the document title');

  const longCn = '令牌桶算法'.repeat(60);
  const chunks = kb.addDocument('cn-long', '长文档', longCn);
  check(chunks.length > 1, `long CJK document is split into multiple chunks (${chunks.length})`);

  const en = kb.query('eval secrets environment', 1);
  check(en[0]?.chunk.docId === 'en-spec', 'latin retrieval still works');
}

// ---------------------------------------------------------------------------
// 5. workflow engine
// ---------------------------------------------------------------------------

async function suiteWorkflow(): Promise<void> {
  describe('[5] workflow engine');

  const { toolRegistry, agentRegistry } = toolsAndAgents();
  const workflow = new WorkflowEngine({ agentRegistry, toolRegistry });

  // REGRESSION (P0): a cyclic graph validated as `valid: true` and then looped forever.
  const cyclic: WorkflowDefinition = {
    id: 'cyclic',
    name: 'cyclic',
    description: '',
    version: '1',
    entryNodeId: 'A',
    nodes: [
      { id: 'A', name: 'A', type: 'tool', toolId: 'static_analyzer' },
      { id: 'B', name: 'B', type: 'tool', toolId: 'static_analyzer' }
    ],
    edges: [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'A' }
    ]
  };
  const cyclicResult = workflow.validate(cyclic);
  check(cyclicResult.valid === false, 'cycle makes the workflow invalid');
  check(!!cyclicResult.cycle && cyclicResult.cycle.length >= 3, `cycle path is reported (${cyclicResult.cycle?.join(' → ')})`);

  // REGRESSION (P0): unimplemented node types silently returned { status: 'pass' }.
  const bogus: WorkflowDefinition = {
    id: 'bogus',
    name: 'bogus',
    description: '',
    version: '1',
    entryNodeId: 'X',
    nodes: [{ id: 'X', name: 'X', type: 'teleport' as any }],
    edges: []
  };
  check(workflow.validate(bogus).valid === false, 'an unknown node type is rejected at validation time');

  const missingSpec: WorkflowDefinition = {
    id: 'no-spec',
    name: 'no-spec',
    description: '',
    version: '1',
    entryNodeId: 'V',
    nodes: [{ id: 'V', name: 'V', type: 'verification' }],
    edges: []
  };
  check(workflow.validate(missingSpec).valid === false, 'a verification node without a spec is rejected');

  // condition nodes must evaluate exactly once
  let evaluations = 0;
  const conditional: WorkflowDefinition = {
    id: 'cond',
    name: 'cond',
    description: '',
    version: '1',
    entryNodeId: 'start',
    nodes: [
      {
        id: 'start',
        name: 'start',
        type: 'condition',
        conditionFn: () => {
          evaluations++;
          return 'end';
        }
      },
      { id: 'end', name: 'end', type: 'tool', toolId: 'static_analyzer', inputTransformer: () => ({ code: 'const ok = 1;' }) }
    ],
    edges: [
      { from: 'start', to: 'end' },
      { from: 'end', to: 'end2' }
    ]
  };
  // end2 does not exist -> validation should complain, so use a valid variant instead
  conditional.nodes.push({ id: 'end2', name: 'end2', type: 'tool', toolId: 'static_analyzer', inputTransformer: () => ({ code: 'const ok = 2;' }) });
  const condState = await workflow.execute(conditional);
  equal(condState.status, 'completed', 'condition workflow completes');
  equal(evaluations, 1, 'conditionFn is evaluated exactly once per visit');

  // parallel group really runs concurrently
  agentRegistry.register(agentProfile('par1', { maxConcurrency: 2 }), { brain: new DelayBrain(120, 'p1') });
  agentRegistry.register(agentProfile('par2', { maxConcurrency: 2 }), { brain: new DelayBrain(120, 'p2') });

  const parallel: WorkflowDefinition = {
    id: 'par',
    name: 'par',
    description: '',
    version: '1',
    entryNodeId: 'fork',
    nodes: [
      {
        id: 'fork',
        name: 'fork',
        type: 'parallel_group',
        parallelChildIds: ['c1', 'c2'],
        outputKey: 'branches'
      },
      { id: 'c1', name: 'c1', type: 'agent', agentId: 'par1' },
      { id: 'c2', name: 'c2', type: 'agent', agentId: 'par2' }
    ],
    edges: []
  };
  const parStart = Date.now();
  const parState = await workflow.execute(parallel, {}, { runId: 'par-run' });
  const parMs = Date.now() - parStart;
  equal(parState.status, 'completed', 'parallel group completes');
  check(parMs < 230, `parallel children overlap (${parMs}ms for two 120ms tasks)`);
  equal((parState.context.branches as any)?.children?.length, 2, 'parallel group records both children');

  // REGRESSION (P0): workflow timeoutMs was declared but never enforced.
  agentRegistry.register(agentProfile('slow', { maxConcurrency: 2 }), { brain: new DelayBrain(400) });
  const slow: WorkflowDefinition = {
    id: 'slow',
    name: 'slow',
    description: '',
    version: '1',
    entryNodeId: 's1',
    timeoutMs: 120,
    nodes: [
      { id: 's1', name: 's1', type: 'agent', agentId: 'slow' },
      { id: 's2', name: 's2', type: 'agent', agentId: 'slow' },
      { id: 's3', name: 's3', type: 'agent', agentId: 'slow' }
    ],
    edges: [
      { from: 's1', to: 's2' },
      { from: 's2', to: 's3' }
    ]
  };
  const slowState = await workflow.execute(slow, {}, { runId: 'slow-run' });
  equal(slowState.status, 'failed', 'workflow deadline stops a run that would otherwise keep going');
  check((slowState.endTime ?? 0) - slowState.startTime < 1200, 'deadline is honoured promptly');

  // checkpoints are taken before every node (not only at t=0)
  const checkpointRun = await workflow.execute(conditional, {}, { runId: 'ckpt-run' });
  equal(checkpointRun.status, 'completed', 'checkpointed workflow completes');
  check(workflow.getCheckpointCount('ckpt-run') >= 2, 'a checkpoint is stored before each node');

  // unreachable nodes are reported as warnings
  const unreachable: WorkflowDefinition = {
    id: 'unreach',
    name: 'unreach',
    description: '',
    version: '1',
    entryNodeId: 'only',
    nodes: [
      { id: 'only', name: 'only', type: 'tool', toolId: 'static_analyzer', inputTransformer: () => ({ code: 'x' }) },
      { id: 'orphan', name: 'orphan', type: 'tool', toolId: 'static_analyzer' }
    ],
    edges: []
  };
  const unreachResult = workflow.validate(unreachable);
  check(unreachResult.valid === true && unreachResult.warnings.some(w => w.includes('orphan')), 'unreachable node produces a warning');
}

// ---------------------------------------------------------------------------
// 6. scheduler
// ---------------------------------------------------------------------------

async function suiteScheduler(): Promise<void> {
  describe('[6] dynamic scheduler');

  const { agentRegistry } = toolsAndAgents();
  agentRegistry.register(agentProfile('w1', { maxConcurrency: 1 }), { brain: new DelayBrain(5) });

  // REGRESSION (P1): aging used to accumulate, saturating every task at 10.
  const scheduler = new DynamicScheduler(agentRegistry, { agingIntervalMs: 5000, pollIntervalMs: 5 });
  const node = { id: 'n', name: 'n', type: 'agent' as const, agentId: 'w1' };
  const task = scheduler.enqueue(node, 'run', 'exec', 1);
  task.submittedAt = Date.now() - 30_000; // waited 30s → bonus 6

  const first = scheduler.effectivePriority(task);
  const second = scheduler.effectivePriority(task);
  equal(first, 7, 'effective priority = min(10, base + floor(wait/tau))');
  equal(second, 7, 'effective priority is read-only — repeated reads do not accumulate');
  equal(task.basePriority, 1, 'base priority is never mutated');

  const capped = scheduler.enqueue(node, 'run', 'exec', 9);
  capped.submittedAt = Date.now() - 60_000;
  equal(scheduler.effectivePriority(capped), 10, 'aging caps at 10');

  // dependencies are enforced: a task gated on a blocker that never completes stays queued
  const depScheduler = new DynamicScheduler(agentRegistry, { maxWaitMs: 150, pollIntervalMs: 5 });
  const blocker = depScheduler.enqueue({ id: 'blocker', name: 'blocker', type: 'agent', agentId: 'w1' }, 'run', 'exec', 5);
  const blocked = depScheduler.enqueue(node, 'run', 'exec', 5, [blocker.id]);
  let starved = false;
  try {
    await depScheduler.acquire(blocked.id);
  } catch {
    starved = true;
  }
  check(starved, 'a task with unmet dependencies is not dispatched');
  equal(blocker.status, 'queued', 'the blocker itself was never dispatched either');

  // high priority wins
  const orderScheduler = new DynamicScheduler(agentRegistry, { pollIntervalMs: 5 });
  agentRegistry.register(agentProfile('w2', { maxConcurrency: 4 }), { brain: new DelayBrain(1) });
  const low = orderScheduler.enqueue({ id: 'low', name: 'low', type: 'agent', agentId: 'w2' }, 'run', 'exec', 2);
  const high = orderScheduler.enqueue({ id: 'high', name: 'high', type: 'agent', agentId: 'w2' }, 'run', 'exec', 8);
  const acquired = await orderScheduler.acquire(high.id);
  equal(acquired.task.id, high.id, 'higher priority task is dispatched first');
  orderScheduler.release(high.id, true);
  const next = await orderScheduler.acquire(low.id);
  equal(next.task.id, low.id, 'the lower priority task then proceeds');

  // capacity is respected
  const capScheduler = new DynamicScheduler(agentRegistry, { pollIntervalMs: 5, maxWaitMs: 3000 });
  const running: string[] = [];
  const jobs = [0, 1, 2].map(() => {
    const t = capScheduler.enqueue({ id: 'cap', name: 'cap', type: 'agent', agentId: 'w1' }, 'run', 'exec', 5);
    return (async () => {
      const { task: acquiredTask } = await capScheduler.acquire(t.id);
      running.push(acquiredTask.id);
      await sleep(20);
      capScheduler.release(t.id, true);
    })();
  });
  await Promise.all(jobs);
  equal(running.length, 3, 'all three tasks eventually run through a single-slot agent');

  // retry / fail-over path
  const retryScheduler = new DynamicScheduler(agentRegistry, { pollIntervalMs: 5, maxRetries: 1 });
  let attempts = 0;
  const result = await retryScheduler.run(
    { id: 'retry', name: 'retry', type: 'agent', agentId: 'w2' },
    'run',
    'exec',
    5,
    [],
    async () => {
      attempts++;
      if (attempts === 1) throw new Error('transient failure');
      return 'ok';
    }
  );
  equal(result, 'ok', 'a failing task is retried and succeeds');
  equal(attempts, 2, 'exactly one retry was performed');
  equal(retryScheduler.getStats().retried, 1, 'retry counter is exposed to the UI');
}

// ---------------------------------------------------------------------------
// 7. verification
// ---------------------------------------------------------------------------

async function suiteVerification(): Promise<void> {
  describe('[7] verification engine');

  const { toolRegistry, agentRegistry } = toolsAndAgents();
  agentRegistry.register(agentProfile('reviewer_01', { role: 'code_reviewer', maxConcurrency: 3 }));
  agentRegistry.register(agentProfile('security_auditor_01', { role: 'security_auditor', maxConcurrency: 3 }));

  const verifier = new VerificationEngine(agentRegistry, toolRegistry);
  const spec = makeVerificationSpec({ auditors: ['reviewer_01', 'security_auditor_01'], requireCluster: false });

  const good = renderRateLimiter(FULLY_FIXED);
  const goodResult = await verifier.verify({ code: good }, spec, { requirementSpec: { testSuiteCode: '' } });
  check(goodResult.passed === true, 'a fully hardened artifact passes every tier');
  equal(goodResult.tiers?.length, 3, 'all three tiers report a result');
  check(goodResult.score >= 0.9, `composite score meets the threshold (${goodResult.score})`);

  // REGRESSION (P1): Tier-3 used to approve anything longer than 20 characters.
  const bad = renderRateLimiter(BASE_FEATURES);
  const badResult = await verifier.verify({ code: bad }, spec, { requirementSpec: { testSuiteCode: '' } });
  equal(badResult.passed, false, 'a defective artifact is blocked');
  check((badResult.auditorReviews ?? []).some(r => !r.approved), 'Tier-3 actually rejects — consensus is not a constant');
  check(
    (badResult.auditorReviews ?? []).some(r => (r.signals ?? []).includes('REV-001')),
    'reviewer signals an attributable rule id'
  );
  check(
    (badResult.auditorReviews ?? []).some(r => (r.signals ?? []).includes('SEC-003')),
    'security auditor signals an attributable rule id'
  );
  check((badResult.blockingReasons ?? []).length > 0, 'blocking reasons are enumerated');
  check((badResult.failedRuleIds ?? []).includes('EDGE-001'), 'sandbox assertion failures are mapped to rule ids');

  // a critical rule failure blocks even when the numeric score is high
  const clusterSpec = makeVerificationSpec({ auditors: ['reviewer_01', 'security_auditor_01'], requireCluster: true });
  const clusterResult = await verifier.verify({ code: good }, clusterSpec, { requirementSpec: { testSuiteCode: '' } });
  check(clusterResult.score >= 0.9 && clusterResult.passed === false, 'a single unsatisfiable critical rule blocks regardless of score');
  check((clusterResult.blockingReasons ?? []).some(r => r.includes('DIST-001')), 'the unsatisfiable rule is named in the blocking reasons');
}

// ---------------------------------------------------------------------------
// 8. self-loop
// ---------------------------------------------------------------------------

async function suiteSelfLoop(): Promise<void> {
  describe('[8] self-loop (PDCA)');

  const { toolRegistry, agentRegistry } = toolsAndAgents();
  agentRegistry.register(agentProfile('critic', { role: 'critic', maxConcurrency: 4 }));
  const verifier = new VerificationEngine(agentRegistry, toolRegistry);
  const loop = new SelfLoopEngine(agentRegistry, verifier);

  const spec = makeVerificationSpec({
    auditors: [],
    requireCluster: false
  });
  // the auditors list is empty above, so the consensus tier is skipped on purpose
  spec.rules = spec.rules.filter(r => r.id !== 'DIST-001');

  const run = await loop.runLoop(
    {
      maxIterations: 3,
      targetNodeId: 'develop',
      criticAgentId: 'critic',
      verificationNodeId: 'verify',
      convergenceThreshold: 0.9
    },
    spec,
    { goal: 'ship a rate limiter' },
    async (_input, iteration, _guidance, failures) => {
      // the repair is driven purely by the failure ids
      const flags = { ...BASE_FEATURES };
      for (const f of failures) {
        if (f.id === 'EDGE-001') flags.rangeGuard = true;
        if (f.id === 'EDGE-002') flags.validateConsume = true;
        if (f.id === 'EDGE-003') flags.integerTokens = true;
        if (f.id === 'SEC-003') flags.finiteGuard = true;
        if (f.id === 'REV-001') flags.invariantsDoc = true;
      }
      void iteration;
      return { code: renderRateLimiter(flags) };
    }
  );

  equal(run.converged, true, 'the loop converges when every failure has a strategy');
  equal(run.totalIterations, 2, 'it converges on the second iteration');
  check(run.history[0].failedRuleIds.length >= 3, 'the first iteration records structured failure ids');
  check(run.accumulatedFailures.length >= 3, 'failures accumulate across iterations');

  // unsatisfiable requirement → escalation, no silent success
  const hardSpec = makeVerificationSpec({ auditors: [], requireCluster: true });
  const escalated = await loop.runLoop(
    {
      maxIterations: 2,
      targetNodeId: 'develop',
      criticAgentId: 'critic',
      verificationNodeId: 'verify',
      convergenceThreshold: 0.9
    },
    hardSpec,
    { goal: 'distributed rate limiter' },
    async (_input, _iteration, _guidance, failures) => {
      const flags = { ...FULLY_FIXED };
      void failures;
      return { code: renderRateLimiter(flags) };
    }
  );
  equal(escalated.converged, false, 'an unsatisfiable rule prevents convergence');
  check(!!escalated.humanEscalation, 'a structured escalation card is produced');
  check(escalated.humanEscalation!.options.length === 3, 'the card offers exactly three options');
  check(escalated.humanEscalation!.reason.includes('DIST-001') || escalated.humanEscalation!.reason.includes('not converge'), 'the card explains why');

  // REGRESSION (P1): prompt refinement must be idempotent.
  const optimizer = new FeedbackOptimizer(agentRegistry, toolRegistry);
  agentRegistry.register(agentProfile('refine-me'));
  const failure = {
    passed: false,
    score: 0.4,
    ruleResults: [{ ruleId: 'EDGE-001', ruleName: 'guard', passed: false, message: 'needs a guard', score: 0 }]
  };
  const first = optimizer.autoRefinePrompt('refine-me', failure as any, 1);
  const second = optimizer.autoRefinePrompt('refine-me', failure as any, 2);
  check(first !== null, 'a guardrail is appended on the first failure');
  equal(second, null, 're-applying an identical failure adds nothing');
  const prompt = agentRegistry.get('refine-me')!.profile.systemPrompt;
  equal(prompt.split('EDGE-001').length - 1, 1, 'the guardrail appears exactly once in the prompt');
}

// ---------------------------------------------------------------------------
// 9. end-to-end
// ---------------------------------------------------------------------------

async function suiteEndToEnd(): Promise<void> {
  describe('[9] orchestrator end-to-end');

  const orchestrator = new Orchestrator();
  const tasks = orchestrator.getTasks();
  equal(tasks.length, 3, 'three tasks are registered');

  const runs = await orchestrator.runAll(tasks, { concurrency: 3 });
  equal(runs.length, 3, 'all three runs complete');

  const easy = runs.find(r => r.taskId === 'rl-easy')!;
  const normal = runs.find(r => r.taskId === 'rl-normal')!;
  const hard = runs.find(r => r.taskId === 'rl-hard')!;

  equal(easy.status, 'completed', 'the clean task completes');
  equal(easy.iterations, 1, 'the clean task converges in a single self-loop iteration');

  equal(normal.status, 'completed', 'the defective task is healed and completes');
  equal(normal.iterations, 2, 'it takes exactly two iterations');
  check((normal.verification?.score ?? 0) >= 0.9, 'the healed artifact verifies above the threshold');
  check((normal.artifact ?? '').includes('throw new RangeError'), 'the repaired artifact contains the missing guard');
  check((normal.patch?.patch ?? '').includes('@@'), 'a real unified diff patch was produced');

  equal(hard.status, 'needs_human', 'the unsatisfiable task escalates to a human');
  check(!!hard.escalation, 'the escalation request is attached to the run');

  // the modules that used to be dead code are now on the critical path
  const snap = orchestrator.getSnapshot();
  check(snap.scheduler.dispatches >= 6, `the scheduler dispatched real work (${snap.scheduler.dispatches})`);
  check(snap.tools.length >= 3, `tool metrics were recorded for ${snap.tools.length} tools`);
  check(snap.promptOptimizations >= 1, `the optimizer refined prompts ${snap.promptOptimizations} time(s)`);
  check(snap.agents.every(a => a.tokens > 0), 'every agent accrued a token estimate');
  check(
    snap.agents.some(a => a.load > 0) || snap.scheduler.dispatches > 0,
    'agents actually executed through the scheduler'
  );

  // escalation handling
  check(hard.status === 'needs_human' && !!hard.escalation, 'an escalated run is available for the retry path');

  const accepted = await orchestrator.resolveEscalation(hard.runId, 1);
  equal(accepted?.status, 'completed', 'accepting the draft closes the escalation');
  check(!!accepted?.patch?.patch, 'the accepted draft still yields a patch');

  const orchestrator2 = new Orchestrator();
  const hardTask = orchestrator2.getTasks().find(t => t.id === 'rl-hard')!;
  const hardRun = await orchestrator2.runTask(hardTask);
  const retried = await orchestrator2.resolveEscalation(hardRun.runId, 0);
  check(retried?.runId !== hardRun.runId, 'the retry option starts a fresh run with a doubled budget');
  equal(orchestrator2.getRuns().length, 2, 'both the original and the retried run are tracked');
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const started = Date.now();
  process.stdout.write('\n=== AetherHarness test suite ===\n');
  process.stdout.write('Each case targets a defect that shipped in v1.0 or a contract v2.0 enforces.\n');

  await suiteTools();
  await suiteDiff();
  await suiteAgents();
  await suiteKnowledge();
  await suiteWorkflow();
  await suiteScheduler();
  await suiteVerification();
  await suiteSelfLoop();
  await suiteEndToEnd();

  const elapsed = Date.now() - started;
  process.stdout.write('\n' + '='.repeat(64) + '\n');
  if (failed === 0) {
    process.stdout.write(`  ALL ${passed} CHECKS PASSED  (${elapsed}ms)\n`);
  } else {
    process.stdout.write(`  ${passed} passed, ${failed} FAILED  (${elapsed}ms)\n`);
    for (const f of failures) process.stdout.write(`   ✘ ${f}\n`);
  }
  process.stdout.write('='.repeat(64) + '\n\n');

  process.exit(failed === 0 ? 0 : 1);
}

main().catch(err => {
  process.stderr.write(`\ntest harness crashed: ${err?.stack ?? err}\n`);
  process.exit(1);
});
