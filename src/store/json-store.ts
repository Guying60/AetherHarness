import {
  closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync,
  renameSync, unlinkSync, writeFileSync
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';

export class JsonStore {
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

  public read<T>(fallback: T): T {
    return existsSync(this.file) ? JSON.parse(readFileSync(this.file, 'utf8')) as T : fallback;
  }

  public save(data: unknown): void {
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
