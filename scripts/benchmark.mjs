import { performance } from 'node:perf_hooks';
import { Orchestrator } from '../dist/src/orchestrator.js';

const batches = 5;
const results = { serial: [], concurrent: [] };

for (let batch = 0; batch < batches; batch++) {
  const order = batch % 2 ? ['concurrent', 'serial'] : ['serial', 'concurrent'];
  for (const strategy of order) {
    const concurrency = strategy === 'serial' ? 1 : 3;
    const orchestrator = new Orchestrator({ maxConcurrentRuns: concurrency });
    try {
      const tasks = orchestrator.getTasks();
      const start = performance.now();
      const runs = await orchestrator.runAll(tasks, { concurrency });
      const durationMs = Math.round(performance.now() - start);
      results[strategy].push({
        durationMs,
        scheduler: orchestrator.scheduler.getStats(),
        runs: runs.map(run => ({
          taskId: run.taskId,
          status: run.status,
          accepted: run.verification?.passed === true,
          durationMs: run.finishedAt - run.startedAt,
          failureRules: run.verification?.failedRuleIds ?? []
        }))
      });
    } finally {
      await orchestrator.close();
    }
  }
}

const strategies = Object.fromEntries(Object.entries(results).map(([strategy, samples]) => {
  const durations = samples.map(sample => sample.durationMs).sort((a, b) => a - b);
  const runs = samples.flatMap(sample => sample.runs);
  const latencies = runs.map(run => run.durationMs).sort((a, b) => a - b);
  const accepted = runs.filter(run => run.accepted).length;
  const totalMs = durations.reduce((sum, duration) => sum + duration, 0);
  return [strategy, {
    batches, totalRuns: runs.length, accepted, deliveryRate: accepted / runs.length,
    runsPerSecond: Number((1000 * runs.length / totalMs).toFixed(2)),
    batchMedianMs: durations[Math.floor(durations.length / 2)],
    runMedianMs: latencies[Math.floor(latencies.length / 2)],
    runP95Ms: latencies[Math.ceil(latencies.length * 0.95) - 1],
    maximumSchedulerWaitMs: Math.max(...samples.map(sample => sample.scheduler.maxObservedWaitMs)),
    outcomes: Object.fromEntries(['completed', 'needs_human', 'failed'].map(status => [
      status, runs.filter(run => run.status === status).length
    ])),
    samples
  }];
}));

console.log(JSON.stringify({
  runtime: process.version,
  platform: process.platform,
  workload: 'same three rate-limiter scenarios, deterministic brains, identical workflow budgets',
  strategies
}, null, 2));
