import {
  closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync,
  renameSync, unlinkSync, writeFileSync
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import type { RunSnapshot } from '../orchestrator.js';
import type { OrchestratorEvent } from '../types/index.js';

export interface StoredRuns {
  version: 1;
  runs: RunSnapshot[];
  events: Record<string, OrchestratorEvent[]>;
}

const statuses = new Set(['pending', 'running', 'paused', 'completed', 'failed', 'needs_human', 'skipped']);

export class RunStore {
  private readonly file: string;
  private readonly lock: string;
  private readonly owner = { pid: process.pid, token: randomUUID() };
  private closed = false;

  constructor(directory: string) {
    const root = resolve(directory);
    mkdirSync(root, { recursive: true, mode: 0o700 });
    this.file = join(root, 'state.json');
    this.lock = join(root, 'owner.lock');
    if (existsSync(this.lock)) {
      const owner = JSON.parse(readFileSync(this.lock, 'utf8'));
      if (!Number.isSafeInteger(owner.pid) || owner.pid < 1) throw new Error('Invalid run storage owner.');
      let running = true;
      try {
        process.kill(owner.pid, 0);
      } catch (error: any) {
        if (error.code === 'ESRCH') running = false;
        else throw error;
      }
      if (running) throw new Error('Run storage is already open in another service.');
      unlinkSync(this.lock);
    }
    writeFileSync(this.lock, JSON.stringify(this.owner), { flag: 'wx', mode: 0o600 });
  }

  public load(): StoredRuns {
    if (!existsSync(this.file)) return { version: 1, runs: [], events: {} };
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8'));
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

  public save(data: StoredRuns): void {
    if (this.closed) throw new Error('Run storage is closed.');
    const temp = this.file + '.' + randomUUID() + '.tmp';
    let descriptor: number | undefined;
    try {
      // shortcut: synchronous whole-file snapshots suit a single local service; use a journal for large histories.
      descriptor = openSync(temp, 'wx', 0o600);
      writeFileSync(descriptor, JSON.stringify(data));
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = undefined;
      renameSync(temp, this.file);
    } catch (cause) {
      throw new Error('Run evidence could not be saved.', { cause });
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
      if (existsSync(temp)) unlinkSync(temp);
    }
  }

  public close(): void {
    if (this.closed) return;
    const owner = JSON.parse(readFileSync(this.lock, 'utf8'));
    if (owner.token !== this.owner.token) throw new Error('Run storage ownership changed.');
    unlinkSync(this.lock);
    this.closed = true;
  }
}
