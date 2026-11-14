import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { Orchestrator, type RunSnapshot } from '../src/orchestrator.js';
import { agentTemplate } from '../src/studio/catalog.js';
import { blankGraph, Graph, GraphNode, GraphError } from '../src/studio/graph.js';
import type { LlmProvider, LlmMessage, LlmChatOptions } from '../src/agent/llm/provider.js';
import { WebServer } from '../src/web/server.js';
import { hashWebToken } from '../src/web/accounts.js';
import { BASE_FEATURES, FULLY_FIXED, renderRateLimiter } from '../src/scenarios/rate-limiter.js';
import { runTests } from '../src/tools/test-runner.js';

let checks = 0;
function check(value: unknown, label: string) { assert.ok(value, label); checks++; console.log('  ✔ ' + label); }
class Provider implements LlmProvider {
  name = 'graph-fixture'; model = 'graph-model'; calls: LlmMessage[][] = []; active = 0; peak = 0;
  async chat(messages: LlmMessage[], options?: LlmChatOptions) {
    this.calls.push(structuredClone(messages)); this.active++; this.peak = Math.max(this.peak, this.active);
    try {
      await sleep(10, undefined, { signal: options?.signal });
      const request = JSON.parse(messages.at(-1)!.content), input = request.input;
      const output = input.auditTarget !== undefined ? { approved: !input.auditTarget.includes('eval('), comments: 'Fixture audit', signals: input.auditTarget.includes('eval(') ? [{ ruleId: 'SEC-001', message: 'remove eval' }] : [] }
        : input.failedRules ? { feedback: 'Remove eval and return const result = 1;' }
        : { code: input.goal === 'repository-repair' ? renderRateLimiter(input.feedback ? FULLY_FIXED : BASE_FEATURES)
          : input.goal === 'repair' && !input.feedback ? 'eval(userInput)' : 'const result = 1;', marker: input.goal };
      return { content: JSON.stringify({ type: 'final', output }), usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 }, model: this.model, latencyMs: 10 };
    } finally { this.active--; }
  }
}
const directory = mkdtempSync(join(tmpdir(), 'aether-graph-tests-')); const provider = new Provider();
let harness = new Orchestrator({ dataDir: directory, llm: { provider } });
let server: WebServer | undefined;
try {
  const catalog = harness.studio.catalog;
  const devConfig = agentTemplate('developer', harness.studio.model.ref); devConfig.limits.maxConcurrency = 2;
  const dev = catalog.create('agents', { slug: 'graph-dev', config: devConfig }, 'operator');
  const tester = catalog.create('agents', { slug: 'graph-tester', config: agentTemplate('qa_verifier', harness.studio.model.ref) }, 'operator');
  const team = catalog.create('teams', { slug: 'graph-team', config: { name: 'Graph team', description: '', routing: 'sequence', toolIds: ['static_analyzer', 'git_patch_manager'],
    members: [{ memberId: 'dev', agentRef: { id: dev.id, revision: 1 }, responsibility: 'Develop', eligibleCapabilities: ['code_generation'] },
      { memberId: 'tester', agentRef: { id: tester.id, revision: 1 }, responsibility: 'Inspect', eligibleCapabilities: ['quality_assurance'] }], handoffs: [{ from: 'dev', to: 'tester' }] } }, 'operator');
  const base = () => blankGraph({ id: team.id, revision: 1 });
  const node = (id: string, type: GraphNode['type'], config: GraphNode['config'] = {}, bindings: GraphNode['bindings'] = {}): GraphNode =>
    ({ id, type, name: id, config, bindings, position: { x: 100, y: 100 }, timeoutMs: 30000 });
  function chain(middle: GraphNode[]) {
    const graph = base(); graph.nodes.splice(1, 0, ...middle);
    graph.nodes.at(-1)!.bindings = { result: { source: 'node', nodeId: middle.at(-1)?.id ?? 'start', path: [] } };
    graph.edges = graph.nodes.slice(1).map((n, i) => ({ id: 'e' + i, from: graph.nodes[i].id, to: n.id })); return graph;
  }
  let counter = 0;
  function save(graph: Graph) {
    const item = harness.studio.workflows.create({ slug: 'flow-' + ++counter, config: graph }, 'operator');
    return harness.studio.workflows.mutate(item.id, item.etag, 'revision', {}, 'operator');
  }
  const request = (id: string, input: any = { goal: 'normal' }, revision = 1) => ({ kind: 'workflow', workflowRef: { id, revision }, input });
  console.log('\nGraph compiler and executable versions');
  const graph = chain([node('dev', 'agent', { memberId: 'dev' }), node('test', 'agent', { memberId: 'tester' }, { previous: { source: 'node', nodeId: 'dev', path: [] } })]);
  const definition = save(graph);
  const sequential = await harness.runStudio(request(definition.id));
  check(sequential.status === 'completed' && sequential.attempts?.length === 4, 'saved graph executes Start, Developer, Tester and End using WorkflowEngine');
  check(sequential.attempts![2].input.previous.code === 'const result = 1;', 'input bindings reach the actual downstream model call');
  check(sequential.definitions?.workflow?.hash === definition.revisions[0].hash && sequential.definitions.compilerVersion === 'graph-v1', 'run binds the immutable workflow revision and compiler version');
  for (const [label, mutate] of [
    ['cycle', (g: Graph) => { g.edges.push({ id: 'cycle', from: 'test', to: 'dev' }); }],
    ['ordinary fan-out', (g: Graph) => { g.edges.push({ id: 'fanout', from: 'start', to: 'test' }); }],
    ['unknown endpoint', (g: Graph) => { g.edges[0].to = 'missing'; }],
    ['future input', (g: Graph) => { g.nodes[1].bindings = { previous: { source: 'node', nodeId: 'test', path: [] } }; }],
    ['unknown member', (g: Graph) => { g.nodes[1].config.memberId = 'intruder'; }],
    ['reserved compiler id', (g: Graph) => { g.nodes[1].id = 'loop__develop'; }],
    ['prototype mapping', (g: Graph) => { g.nodes[1].bindings = { bad: { source: 'input', path: ['__proto__'] } }; }]
  ] as const) { const invalid = structuredClone(graph); mutate(invalid); assert.throws(() => harness.studio.compile(invalid)); check(true, `${label} rejected by server compiler`); }
  const draft = harness.studio.workflows.create({ slug: 'incomplete', config: { ...base(), edges: [] } }, 'operator');
  check(draft.revisions.length === 0, 'invalid graph can be saved only as a draft');
  assert.throws(() => harness.studio.workflows.mutate(draft.id, draft.etag, 'revision', {}, 'operator'), GraphError); checks++;
  assert.throws(() => harness.runStudio(request(draft.id)), /版本不存在/); checks++;
  const committed = harness.studio.workflows.mutate(definition.id, definition.etag, 'publish', { revision: 1 }, 'operator');
  check(committed.publishedRevision === 1, 'publication points to a compiled immutable revision');
  assert.throws(() => harness.studio.workflows.mutate(definition.id, definition.etag, 'draft', graph, 'operator'), /其他操作/); checks++;
  const test = await harness.runStudio({ ...request(definition.id, { goal: 'single-node' }), kind: 'node-test', nodeId: 'dev' });
  check(test.status === 'completed' && test.attempts?.length === 1 && test.definitions?.kind === 'node-test', 'single-node tests use explicit mapped sample input in an isolated run');

  const condition = chain([node('choose', 'condition', { predicate: { left: { source: 'input', path: ['approved'] }, operator: 'eq', right: true } })]);
  condition.nodes.push(node('rejected', 'end', {}, { outcome: { source: 'literal', value: 'rejected' } }));
  condition.nodes.find(n => n.id === 'end')!.bindings = { outcome: { source: 'literal', value: 'approved' } };
  condition.edges[1].port = 'true'; condition.edges.push({ id: 'else', from: 'choose', to: 'rejected', port: 'false' });
  const conditional = save(condition);
  const yes = await harness.runStudio(request(conditional.id, { approved: true })); const no = await harness.runStudio(request(conditional.id, { approved: false }));
  check((yes.result as any).outcome === 'approved' && (no.result as any).outcome === 'rejected' && yes.attempts!.length === 3, 'Condition runs exactly one route, including its default false branch');

  console.log('\nParallel, subworkflows and feedback loops');
  const branch = save(chain([node('worker', 'agent', { memberId: 'dev' })]));
  const parallel = save(chain([node('parallel', 'parallel', { branches: [{ id: branch.id, revision: 1 }, { id: branch.id, revision: 1 }] })]));
  provider.peak = 0;
  const parallelRun = await harness.runStudio(request(parallel.id));
  check(parallelRun.status === 'completed' && provider.peak === 2, 'parallel subflows execute concurrently rather than sequentially');
  check((parallelRun.result as any).result.branches['1'].result.code === 'const result = 1;' && parallelRun.attempts!.filter(a => a.nodeId === 'end').length === 1, 'parallel branch namespaces are isolated and join executes once');
  check(parallelRun.attempts!.some(a => a.nodeId === 'parallel__branch1/worker') && parallelRun.definitions!.dependencies!.length === 2, 'nested attempts and dependency revisions are retained');
  const failing = chain([node('fail', 'tool', { toolId: 'static_analyzer' }, { code: { source: 'literal', value: 42 } })]);
  const badBranch = save(failing); const badParallel = save(chain([node('parallel', 'parallel', { branches: [{ id: branch.id, revision: 1 }, { id: badBranch.id, revision: 1 }] })]));
  const failedParallel = await harness.runStudio(request(badParallel.id));
  check(failedParallel.status === 'failed' && !failedParallel.attempts!.some(a => a.nodeId === 'end'), 'one failed parallel branch prevents downstream execution');
  const loop = save(chain([node('repair', 'loop', { developer: 'dev', tester: 'tester', maxIterations: 3, threshold: 1, verification: 'static-review' })]));
  const before = provider.calls.length;
  const repaired = await harness.runStudio(request(loop.id, { goal: 'repair' }));
  if (repaired.status !== 'completed' || repaired.loopRounds?.length !== 2) console.log(JSON.stringify({ status: repaired.status, error: repaired.error, attempts: repaired.attempts, rounds: repaired.loopRounds }, null, 2));
  check(repaired.status === 'completed' && repaired.loopRounds?.length === 2 && repaired.verification?.passed, 'real SelfLoopEngine repairs a first-round failure and converges in round two');
  check(provider.calls.slice(before).some(messages => JSON.parse(messages.at(-1)!.content).input.feedback?.includes('Remove eval')), 'Tester diagnosis reaches the next Developer input');
  const roundEvents = harness.getEvents(repaired.runId).filter(e => e.kind === 'loop.iteration');
  check(roundEvents.length === 2 && roundEvents[0].data?.candidateHash && roundEvents[0].data?.output.code.includes('eval('), 'each round retains candidate output, hash, verification and feedback');
  const auxiliary = harness.getEvents(repaired.runId).filter(e => e.kind === 'agent.finished');
  check(auxiliary.some(e => e.data?.nodePath?.includes('/audit/')) && auxiliary.some(e => e.data?.nodePath?.includes('/critic/')), 'auditor and diagnostic calls have distinct real execution paths');
  const exhausted = save(chain([node('repair', 'loop', { developer: 'dev', tester: 'tester', maxIterations: 1, threshold: 1, verification: 'static-review' })]));
  const stopped = await harness.runStudio(request(exhausted.id, { goal: 'repair' }));
  check(stopped.status === 'needs_human' && !stopped.verification?.passed, 'repair exhaustion requests human intervention rather than claiming success');
  const large = save(chain(Array.from({ length: 25 }, (_, i) => node('agent' + i, 'agent', { memberId: 'dev' }))));
  const longRun = await harness.runStudio(request(large.id));
  const longEventCount = harness.getEvents(longRun.runId).length;
  check(longEventCount > 100 && harness.getEvents(longRun.runId)[0].seq === 1, 'Studio keeps complete evidence beyond the legacy 100-event window');
  const expanded = save(chain([node('parallel', 'parallel', { branches: Array.from({ length: 8 }, () => ({ id: large.id, revision: 1 })) })]));
  assert.throws(() => harness.studio.compile(chain([node('parallel', 'parallel', { branches: Array.from({ length: 8 }, () => ({ id: expanded.id, revision: 1 })) })])), /500/); checks++;
  assert.throws(() => harness.studio.compile(chain([node('unsafe', 'tool', { toolId: 'code_sandbox' })])), /许可范围/); checks++;

  console.log('\nDurable approval continuation');
  const approvalGraph = save(chain([node('before', 'agent', { memberId: 'dev' }), node('approve', 'approval', { message: 'Review candidate', expiresInMs: 60000 }, { candidate: { source: 'node', nodeId: 'before', path: [] } })]));
  const paused = await harness.runStudio(request(approvalGraph.id));
  check(paused.status === 'paused' && paused.approvals?.[0].status === 'pending', 'Human Approval actually pauses execution and records its exact input');
  check(harness.scheduler.getInflight(dev.id) === 0, 'human waiting holds no Agent execution slot');
  const callsBeforeRestart = provider.calls.length;
  await harness.close(); harness = new Orchestrator({ dataDir: directory, llm: { provider } });
  check(harness.getEvents(longRun.runId).length === longEventCount, 'full event history survives restart');
  check(harness.getRun(paused.runId)?.status === 'paused', 'waiting approvals survive service restart');
  harness.decideApproval(paused.runId, paused.approvals![0].id, { decision: 'approve', key: 'once', reason: 'checked' }, 'operator');
  for (let i = 0; i < 100 && ['running', 'pending'].includes(harness.getRun(paused.runId)!.status); i++) await sleep(10);
  const resumed = harness.getRun(paused.runId)!;
  check(resumed.status === 'completed' && provider.calls.length === callsBeforeRestart, 'approval resumes from checkpoint without replaying the completed Agent');
  harness.decideApproval(paused.runId, paused.approvals![0].id, { decision: 'approve', key: 'once', reason: 'checked' }, 'operator');
  check(provider.calls.length === callsBeforeRestart, 'duplicate approval decision does not execute twice');
  assert.throws(() => harness.decideApproval(paused.runId, paused.approvals![0].id, { decision: 'reject', key: 'conflict' }, 'operator'), /已被处理/); checks++;
  const rejected = await harness.runStudio(request(approvalGraph.id));
  harness.decideApproval(rejected.runId, rejected.approvals![0].id, { decision: 'reject', key: 'reject' }, 'operator');
  check(rejected.status === 'failed' && !rejected.attempts!.some(a => a.nodeId === 'end'), 'rejected approval blocks downstream execution');
  const nestedApproval = save(chain([node('nested', 'subworkflow', { workflowRef: { id: approvalGraph.id, revision: 1 } })]));
  const nested = await harness.runStudio(request(nestedApproval.id));
  check(nested.status === 'paused' && nested.approvals![0].nodeId === 'nested/approve', 'sequential subworkflow approval propagates a durable nested pause');
  const nestedCalls = provider.calls.length;
  harness.decideApproval(nested.runId, nested.approvals![0].id, { decision: 'approve', key: 'nested' }, 'operator');
  for (let i = 0; i < 100 && ['running', 'pending'].includes(nested.status); i++) await sleep(10);
  check(nested.status === 'completed' && provider.calls.length === nestedCalls, 'nested continuation skips completed child nodes');
  assert.throws(() => harness.studio.compile(chain([node('parallel', 'parallel', { branches: [{ id: approvalGraph.id, revision: 1 }, { id: branch.id, revision: 1 }] })])), /并行分支/); checks++;
  const expired = await harness.runStudio(request(approvalGraph.id)); expired.approvals![0].expiresAt = 0;
  assert.throws(() => harness.decideApproval(expired.runId, expired.approvals![0].id, { decision: 'approve', key: 'late' }, 'operator'), /过期/);
  check(expired.status === 'failed', 'expired approval cannot resume execution');

  console.log('\nServer-owned verification permissions');
  const repoPath = join(directory, 'fixture-repo');
  mkdirSync(join(repoPath, 'src'), { recursive: true });
  const git = (...args: string[]) => execFileSync('git', ['-C', repoPath, ...args], { encoding: 'utf8' }).trim();
  const baseline = renderRateLimiter(BASE_FEATURES);
  writeFileSync(join(repoPath, 'src', 'rate-limiter.js'), baseline);
  git('init', '-q'); git('add', '--', 'src/rate-limiter.js'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Baseline');
  const repoConfig = { path: repoPath, revision: git('rev-parse', 'HEAD'), runnerImage: 'sha256:' + 'b'.repeat(64) };
  const repository = new Orchestrator({ llm: { provider }, project: repoConfig });
  try {
    const systemTeam = repository.studio.catalog.get('teams', 'default-team');
    const verifiedGraph = blankGraph({ id: systemTeam.id, revision: 1 });
    verifiedGraph.nodes.splice(1, 0, node('verify', 'verification', { verification: 'repository', auditors: [], target: { source: 'input', path: ['candidate'] } }));
    verifiedGraph.edges = [{ id: 'in', from: 'start', to: 'verify' }, { id: 'out', from: 'verify', to: 'end' }];
    const draft = repository.studio.workflows.create({ slug: 'container-verification', config: verifiedGraph }, 'operator');
    const fixed = repository.studio.workflows.mutate(draft.id, draft.etag, 'revision', {}, 'operator');
    let trustedSuite = '';
    repository.tools.register({ ...repository.tools.get('container_test_runner')!, handler: async params => {
      trustedSuite = params.testCode; return { success: true, report: { passed: 1, failed: 0, total: 1, errors: [] } };
    } });
    const body = request(fixed.id, { candidate: { code: 'const value = 1;' }, testCode: 'untrusted replacement' });
    const prepared = repository.studio.prepare(body);
    check(!prepared.tools.has('container_test_runner') && prepared.verificationTools?.has('container_test_runner'), 'container access belongs only to the server verification contract');
    await assert.rejects(prepared.tools.invoke('container_test_runner', {}), /denied|allowed|not found|scope/i); checks++;
    const result = await repository.runStudio(body);
    check(trustedSuite.length > 100 && !trustedSuite.includes('untrusted replacement') && repository.getEvents(result.runId).some(e => e.kind === 'tool.finished'), 'trusted fixed suite reaches the runner and emits actual invocation evidence');
    const changed = new Orchestrator({ llm: { provider }, project: { ...repoConfig, runnerImage: 'sha256:' + 'c'.repeat(64) } });
    try { assert.throws(() => changed.studio.prepareWorkflow(body, prepared.snapshot), /配置已改变/); checks++; } finally { await changed.close(); }

    const repoCatalog = repository.studio.catalog;
    const repoDeveloper = repoCatalog.create('agents', { slug: 'repository-developer', config: devConfig }, 'operator');
    const repoTester = repoCatalog.create('agents', { slug: 'repository-tester', config: agentTemplate('qa_verifier', repository.studio.model.ref) }, 'operator');
    const repoTeam = repoCatalog.create('teams', { slug: 'repository-team', config: { ...team.draft, members: team.draft.members.map((m, i) => ({ ...m, agentRef: { id: i === 0 ? repoDeveloper.id : repoTester.id, revision: 1 } })) } }, 'operator');
    const delivery = chain([node('repair', 'loop', { developer: 'dev', tester: 'tester', maxIterations: 3, threshold: 1, verification: 'repository' }),
      node('delivery', 'delivery', { sourceNodeId: 'repair', message: 'Confirm delivery', expiresInMs: 60000 })]);
    delivery.teamRef = { id: repoTeam.id, revision: 1 };
    const bypass = structuredClone(delivery); bypass.nodes[1].config.verification = 'static-review';
    assert.throws(() => repository.studio.compile(bypass), /固定仓库修复循环/); checks++;
    const deliveryDraft = repository.studio.workflows.create({ slug: 'delivery', config: delivery }, 'operator');
    const deliveryFlow = repository.studio.workflows.mutate(deliveryDraft.id, deliveryDraft.etag, 'revision', {}, 'operator');
    // The known fixture candidate is safe to test locally. Production uses the configured Docker runner.
    repository.tools.register({ ...repository.tools.get('container_test_runner')!, handler: async params => runTests({ ...params, timeoutMs: 3000 }) });
    const runDelivery = () => repository.runStudio(request(deliveryFlow.id, { goal: 'repository-repair' }));
    const waiting = await runDelivery();
    check(waiting.status === 'paused' && waiting.loopRounds?.length === 2 && waiting.verification?.passed && !waiting.patch, 'failed fixed suite feeds repair, then delivery waits for candidate approval');
    check(!repository.getEvents(waiting.runId).some(e => e.data?.toolId?.startsWith('git_')), 'Git tools are not invoked before delivery approval');
    assert.equal(waiting.approvals![0].input && (waiting.approvals![0].input as any).finalCode.code, renderRateLimiter(FULLY_FIXED));
    repository.decideApproval(waiting.runId, waiting.approvals![0].id, { decision: 'approve', key: 'delivery' }, 'operator');
    for (let i = 0; i < 100 && ['running', 'pending'].includes(waiting.status); i++) await sleep(10);
    check(waiting.status === 'completed' && waiting.artifact === renderRateLimiter(FULLY_FIXED) && waiting.patch?.patch && waiting.project?.revision === repoConfig.revision, 'approved exact candidate yields a checked Git patch on the pinned baseline');
    check(git('status', '--porcelain') === '' && repository.getEvents(waiting.runId).some(e => e.kind === 'tool.finished' && e.data?.toolId === 'git_check_patch' && e.data?.output.checked), 'real Git check succeeds without modifying the repository');
    const denied = await runDelivery();
    repository.decideApproval(denied.runId, denied.approvals![0].id, { decision: 'reject', key: 'delivery-denied' }, 'operator');
    check(denied.status === 'failed' && !denied.patch && !repository.getEvents(denied.runId).some(e => e.data?.toolId?.startsWith('git_')), 'rejected delivery cannot invoke Git or release a patch');
  } finally { await repository.close(); }

  console.log('\nWorkflow API, export/import and evidence');
  server = new WebServer({ port: 0, orchestrator: harness, accounts: [{ username: 'operator', role: 'operator', tokenHash: hashWebToken('b'.repeat(64)) }, { username: 'viewer', role: 'viewer', tokenHash: hashWebToken('a'.repeat(64)) }] });
  const { url } = await server.start();
  const http = (path: string, method = 'GET', body?: unknown, viewer = false) => fetch(url + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(`${viewer ? 'viewer' : 'operator'}:${(viewer ? 'a' : 'b').repeat(64)}`).toString('base64') }, body: body === undefined ? undefined : json(body) });
  function json(value: unknown) { return JSON.stringify(value); }
  const bundle = await (await http(`/api/studio/workflows/${definition.id}/export?revision=1`)).json();
  const importedResponse = await http('/api/studio/workflow-import', 'POST', { slug: 'imported', bundle }); const imported = await importedResponse.json();
  check(importedResponse.status === 201 && json(imported.draft) === json(graph), 'export/import preserves graph semantics and layout');
  bundle.hash = 'tampered'; check((await http('/api/studio/workflow-import', 'POST', { slug: 'tampered', bundle })).status === 422, 'tampered import is rejected before mutation');
  check((await http('/api/studio/workflows', 'GET', undefined, true)).status === 403 && (await http(`/api/studio/runs/${expired.runId}/approvals/${expired.approvals![0].id}`, 'POST', { decision: 'approve', key: 'viewer' }, true)).status === 403, 'viewer cannot access private design or approval actions');
  check((await http('/workflows')).status === 200 && (await http('/studio-assets/flow-editor.js')).status === 200, 'offline bundled React Flow editor assets are served');
  const evidence = await (await http('/api/studio/runs/' + repaired.runId)).json();
  check(evidence.events.some((e: any) => e.kind === 'agent.turn') && evidence.events.every((e: any) => e.seq > 0), 'persisted model turns and monotonic event sequence are available to the debugger');
  check(harness.studio.workflows.get(definition.id).publishedRevision === 1, 'published workflow revisions survive restart');
  console.log(`\nALL ${checks} WORKFLOW STUDIO CHECKS PASSED (injected model; actual engine and tools)\n`);
} finally {
  await server?.stop(); await harness.close();
  assert.ok(directory.startsWith(join(tmpdir(), 'aether-graph-tests-'))); rmSync(directory, { recursive: true, force: true });
}
