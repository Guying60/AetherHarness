import { JsonStore } from './json-store.js';
import type { RunSnapshot } from '../orchestrator.js';
import type { OrchestratorEvent } from '../types/index.js';

export interface StoredRuns {
  version: 1;
  runs: RunSnapshot[];
  events: Record<string, OrchestratorEvent[]>;
}

const statuses = new Set(['pending', 'running', 'paused', 'cancelling', 'cancelled', 'completed', 'failed', 'needs_human', 'skipped']);

export class RunStore {
  private readonly storage: JsonStore;
  constructor(directory: string) { this.storage = new JsonStore(directory); }
  public load(): StoredRuns {
    try {
      const data = this.storage.read<StoredRuns>({ version: 1, runs: [], events: {} });
      if (data.version !== 1 || !Array.isArray(data.runs) || !data.events || typeof data.events !== 'object' || Array.isArray(data.events)) {
        throw new Error('Unsupported run storage format.');
      }
      const ids = new Set<string>();
      for (const run of data.runs) {
        if (!run || !/^run-\d+$/.test(run.runId) || !Number.isSafeInteger(Number(run.runId.slice(4))) || ids.has(run.runId) ||
          typeof run.taskId !== 'string' || typeof run.title !== 'string' ||
          !statuses.has(run.status) || !Number.isFinite(run.startedAt) ||
          !run.workflow || !Array.isArray(run.workflow.nodes) || !Array.isArray(run.workflow.edges) ||
          (run.status === 'needs_human' && !run.escalation)) throw new Error('Invalid stored run.');
        ids.add(run.runId);
      }
      for (const [runId, events] of Object.entries(data.events)) {
        if (!Array.isArray(events) || events.some(event =>
          !event || event.runId !== runId || !Number.isFinite(event.at) ||
          typeof event.kind !== 'string' || typeof event.message !== 'string' ||
          (event.id !== undefined && (typeof event.id !== 'string' || !/^[0-9a-f-]{36}$/.test(event.id)))
        )) throw new Error('Invalid stored events.');
      }
      return data;
    } catch (cause) {
      throw new Error('Run storage could not be loaded. The stored file has been preserved.', { cause });
    }
  }

  public save(data: StoredRuns): void { this.storage.save(data); }
  public close(): void { this.storage.close(); }
}
