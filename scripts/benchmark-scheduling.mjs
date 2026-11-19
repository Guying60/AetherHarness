import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { AgentRegistry } from '../dist/src/agent/agent-registry.js';
import { DynamicScheduler } from '../dist/src/scheduler/dynamic-scheduler.js';
import { ToolRegistry } from '../dist/src/tools/tool-registry.js';

const agents = {
  developer: { development: 1 },
  reviewer: { review: 1, development: 0.6 },
  generalist: { testing: 1, development: 0.7, review: 0.6 }
};
const primary = { development: 'developer', review: 'reviewer', testing: 'generalist' };
const workloads = {
  balanced: ['development', 'review', 'testing', 'development', 'review', 'testing',
    'development', 'review', 'testing', 'development', 'review', 'testing'],
  developmentBurst: ['development', 'development', 'development', 'development', 'development',
    'development', 'development', 'development', 'review', 'testing', 'development', 'review']
};
const durations = [100, 20, 32, 55, 31, 26, 76, 45, 24, 65, 22, 50];
const urgent = new Set([4, 8, 10]);
const batches = 5;
const options = { pollIntervalMs: 2, agingIntervalMs: 80, maxRetries: 0, maxWaitMs: 5000 };

// Keep the production queue, dependency and capacity handling in both arms.
class FifoScheduler extends DynamicScheduler {
  effectivePriority() { return 5; }
}

function percentile(values, fraction) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.ceil(ordered.length * fraction) - 1];
}

async function measure(jobs, policy) {
  const registry = new AgentRegistry(new ToolRegistry());
  for (const [id, capabilities] of Object.entries(agents)) {
    registry.register({ id, name: id, role: 'developer', description: '', systemPrompt: '',
      capabilities, toolIds: [], maxConcurrency: 1, currentLoad: 0, totalTokensUsed: 0, version: '1' });
  }
  const Scheduler = policy === 'fifoFixed' ? FifoScheduler : DynamicScheduler;
  const scheduler = new Scheduler(registry, options);
  const start = performance.now();
  const queued = jobs.map(job => {
    const routing = policy === 'fifoFixed'
      ? { agentId: primary[job.capability] }
      : { agentCapability: job.capability };
    return scheduler.enqueue({ id: job.id, name: job.id, type: 'agent', ...routing }, 'benchmark', 'batch', job.priority);
  });
  const dispatches = await Promise.all(queued.map(async (queuedTask, index) => {
    const job = jobs[index];
    const { agent, task } = await scheduler.acquire(queuedTask.id);
    const startedAt = task.startedAt;
    try {
      await sleep(job.durationMs);
      scheduler.release(task.id, true);
    } catch (error) {
      scheduler.release(task.id, false, error.message);
      throw error;
    }
    return {
      id: job.id, agentId: agent.id, priority: scheduler.effectivePriority(task, startedAt),
      queueWaitMs: startedAt - task.submittedAt, finishedAfterMs: Math.round(performance.now() - start)
    };
  }));
  return { durationMs: Math.round(performance.now() - start), dispatches };
}

function summarize(jobs, samples) {
  const dispatches = samples.flatMap(sample => sample.dispatches);
  const jobsById = new Map(jobs.map(job => [job.id, job]));
  const urgentDispatches = dispatches.filter(dispatch => jobsById.get(dispatch.id).priority === 9);
  return {
    completed: dispatches.length,
    jobsPerSecond: Number((1000 * dispatches.length / samples.reduce((sum, sample) => sum + sample.durationMs, 0)).toFixed(2)),
    batchMedianMs: percentile(samples.map(sample => sample.durationMs), 0.5),
    queueP95Ms: percentile(dispatches.map(dispatch => dispatch.queueWaitMs), 0.95),
    urgentQueueP95Ms: percentile(urgentDispatches.map(dispatch => dispatch.queueWaitMs), 0.95),
    routedAwayFromPrimary: dispatches.filter(dispatch =>
      dispatch.agentId !== primary[jobsById.get(dispatch.id).capability]).length,
    samples
  };
}

const comparisons = {};
for (const [name, capabilities] of Object.entries(workloads)) {
  const jobs = capabilities.map((capability, index) => ({
    id: `${name}-${index + 1}`, capability, durationMs: durations[index], priority: urgent.has(index) ? 9 : 5
  }));
  const samples = { fifoFixed: [], dynamic: [] };
  for (let batch = 0; batch < batches; batch++) {
    const policies = batch % 2 ? ['dynamic', 'fifoFixed'] : ['fifoFixed', 'dynamic'];
    for (const policy of policies) samples[policy].push(await measure(jobs, policy));
  }
  comparisons[name] = { jobs, ...Object.fromEntries(Object.entries(samples).map(([policy, runs]) =>
    [policy, summarize(jobs, runs)])) };
}
console.log(JSON.stringify({
  mode: 'simulated job durations; production scheduler and capacity accounting',
  runtime: process.version, platform: process.platform, batches, maxParallelJobs: 3, agents, primary, options, comparisons
}, null, 2));
