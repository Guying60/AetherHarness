import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { Orchestrator } from '../src/orchestrator.js';
import type { LlmProvider, LlmMessage, LlmChatOptions } from '../src/agent/llm/provider.js';
import { WebServer } from '../src/web/server.js';
import { hashWebToken } from '../src/web/accounts.js';
import { agentTemplate } from '../src/studio/catalog.js';
import { WorkflowEngine } from '../src/workflow/workflow-engine.js';
import { AgentConfig, TeamConfig, StudioError, validateAgent, validateSchema } from '../src/studio/definitions.js';

let checks = 0;
function check(value: unknown, label: string) { assert.ok(value, label); checks++; console.log('  ✔ ' + label); }
function fails(fn: () => unknown, code: string) {
  assert.throws(fn, e => e instanceof StudioError && e.code === code); checks++;
}
class Provider implements LlmProvider {
  name = 'test'; model = 'fixture';
  calls: Array<{ messages: LlmMessage[]; options?: LlmChatOptions }> = [];
  active = 0; peak = 0;
  handler = async (_messages: LlmMessage[], options?: LlmChatOptions): Promise<unknown> => {
    await sleep(10, undefined, { signal: options?.signal });
    return { type: 'final', output: { code: 'const result = 1;', approved: true } };
  };
  async chat(messages: LlmMessage[], options?: LlmChatOptions) {
    this.calls.push({ messages: structuredClone(messages), options });
    this.active++; this.peak = Math.max(this.peak, this.active);
    try { return { content: JSON.stringify(await this.handler(messages, options)), usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 }, model: this.model, latencyMs: 10 }; }
    finally { this.active--; }
  }
}
const directory = mkdtempSync(join(tmpdir(), 'aether-studio-test-'));
const provider = new Provider();
const secret = 'server-secret-never-expose';
let orchestrator = new Orchestrator({ dataDir: directory, llm: { provider, apiKey: secret }, maxConcurrentRuns: 2 });
const create = (slug: string, changes: Partial<AgentConfig> = {}) => orchestrator.studio.catalog.create('agents', {
  slug, config: { ...agentTemplate('developer', orchestrator.studio.model.ref), ...changes }
}, 'engineer');
const request = (id: string, revision = 1, input = { goal: 'test' }) => ({ kind: 'agent-test', agentRef: { id, revision }, input });
let server: WebServer | undefined;
try {
  console.log('\nStudio catalog, immutable versions and validation');
  const catalog = orchestrator.studio.catalog;
  const developer = create('my-developer', { systemPrompt: 'DEVELOPER-V1', constraints: ['CONSTRAINT-ONE'], temperature: 0.7 });
  const tester = create('my-tester', { role: 'qa_verifier', roleLabel: 'Tester', systemPrompt: 'TESTER', capabilities: { quality_assurance: 0.9 } });
  check(catalog.list('agents').length === 8, 'system defaults and custom roles coexist');
  fails(() => create('my-developer'), 'DUPLICATE_SLUG');
  const system = catalog.list('agents').find(a => a.origin === 'system')!;
  fails(() => catalog.mutate('agents', system.id, system.etag, 'archive', {}, 'engineer'), 'SYSTEM_READ_ONLY');
  fails(() => catalog.mutate('agents', developer.id, undefined, 'draft', developer.draft, 'engineer'), 'ETAG_REQUIRED');
  const updated = catalog.mutate('agents', developer.id, developer.etag, 'draft', { ...developer.draft, systemPrompt: 'DEVELOPER-V2' }, 'engineer');
  fails(() => catalog.mutate('agents', developer.id, developer.etag, 'draft', developer.draft, 'engineer'), 'VERSION_CONFLICT');
  check(catalog.revision('agents', { id: developer.id, revision: 1 }).config.systemPrompt === 'DEVELOPER-V1', 'saving a draft leaves published revision unchanged');
  const v2 = catalog.mutate('agents', developer.id, updated.etag, 'revision', {}, 'engineer');
  check(v2.revisions.length === 2 && v2.revisions[0].hash !== v2.revisions[1].hash, 'new revision has its own immutable content hash');
  const copy = catalog.create('agents', { slug: 'developer-copy', copyFrom: { id: developer.id, revision: 1 } }, 'engineer');
  check(copy.copiedFrom?.revision === 1 && copy.revisions[0].config.systemPrompt === 'DEVELOPER-V1', 'copy pins the selected source revision');
  const exposed = catalog.get('agents', developer.id); exposed.revisions[0].config.systemPrompt = 'MUTATED';
  check(catalog.revision('agents', { id: developer.id, revision: 1 }).config.systemPrompt === 'DEVELOPER-V1', 'callers cannot mutate catalog revisions by reference');
  fails(() => validateAgent({ ...developer.draft, apiKey: 'unsafe' }, ['static_analyzer']), 'INVALID_CONFIG');
  fails(() => validateAgent({ ...developer.draft, limits: { ...developer.draft.limits, maxTurns: NaN } }, ['static_analyzer']), 'INVALID_CONFIG');
  fails(() => validateSchema(JSON.parse('{"type":"object","properties":{"__proto__":{"type":"string"}}}')), 'INVALID_CONFIG');
  fails(() => validateSchema({ type: 'object', required: ['absent'] }), 'INVALID_CONFIG');
  const teamConfig: TeamConfig = { name: 'Developer + Tester', description: 'Implement then inspect', routing: 'sequence', coordinatorMemberId: 'dev',
    members: [{ memberId: 'dev', agentRef: { id: developer.id, revision: 1 }, responsibility: 'WRITE-CODE', eligibleCapabilities: ['code_generation'] },
      { memberId: 'qa', agentRef: { id: tester.id, revision: 1 }, responsibility: 'VERIFY-CODE', eligibleCapabilities: ['quality_assurance'] }],
    handoffs: [{ from: 'dev', to: 'qa' }], toolIds: ['static_analyzer'] };
  const team = catalog.create('teams', { slug: 'engineering', config: teamConfig }, 'engineer');
  for (const invalid of [
    { ...teamConfig, handoffs: [{ from: 'qa', to: 'dev' }] },
    { ...teamConfig, routing: 'capability' },
    { ...teamConfig, members: [{ ...teamConfig.members[0], agentRef: { id: developer.id, revision: 999 } }] },
    { ...teamConfig, members: [{ ...teamConfig.members[0], eligibleCapabilities: ['unknown'] }] }
  ]) assert.throws(() => catalog.create('teams', { slug: 'invalid', config: invalid }, 'engineer'), StudioError);
  check(true, 'invalid references, capabilities, reverse handoffs and incompatible routing are rejected at save');

  console.log('\nReal engine execution with an injected model transport');
  const teamRun = await orchestrator.runStudio({ kind: 'team', teamRef: { id: team.id, revision: 1 }, input: { goal: 'ship', userValue: 42 } });
  check(teamRun.status === 'completed' && teamRun.attempts?.length === 2, 'Developer and Tester execute through WorkflowEngine and persist two attempts');
  check(teamRun.definitions?.agents[0].revision === 1 && teamRun.definitions.team?.revision === 1, 'run pins the old Agent revision and exact team revision');
  const first = provider.calls[0], second = provider.calls[1];
  const firstInput = JSON.parse(first.messages.at(-1)!.content).input;
  const secondInput = JSON.parse(second.messages.at(-1)!.content).input;
  check(firstInput.userValue === 42 && !('lastOutput' in firstInput) && secondInput.previous.code === 'const result = 1;', 'mapped node inputs reach the model and upstream output reaches Tester');
  check(first.messages[0].content.includes('DEVELOPER-V1') && first.messages[0].content.includes('CONSTRAINT-ONE') && first.messages[0].content.includes('WRITE-CODE'), 'system prompt, constraints and team responsibilities affect actual model input');
  check(first.options?.temperature === 0.7 && first.options.model === 'fixture' && teamRun.attempts![0].meta?.tokensUsed === 10, 'model settings and actual token usage are retained');
  check(!teamRun.patch && !teamRun.verification && teamRun.summary?.includes('未进行正式交付验收'), 'custom output is not represented as verified delivery');
  const teamCopy = catalog.create('teams', { slug: 'team-copy', copyFrom: { id: team.id, revision: 1 } }, 'engineer');
  check(teamCopy.revisions[0].hash === team.revisions[0].hash, 'team templates copy exact member references and handoffs');
  const capability = catalog.create('teams', { slug: 'capability-team', config: { ...teamConfig, routing: 'capability', handoffs: [] } }, 'engineer');
  const routed = await orchestrator.runStudio({ kind: 'team', teamRef: { id: capability.id, revision: 1 }, input: {}, capability: 'quality_assurance' });
  check(routed.status === 'completed' && routed.attempts![0].meta?.agentId === tester.id, 'capability routing only selects a qualified member of the chosen team');
  fails(() => orchestrator.runStudio({ kind: 'team', teamRef: { id: capability.id, revision: 1 }, input: {}, capability: 'unavailable' }), 'NO_CAPABLE_MEMBER');

  provider.handler = async messages => messages.some(m => m.content.includes('toolResult'))
    ? { type: 'final', output: { approved: false } }
    : { type: 'tool', toolId: 'static_analyzer', input: { code: 'eval(userInput)' } };
  const toolsRun = await orchestrator.runStudio(request(developer.id));
  check(toolsRun.attempts![0].meta?.toolCalls[0].success === true && toolsRun.attempts![0].meta?.toolCalls[0].output.issues.length > 0, 'authorized tool runs and actual tool output appears in evidence');
  const restricted = create('restricted', { toolIds: [] });
  const denied = await orchestrator.runStudio(request(restricted.id));
  check(denied.attempts![0].meta?.toolCalls[0].success === false && /not authorized/.test(denied.attempts![0].meta?.toolCalls[0].error), 'server denies model-requested tools outside Agent whitelist');
  const noToolTeam = catalog.create('teams', { slug: 'no-tool-team', config: { ...teamConfig, toolIds: [] } }, 'engineer');
  const noToolRun = await orchestrator.runStudio({ kind: 'team', teamRef: { id: noToolTeam.id, revision: 1 }, input: {} });
  check(noToolRun.attempts!.every(a => a.meta?.toolCalls[0].success === false), 'team whitelist further restricts each member');
  let dangerousCalls = 0;
  const dangerousTool = orchestrator.tools.get('code_sandbox')!;
  const originalHandler = dangerousTool.handler;
  dangerousTool.handler = async () => { dangerousCalls++; return {}; };
  provider.handler = async messages => messages.some(m => m.content.includes('toolResult')) ? { type: 'final', output: {} }
    : { type: 'tool', toolId: 'code_sandbox', input: { code: 'danger' } };
  const dangerous = create('dangerous', { toolIds: ['code_sandbox'] });
  const policyRun = await orchestrator.runStudio(request(dangerous.id));
  dangerousTool.handler = originalHandler;
  check(dangerousCalls === 0 && policyRun.attempts![0].meta?.toolCalls[0].success === false, 'service policy blocks approval-dependent tools even when definition allows them');
  check(orchestrator.studio.getCatalog().tools.filter(t => ['test_runner', 'code_sandbox'].includes(t.id)).every(t => !t.available), 'arbitrary code execution stays blocked until approval and isolation are connected');
  await assert.rejects(orchestrator.tools.scoped([]).invoke('static_analyzer', { code: '' })); checks++;

  provider.handler = async () => ({ type: 'tool', toolId: 'static_analyzer', input: { code: '' } });
  const bounded = create('bounded', { limits: { ...developer.draft.limits, maxTurns: 2 } });
  const beforeTurns = provider.calls.length;
  const exhausted = await orchestrator.runStudio(request(bounded.id));
  check(exhausted.status === 'failed' && provider.calls.length - beforeTurns === 2 && exhausted.attempts![0].meta?.toolCalls.length === 2, 'maxTurns bounds total model turns without implicit scheduler replay');
  provider.handler = async () => ({ type: 'final', output: 'wrong-shape' });
  const invalidOutput = await orchestrator.runStudio(request(developer.id));
  check(invalidOutput.status === 'failed' && invalidOutput.attempts![0].error?.includes('output'), 'invalid output schema fails visibly instead of falling back offline');
  const strict = create('strict-input', { inputSchema: { type: 'object', properties: { goal: { type: 'string' } }, required: ['goal'], additionalProperties: false } });
  const inputBefore = provider.calls.length;
  const invalidInput = await orchestrator.runStudio({ ...request(strict.id), input: {} });
  check(invalidInput.status === 'failed' && provider.calls.length === inputBefore, 'invalid input is rejected before any model call');
  provider.handler = async () => { throw new Error('provider failure ' + secret); };
  const secretRun = await orchestrator.runStudio(request(developer.id));
  check(secretRun.status === 'failed' && !JSON.stringify(secretRun).includes(secret) && !JSON.stringify(orchestrator.getEvents(secretRun.runId)).includes(secret), 'provider credentials are redacted from errors, events and snapshots');

  console.log('\nCapacity, memory isolation, cancellation and frozen admissions');
  provider.calls = []; provider.peak = 0;
  provider.handler = async (_messages, options) => { await sleep(70, undefined, { signal: options?.signal }); return { type: 'final', output: {} }; };
  const simultaneous = await Promise.all([orchestrator.runStudio(request(developer.id, 1, { goal: 'A' })), orchestrator.runStudio(request(developer.id, 2, { goal: 'B' }))]);
  check(simultaneous.every(r => r.status === 'completed') && provider.peak === 1, 'stable Agent identity enforces shared capacity across run-local instances and versions');
  check(provider.calls.every(c => c.messages.length === 2) && provider.calls[1].messages.every(m => !m.content.includes('"goal":"A"')), 'new runs do not inherit another run’s messages');
  check(orchestrator.scheduler.getInflight(developer.id) === 0, 'scheduler reservations are released after execution');
  const compiled = orchestrator.studio.prepare(request(developer.id));
  compiled.workflow.nodes[0].maxRetries = -1;
  check(!new WorkflowEngine({ agentRegistry: compiled.agents, toolRegistry: compiled.tools }).validate(compiled.workflow).valid, 'invalid retry limits cannot enter an executable workflow');
  const queuedHarness = new Orchestrator({ maxConcurrentRuns: 1, llm: { provider } });
  try {
    const queuedAgent = queuedHarness.studio.catalog.create('agents', { slug: 'queued-agent', config: agentTemplate('developer', queuedHarness.studio.model.ref) }, 'operator');
    const firstRun = queuedHarness.runStudio(request(queuedAgent.id));
    let queuedId = '';
    const secondRun = queuedHarness.runStudio(request(queuedAgent.id), { onStart: id => { queuedId = id; } });
    check(queuedHarness.getRun(queuedId)?.status === 'pending' && queuedHarness.getRun(queuedId)?.definitions?.agents[0].revision === 1, 'pending runs bind immutable definitions at admission');
    const draft = queuedHarness.studio.catalog.mutate('agents', queuedAgent.id, queuedAgent.etag, 'draft', { ...queuedAgent.draft, systemPrompt: 'CHANGED-AFTER-QUEUE' }, 'operator');
    const published = queuedHarness.studio.catalog.mutate('agents', queuedAgent.id, draft.etag, 'revision', {}, 'operator');
    queuedHarness.studio.catalog.mutate('agents', queuedAgent.id, published.etag, 'status', { enabled: false }, 'operator');
    const settled = await Promise.all([firstRun, secondRun]);
    check(settled.every(run => run.status === 'completed') && settled[1].definitions?.agents[0].config.systemPrompt === queuedAgent.draft.systemPrompt,
      'queued execution keeps admitted configuration after a new revision and disabling');
  } finally { await queuedHarness.close(); }
  for (const [mode, maxMessages, expected] of [['run-window', 2, 4], ['run-window', 0, 2], ['none', 8, 2]] as const) {
    const memoryAgent = create(`memory-${mode}-${maxMessages}`, { memoryPolicy: { mode, maxMessages } });
    const prepared = orchestrator.studio.prepare(request(memoryAgent.id));
    const instance = prepared.agents.get('agent')!;
    await instance.execute({ taskId: 'memory-first', agentId: 'agent', input: { goal: 'first' } });
    await instance.execute({ taskId: 'memory-second', agentId: 'agent', input: { goal: 'second' } });
    check(provider.calls.at(-1)!.messages.length === expected, `memory policy ${mode}/${maxMessages} controls actual repeated Agent input`);
  }
  const retired = create('retired');
  const disabled = catalog.mutate('agents', retired.id, retired.etag, 'status', { enabled: false }, 'engineer');
  fails(() => orchestrator.runStudio(request(retired.id)), 'DISABLED');
  catalog.mutate('agents', retired.id, disabled.etag, 'status', { enabled: true }, 'engineer');
  check((await orchestrator.runStudio(request(retired.id))).status === 'completed', 'reenabling a custom Agent allows new runs');
  const disabledTeam = catalog.mutate('teams', teamCopy.id, teamCopy.etag, 'status', { enabled: false }, 'engineer');
  fails(() => orchestrator.runStudio({ kind: 'team', teamRef: { id: teamCopy.id, revision: 1 }, input: {} }), 'DISABLED');
  const teamDraft = catalog.mutate('teams', teamCopy.id, disabledTeam.etag, 'draft', { ...teamCopy.draft, description: 'Revised team' }, 'engineer');
  const teamV2 = catalog.mutate('teams', teamCopy.id, teamDraft.etag, 'revision', {}, 'engineer');
  check(teamV2.revisions.length === 2 && catalog.revision('teams', { id: teamCopy.id, revision: 1 }).config.description === teamConfig.description, 'team revision changes preserve prior templates');
  const pendingRun = orchestrator.runStudio(request(copy.id));
  catalog.mutate('agents', copy.id, copy.etag, 'archive', {}, 'engineer');
  const pinned = await pendingRun;
  check(pinned.status === 'completed' && pinned.definitions?.agents[0].revision === 1, 'archiving after admission does not alter the admitted run');
  fails(() => orchestrator.runStudio(request(copy.id)), 'DISABLED');
  check(catalog.revision('agents', { id: copy.id, revision: 1 }).hash === copy.revisions[0].hash, 'archived revisions remain available for history');
  provider.handler = async (_messages, options) => { await sleep(5000, undefined, { signal: options?.signal }); return { type: 'final', output: {} }; };
  let cancelledId = '';
  const running = orchestrator.runStudio(request(developer.id), { onStart: id => { cancelledId = id; } });
  await sleep(20); orchestrator.cancelRun(cancelledId, 'engineer', 'test cancellation');
  const cancelled = await running;
  check(cancelled.status === 'cancelled' && provider.active === 0 && orchestrator.scheduler.getInflight(developer.id) === 0, 'cancellation aborts model execution and releases capacity');
  const timed = create('timed', { limits: { ...developer.draft.limits, timeoutMs: 100 } });
  const timeout = await orchestrator.runStudio(request(timed.id));
  check(timeout.status === 'failed' && timeout.attempts![0].error?.includes('budget'), 'configured timeout produces a failed attempt');
  const noModel = new Orchestrator();
  try {
    const template = agentTemplate('developer', noModel.studio.model.ref);
    const unavailable = noModel.studio.catalog.create('agents', { slug: 'unavailable', config: template }, 'operator');
    fails(() => noModel.runStudio(request(unavailable.id)), 'MODEL_UNAVAILABLE');
  } finally { await noModel.close(); }

  console.log('\nHTTP authorization, idempotency and persistence');
  provider.handler = async () => ({ type: 'final', output: { ok: true } });
  const accounts = [{ username: 'operator', role: 'operator' as const, tokenHash: hashWebToken('b'.repeat(64)) },
    { username: 'viewer', role: 'viewer' as const, tokenHash: hashWebToken('a'.repeat(64)) }];
  server = new WebServer({ port: 0, orchestrator, accounts });
  const { url } = await server.start();
  const http = (path: string, method = 'GET', body?: unknown, role = 'operator', extra = {}) => fetch(url + path, {
    method, headers: { Authorization: 'Basic ' + Buffer.from(`${role}:${(role === 'operator' ? 'b' : 'a').repeat(64)}`).toString('base64'), 'Content-Type': 'application/json', ...extra },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  check((await fetch(url + '/api/studio/agents')).status === 401, 'anonymous Studio API access requires authentication');
  const viewerList = await (await http('/api/studio/agents', 'GET', undefined, 'viewer')).json();
  check(!JSON.stringify(viewerList).includes('systemPrompt') && !JSON.stringify(viewerList).includes('DEVELOPER-V1'), 'viewer directory excludes private prompt configuration');
  check((await http('/api/studio/agents/' + developer.id, 'GET', undefined, 'viewer')).status === 403, 'viewer cannot read private configuration versions');
  for (const [method, path, body] of [
    ['POST', '/api/studio/tests', { agentRef: { id: developer.id, revision: 1 }, input: {} }],
    ['PUT', '/api/studio/agents/' + developer.id + '/draft', developer.draft],
    ['PATCH', '/api/studio/agents/' + developer.id, { enabled: false }],
    ['DELETE', '/api/studio/agents/' + developer.id, undefined]
  ] as const) {
    check((await http(path, method, body, 'viewer')).status === 403, `viewer cannot ${method} Studio resources`);
    check((await http(path, method, body, 'operator', { Origin: 'https://evil.example' })).status === 403, `cross-origin ${method} is rejected`);
  }
  const defResponse = await http('/api/studio/agents/' + developer.id);
  check(!!defResponse.headers.get('etag'), 'definition reads expose a concurrency ETag');
  check((await http('/api/studio/agents/' + developer.id + '/draft', 'PUT', developer.draft)).status === 428, 'HTTP saves require If-Match');
  const body = { agentRef: { id: developer.id, revision: 1 }, input: {} };
  const start = await http('/api/studio/tests', 'POST', body, 'operator', { 'Idempotency-Key': 'same-request' });
  const started = await start.json();
  const duplicate = await (await http('/api/studio/tests', 'POST', body, 'operator', { 'Idempotency-Key': 'same-request' })).json();
  check(start.status === 202 && started.runId === duplicate.runId, 'duplicate submission returns the same admitted run');
  check((await http('/api/studio/tests', 'POST', { ...body, input: { changed: true } }, 'operator', { 'Idempotency-Key': 'same-request' })).status === 409, 'idempotency key collision is explicit');
  const publicRun = await (await http('/api/runs/' + started.runId, 'GET', undefined, 'viewer')).json();
  check(publicRun.design.agents[0].revision === 1 && !publicRun.definitions && !JSON.stringify(publicRun).includes('DEVELOPER-V1'), 'public run DTO exposes version lineage without private instructions');
  check((await http('/api/studio/runs/' + started.runId, 'GET', undefined, 'viewer')).status === 403, 'private execution snapshot requires operator');
  const snapshot = await (await http('/api/studio/runs/' + started.runId)).json();
  check(snapshot.definitions.agents[0].config.systemPrompt === 'DEVELOPER-V1', 'operator can trace execution to full fixed configuration');
  check(!(await (await http('/api/studio/catalog')).text()).includes(secret), 'model catalog never returns API keys');
  check((await http('/studio/agents')).status === 200 && (await http('/teams')).status === 200, 'Agent and team management pages are reachable');
  await server.stop(); server = undefined; await orchestrator.close();
  const stateFile = join(directory, 'studio', 'state.json');
  check(!readFileSync(join(directory, 'state.json'), 'utf8').includes(secret), 'persisted run evidence does not contain provider API key');
  orchestrator = new Orchestrator({ dataDir: directory, llm: { provider, apiKey: secret } });
  check(orchestrator.studio.catalog.get('agents', developer.id).revisions.length === 2 && orchestrator.studio.catalog.get('teams', team.id).revisions[0].config.members[0].agentRef.revision === 1, 'definition revisions and team references survive restart');
  check(orchestrator.getRun(started.runId)?.requestKey?.key === 'same-request' && orchestrator.getRun(teamRun.runId)?.attempts?.length === 2, 'idempotency identity and actual execution evidence survive restart');
  const savedSystem = orchestrator.studio.catalog.get('agents', system.id);
  await orchestrator.close();
  provider.model = 'fixture-v2';
  orchestrator = new Orchestrator({ dataDir: directory, llm: { provider, apiKey: secret } });
  const refreshedSystem = orchestrator.studio.catalog.get('agents', system.id);
  check(refreshedSystem.revisions.length === savedSystem.revisions.length + 1 && refreshedSystem.revisions[0].hash === savedSystem.revisions[0].hash &&
    refreshedSystem.draft.modelConfigRef.revision === orchestrator.studio.model.ref.revision, 'model changes create fresh system template revisions while retaining history');
  check(orchestrator.studio.catalog.get('teams', 'default-team').revisions.at(-1)!.config.members[0].agentRef.revision === refreshedSystem.revisions.length, 'system team template binds refreshed system Agent versions');
  fails(() => orchestrator.runStudio(request(developer.id)), 'MODEL_REVISION_UNAVAILABLE');
  const beforeSave = orchestrator.studio.catalog.get('agents', tester.id);
  orchestrator.studio.catalog.close();
  fails(() => orchestrator.studio.catalog.mutate('agents', tester.id, beforeSave.etag, 'status', { enabled: false }, 'operator'), 'STORAGE_FAILED');
  check(orchestrator.studio.catalog.get('agents', tester.id).etag === beforeSave.etag, 'failed durable save does not change in-memory state');
  await orchestrator.close();
  const preserved = readFileSync(stateFile, 'utf8');
  writeFileSync(stateFile, '{invalid');
  assert.throws(() => new Orchestrator({ dataDir: directory }), /storage could not be loaded/);
  check(readFileSync(stateFile, 'utf8') === '{invalid' && !existsSync(join(directory, 'owner.lock')) && !existsSync(join(directory, 'studio', 'owner.lock')), 'corrupt catalog is preserved and both ownership locks are released');
  writeFileSync(stateFile, preserved);
  console.log(`\nALL ${checks} STUDIO CHECKS PASSED (injected model; no external model call)\n`);
} finally {
  await server?.stop(); await orchestrator.close();
  // Only this test-created temporary directory is removed.
  assert.ok(directory.startsWith(join(tmpdir(), 'aether-studio-test-')));
  rmSync(directory, { recursive: true, force: true });
}
