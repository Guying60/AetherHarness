import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { AgentRegistry } from '../dist/src/agent/agent-registry.js';
import { createProviderFromConfig, extractJson, isLlmConfigured, resolveLlmConfig } from '../dist/src/agent/llm/index.js';
import { TTL_CACHE_BASELINE, TTL_CACHE_GOAL, TTL_CACHE_REFERENCE, TTL_CACHE_TESTS } from '../dist/src/scenarios/ttl-cache.js';
import { SelfLoopEngine } from '../dist/src/selfloop/self-loop-engine.js';
import { containerTestRunner } from '../dist/src/tools/container-runner.js';
import { runTests } from '../dist/src/tools/test-runner.js';
import { ToolRegistry } from '../dist/src/tools/tool-registry.js';
import { VerificationEngine } from '../dist/src/verification/verification-engine.js';

const cases = [
  { id: 'expiry-boundary', source: TTL_CACHE_BASELINE },
  { id: 'overwrite-deadline', source: TTL_CACHE_REFERENCE.replace('now + ttl', 'entries.get(key)?.expiresAt ?? now + ttl') },
  { id: 'remaining-time', source: TTL_CACHE_REFERENCE.replace('now + ttl', 'ttl') }
];
const goal = TTL_CACHE_GOAL;
const maxRounds = 3;
const roundCompletionLimit = 400;
const completionBudget = maxRounds * roundCompletionLimit;
const fixture = process.argv.includes('--fixture');
const repeatArg = process.argv.find(arg => arg.startsWith('--repeats='));
const repeats = repeatArg ? Number(repeatArg.slice('--repeats='.length)) : 1;
if (process.argv.slice(2).some(arg => arg !== '--fixture' && arg !== repeatArg) ||
    !Number.isInteger(repeats) || repeats < 1 || repeats > 10) {
  throw new Error('Usage: node scripts/benchmark-repair.mjs [--fixture] [--repeats=1..10]');
}

const runnerImage = process.env.AETHER_RUNNER_IMAGE;
const config = resolveLlmConfig({ maxRetries: 0, fallbackToOffline: false });
let provider;
if (!fixture) {
  if (!isLlmConfigured(config)) throw new Error('Configure an authorized model endpoint using the project Live settings.');
  if (!runnerImage || !/^sha256:[a-f0-9]{64}$/.test(runnerImage)) {
    throw new Error('AETHER_RUNNER_IMAGE must contain the full ID of the local Node container image.');
  }
  execFileSync('docker', ['image', 'inspect', runnerImage], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 10000 });
  provider = createProviderFromConfig(config);
}

const tools = new ToolRegistry();
tools.register(fixture ? {
  id: 'fixture_test_runner', name: 'Fixture tests', description: 'Executes only the built-in benchmark fixtures.',
  parameters: { type: 'object', properties: {} },
  handler: input => runTests({ ...input, timeoutMs: 1000 })
} : containerTestRunner(runnerImage));
const agents = new AgentRegistry(tools);
const verification = new VerificationEngine(agents, tools);
const loop = new SelfLoopEngine(agents, verification);
const spec = {
  rules: [], confidenceThreshold: 1,
  executableSandboxCheck: {
    toolId: fixture ? 'fixture_test_runner' : 'container_test_runner',
    testScriptGenerator: () => TTL_CACHE_TESTS, bindings: ['createCache'], timeoutMs: 12000
  }
};

function digest(code) {
  return createHash('sha256').update(code).digest('hex');
}

function evidence(result) {
  return {
    passed: result.passed,
    failedRuleIds: result.failedRuleIds ?? [],
    assertionsPassed: result.sandboxTestResult?.passedCount ?? 0,
    assertionsTotal: result.sandboxTestResult?.totalCount ?? 0
  };
}

async function measure(testCase, policy) {
  const start = performance.now();
  const signal = AbortSignal.timeout(240000);
  const attempts = [];
  const usage = { promptTokens: 0, completionTokens: 0, calls: 0 };
  let stage = 'verification';
  const execute = async (input, _round, guidance, failedRules) => {
    let code = testCase.source;
    if (fixture && failedRules?.some(rule => rule.id?.startsWith('TTL-'))) code = TTL_CACHE_REFERENCE;
    if (provider) {
      stage = 'model';
      usage.calls++;
      const feedback = guidance ? { previous: input.previousAttempt?.code, failedRules, guidance } : {};
      const modelResult = await provider.chat([
        { role: 'system', content: 'Return JSON with a single property "code" containing the complete standalone JavaScript function.' },
        { role: 'user', content: JSON.stringify({ goal, source: testCase.source, ...feedback }) }
      ], { maxTokens: policy === 'oneShot' ? completionBudget : roundCompletionLimit, temperature: 0, signal });
      usage.promptTokens += modelResult.usage.promptTokens;
      usage.completionTokens += modelResult.usage.completionTokens;
      stage = 'model-output';
      code = extractJson(modelResult.content).code;
      if (typeof code !== 'string' || code.trim() === '') throw new Error('The model returned no JavaScript candidate.');
    }
    stage = 'verification';
    return { code };
  };
  const record = (iteration, output, verificationResult, feedback) =>
    attempts.push({ iteration, ...evidence(verificationResult), sha256: digest(output.code), feedback });
  const seed = { goal };
  let interrupted;
  try {
    if (policy === 'oneShot') {
      const candidate = await execute(seed, 1);
      record(1, candidate, await verification.verify(candidate, spec, seed, { signal }));
    } else {
      await loop.runLoop({
        maxIterations: maxRounds, targetNodeId: 'generate', verificationNodeId: 'verify',
        criticAgentId: 'automatic-diagnostic', convergenceThreshold: 1
      }, spec, seed, execute, {
        signal, onIteration: attempt => record(attempt.iteration, attempt.output, attempt.verification, attempt.criticFeedback)
      });
    }
  } catch (error) {
    if (fixture) throw error;
    interrupted = { stage, timeout: signal.aborted, status: error?.status || undefined };
  }
  return { caseId: testCase.id, accepted: attempts.some(attempt => attempt.passed),
    durationMs: Math.round(performance.now() - start), usage, attempts, interrupted };
}

const baselines = [];
for (const testCase of cases) {
  const baseline = evidence(await verification.verify(testCase.source, spec, { goal }));
  if (baseline.passed || !baseline.failedRuleIds.length) throw new Error(`Unexpected baseline result for ${testCase.id}`);
  baselines.push({ id: testCase.id, sha256: digest(testCase.source), ...baseline });
}
const samples = { oneShot: [], feedbackLoop: [] };
for (let repeat = 0; repeat < repeats; repeat++) {
  for (const [index, testCase] of cases.entries()) {
    const policies = (repeat + index) % 2 ? ['feedbackLoop', 'oneShot'] : ['oneShot', 'feedbackLoop'];
    for (const policy of policies) samples[policy].push(await measure(testCase, policy));
  }
}
const summaries = Object.fromEntries(Object.entries(samples).map(([policy, runs]) => {
  const accepted = runs.filter(run => run.accepted).length;
  const interrupted = runs.filter(run => run.interrupted).length;
  const totalTokens = runs.reduce((sum, run) => sum + run.usage.promptTokens + run.usage.completionTokens, 0);
  return [policy, {
    runs: runs.length, accepted, rejectedByAcceptance: runs.length - accepted - interrupted, interrupted,
    totalTokens, tokensPerAcceptedRun: accepted && provider ? Math.round(totalTokens / accepted) : null, samples: runs
  }];
}));
console.log(JSON.stringify({
  mode: fixture ? 'scripted fixture; plumbing check only' : 'live model; no fallback; fixed Docker tests',
  model: provider?.model ?? null, runnerImage: fixture ? null : runnerImage,
  repeats, maxRounds, completionBudget, runtime: process.version, baselines, summaries
}, null, 2));
