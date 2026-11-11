/**
 * AetherHarness / DSH-Orchestrator — Web 服务器。
 *
 * 轻量级、零外部依赖的 HTTP + Server-Sent Events (SSE) 服务端，
 * 负责分发 SPA 控制台静态页面并提供任务调度与人在回路决策控制 REST API。
 */
import { createServer, IncomingMessage, ServerResponse, Server } from 'node:http';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { Orchestrator, RunSnapshot } from '../orchestrator.js';
import { DASHBOARD_HTML } from './client.js';
import { LlmConfig } from '../agent/llm/index.js';
import { OrchestratorEvent } from '../types/index.js';
import {
  MAX_REPOSITORY_GOAL, REPOSITORY_PROJECT_ID, repositoryConfig, type RepositoryConfig
} from '../scenarios/repository-repair.js';

export interface WebServerOptions {
  port?: number;
  host?: string;
  orchestrator?: Orchestrator;
  llm?: LlmConfig;
  project?: RepositoryConfig;
  dataDir?: string;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

function runDetail({ state, ...detail }: RunSnapshot) {
  return detail;
}

function eventFrame(event: OrchestratorEvent, scoped: boolean): string {
  const cursor = scoped && event.id ? `id: ${event.id}\n` : '';
  return `${cursor}data: ${JSON.stringify(event)}\n\n`;
}

export class WebServer {
  public readonly orchestrator: Orchestrator;
  public readonly port: number;
  public readonly host: string;
  private server?: Server;
  private readonly sseClients = new Map<ServerResponse, string | undefined>();
  private unsubscribe?: () => void;
  private readonly ownsOrchestrator: boolean;

  constructor(options: WebServerOptions = {}) {
    this.port = options.port ?? (Number(process.env.AETHER_PORT) || 3300);
    this.host = options.host ?? '127.0.0.1';
    this.ownsOrchestrator = !options.orchestrator;
    this.orchestrator = options.orchestrator ?? new Orchestrator({
      llm: options.llm, project: options.project, dataDir: options.dataDir
    });
  }

  public async start(): Promise<{ port: number; host: string; url: string }> {
    const hostname = this.host === '::1' ? '[::1]' : this.host;
    try {
      if (!LOOPBACK_HOSTS.has(hostname)) throw new Error('The Web console requires a loopback address.');
      return await new Promise((resolve, reject) => {
        this.server = createServer((req, res) => this.handleRequest(req, res));
        this.server.on('error', reject);
        this.server.listen(this.port, this.host, () => {
          this.unsubscribe ??= this.orchestrator.subscribe(event => this.broadcastSse(event));
          const address = this.server?.address();
          const actualPort = typeof address === 'object' && address ? address.port : this.port;
          const url = `http://${hostname}:${actualPort}`;
          resolve({ port: actualPort, host: this.host, url });
        });
      });
    } catch (error) {
      this.server = undefined;
      if (this.ownsOrchestrator && this.orchestrator.hasPersistentStorage()) await this.orchestrator.close();
      throw error;
    }
  }

  public async stop(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    for (const client of this.sseClients.keys()) {
      try {
        client.end();
      } catch {
        /* ignore */
      }
    }
    this.sseClients.clear();

    if (this.server) {
      await new Promise<void>((resolve, reject) => {
        this.server!.close(err => (err ? reject(err) : resolve()));
      });
      this.server = undefined;
    }
    if (this.ownsOrchestrator && this.orchestrator.hasPersistentStorage()) await this.orchestrator.close();
  }

  private broadcastSse(event: OrchestratorEvent): void {
    for (const [client, runId] of this.sseClients) {
      if (runId !== undefined && runId !== event.runId) continue;
      try {
        client.write(eventFrame(event, runId !== undefined));
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  private openEvents(req: IncomingMessage, res: ServerResponse, runId?: string): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write('retry: 3000\n\n');
    if (runId) {
      const history = this.orchestrator.getEvents(runId);
      const cursor = req.headers['last-event-id'];
      const index = typeof cursor === 'string' && cursor ? history.findIndex(event => event.id === cursor) : -1;
      if (cursor && index < 0) res.write('id:\nevent: reset\ndata: {}\n\n');
      for (const event of history.slice(index + 1)) res.write(eventFrame(event, true));
    }
    this.sseClients.set(res, runId);
    res.on('close', () => this.sseClients.delete(res));
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathname = url.pathname;
    const method = req.method?.toUpperCase() ?? 'GET';

    const origin = req.headers.origin;
    const host = req.headers.host;
    if (!host || !LOOPBACK_HOSTS.has(host.replace(/:\d+$/, ''))) {
      this.json(res, 403, { error: '请使用本机控制台地址。' });
      return;
    }
    if (method === 'POST' && origin && origin !== `http://${host}` && origin !== `https://${host}`) {
      this.json(res, 403, { error: '请从控制台页面提交此操作。' });
      return;
    }

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // 1. Dashboard UI
      const runPage = /^\/runs\/(run-\d+)$/.exec(pathname)?.[1];
      if (method === 'GET' && (pathname === '/' || pathname === '/index.html' || runPage)) {
        res.writeHead(runPage && !this.orchestrator.getRun(runPage) ? 404 : 200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache'
        });
        res.end(DASHBOARD_HTML);
        return;
      }

      // 2. Server-Sent Events (SSE) stream
      if (method === 'GET' && pathname === '/api/events') {
        this.openEvents(req, res);
        return;
      }
      const eventRunId = /^\/api\/runs\/(run-\d+)\/events$/.exec(pathname)?.[1];
      if (method === 'GET' && eventRunId) {
        if (!this.orchestrator.getRun(eventRunId)) {
          this.json(res, 404, { error: '所选运行不存在。' });
          return;
        }
        this.openEvents(req, res, eventRunId);
        return;
      }

      if (method === 'GET' && pathname === '/api/dashboard') {
        const { agents, runs, scheduler, pending, tools, llm, knowledgeChunks } = this.orchestrator.getSnapshot();
        const requested = url.searchParams.get('runId');
        const selected = requested === null ? runs.at(-1) : this.orchestrator.getRun(requested);
        const tasks = this.orchestrator.getTasks().map(task => ({
          id: task.id,
          title: task.title,
          description: task.description,
          prompt: task.prompt,
          difficulty: task.difficulty,
          workflow: task.buildWorkflow({ verificationSpec: task.verificationSpec })
        }));
        this.json(res, 200, {
          tasks, scheduler, tools, llm, knowledgeChunks, settings: this.orchestrator.getSettings(),
          repository: this.orchestrator.getProject(),
          persistentStorage: this.orchestrator.hasPersistentStorage(),
          agents: agents.map(agent => {
            const profile = this.orchestrator.agents.get(agent.id)!.profile;
            return { ...agent, version: profile.version, toolIds: profile.toolIds, capabilities: profile.capabilities };
          }),
          pending: pending.map(({ runId, node, basePriority, effectivePriority, submittedAt }) => ({
            runId, nodeId: node.id, basePriority, effectivePriority, submittedAt
          })),
          optimizations: this.orchestrator.getPromptOptimizations().slice(-12),
          runs: runs.map(({ runId, taskId, status, startedAt, finishedAt, humanDecision, retryOf }) => ({
            runId, taskId, status, startedAt, finishedAt, humanDecision, retryOf
          })),
          run: selected ? runDetail(selected) : null,
          events: selected ? this.orchestrator.getEvents(selected.runId) : []
        });
        return;
      }

      // 3. API: Status & Overview
      if (method === 'GET' && pathname === '/api/status') {
        const runs = this.orchestrator.getRuns().map(runDetail);
        const agents = this.agentViews();
        const llm = this.orchestrator.getLlmInfo();
        const tools = this.orchestrator.getToolReliability();
        this.json(res, 200, {
          status: 'ok',
          runs,
          agents,
          llm,
          tools
        });
        return;
      }

      // 4. API: Agents List
      if (method === 'GET' && pathname === '/api/agents') {
        this.json(res, 200, this.agentViews());
        return;
      }

      const agentId = /^\/api\/agents\/([\w-]+)\/history$/.exec(pathname)?.[1];
      if (method === 'GET' && agentId) {
        if (!this.orchestrator.agents.get(agentId)) {
          this.json(res, 404, { error: '所选 Agent 不存在。' });
          return;
        }
        const versions = this.orchestrator.agents.getVersionHistory(agentId).map(({ version, toolIds, maxConcurrency }) =>
          ({ version, toolIds, maxConcurrency }));
        const activity = [];
        for (const run of this.orchestrator.getRuns().reverse()) {
          const dispatches = this.orchestrator.getEvents(run.runId)
            .filter(event => event.kind === 'scheduler' && event.data?.agentId === agentId);
          const reviews = (run.loopRounds ?? []).flatMap(round => [
            ...(round.criticAgentId === agentId ? [{ iteration: round.iteration, role: 'critic' }] : []),
            ...(round.verification.auditorReviews ?? []).filter(review => review.agentId === agentId)
              .map(review => ({ iteration: round.iteration, role: 'audit', approved: review.approved }))
          ]);
          if (!dispatches.length && !reviews.length) continue;
          activity.push({ runId: run.runId, title: run.title, dispatches: dispatches.map(event => ({
            at: event.at, nodeId: event.data?.nodeId, priority: event.data?.priority, waitMs: event.data?.wait
          })), reviews });
          if (activity.length === 10) break;
        }
        this.json(res, 200, { versions, activity });
        return;
      }

      const reportId = /^\/api\/runs\/(run-\d+)\/report$/.exec(pathname)?.[1];
      if (method === 'GET' && reportId) {
        const run = this.orchestrator.getRun(reportId);
        if (!run) {
          this.json(res, 404, { error: '所选运行不存在。' });
          return;
        }
        const { artifact, patch, workflow, ...evidence } = runDetail(run);
        const release = run.status === 'completed' && run.verification?.passed && !run.humanDecision;
        const report = {
          schemaVersion: 1,
          ...evidence,
          workflow: { id: workflow.id, version: workflow.version, timeoutMs: workflow.timeoutMs },
          verdict: run.verification ? run.verification.passed ? 'passed' : 'blocked' : 'unknown',
          delivery: {
            status: !patch?.patch ? 'unavailable' : release ? 'verified' : 'draft',
            filePath: patch?.filePath,
            sha256: patch?.patch ? createHash('sha256').update(patch.patch).digest('hex') : undefined
          },
          events: this.orchestrator.getEvents(reportId)
        };
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
          'Content-Disposition': `attachment; filename="${reportId}-report.json"` });
        res.end(JSON.stringify(report, null, 2) + '\n');
        return;
      }

      // 5. API: Runs List
      if (method === 'GET' && pathname === '/api/runs') {
        this.json(res, 200, this.orchestrator.getRuns().map(runDetail));
        return;
      }

      // 6. API: Specific Run
      if (method === 'GET' && pathname?.startsWith('/api/runs/')) {
        const runId = pathname.replace('/api/runs/', '').trim();
        const run = this.orchestrator.getRun(runId);
        if (!run) {
          this.json(res, 404, { error: `Run '${runId}' not found` });
          return;
        }
        this.json(res, 200, runDetail(run));
        return;
      }

      if (method === 'POST' && pathname === '/api/runs') {
        const { projectId, goal } = await this.readJsonBody(req);
        if (projectId !== REPOSITORY_PROJECT_ID) {
          this.json(res, 404, { error: '所选仓库未获授权。' });
          return;
        }
        if (typeof goal !== 'string' || !goal.trim() || goal.trim().length > MAX_REPOSITORY_GOAL) {
          this.json(res, 400, { error: `请输入 1–${MAX_REPOSITORY_GOAL} 字符的任务描述。` });
          return;
        }
        const project = this.orchestrator.getProject();
        if (!project.ready) {
          this.json(res, 503, { error: project.reason });
          return;
        }
        let runId: string | undefined;
        this.orchestrator.runProjectTask(goal, id => { runId = id; }).catch(() => {});
        this.json(res, runId ? 202 : 500, runId ? { runId } : { error: '无法创建仓库运行。' });
        return;
      }

      // 7. API: Trigger Run Task
      if (method === 'POST' && pathname === '/api/tasks/run') {
        const body = await this.readJsonBody(req);
        const taskId = body.taskId ?? 'all';

        const allTasks = this.orchestrator.getTasks();

        if (taskId === 'all') {
          // Trigger all tasks asynchronously so the client gets an immediate response
          this.orchestrator.runAll(allTasks).catch(err => {
            console.error('Task runAll error:', err);
          });
          this.json(res, 200, { success: true, message: 'All tasks dispatched in background' });
          return;
        }

        const task = allTasks.find(t => t.id === taskId);
        if (!task) {
          this.json(res, 400, {
            error: `Unknown task '${taskId}'. Available: all, ${allTasks.map(t => t.id).join(', ')}`
          });
          return;
        }

        let runId: string | undefined;
        this.orchestrator.runTask(task, { onStart: id => { runId = id; } }).catch(err => {
          console.error(`Task ${taskId} error:`, err);
        });
        this.json(res, 200, { success: true, taskId: task.id, runId, message: `Task ${task.id} started` });
        return;
      }

      // 8. API: Resolve Escalation
      if (method === 'POST' && pathname?.match(/^\/api\/runs\/([^/]+)\/escalate$/)) {
        const match = pathname.match(/^\/api\/runs\/([^/]+)\/escalate$/);
        const runId = match![1];
        const body = await this.readJsonBody(req);
        const optionIndex = body.optionIndex;
        const reason = body.reason;
        if (reason !== undefined && (typeof reason !== 'string' || reason.length > 500)) {
          this.json(res, 400, { error: '决策备注最多 500 字符。' });
          return;
        }

        const run = this.orchestrator.getRun(runId);
        if (!run) {
          this.json(res, 404, { error: `Run '${runId}' not found` });
          return;
        }

        if (!run.escalation) {
          this.json(res, 409, { error: '此运行已没有待处理的人工决策。' });
          return;
        }
        if (typeof optionIndex !== 'number' || !Number.isInteger(optionIndex) || !run.escalation.options[optionIndex]) {
          this.json(res, 400, { error: '请选择卡片中的有效决策。' });
          return;
        }
        if (optionIndex === 0 && run.retryAvailable === false) {
          this.json(res, 409, { error: '当前服务的任务配置与该历史运行不匹配，请重新配置后重试。' });
          return;
        }
        const updated = await this.orchestrator.resolveEscalation(runId, optionIndex, 'local Web operator', reason?.trim());
        this.json(res, 200, { success: true, run: runDetail(updated ?? run) });
        return;
      }

      // Fallback 404
      this.json(res, 404, { error: 'Not Found', path: pathname });
    } catch (err: any) {
      if (err instanceof SyntaxError) {
        this.json(res, 400, { error: '请求内容必须是 JSON 对象。' });
      } else {
        this.json(res, 500, { error: err?.message ?? 'Internal Server Error' });
      }
    }
  }

  private agentViews() {
    return this.orchestrator.getAgents().map(({ profile, brainName }) => {
      const { id, name, role, description, capabilities, toolIds, maxConcurrency, currentLoad, totalTokensUsed, version } = profile;
      return { profile: { id, name, role, description, capabilities, toolIds, maxConcurrency, currentLoad, totalTokensUsed, version }, brainName };
    });
  }

  private json(res: ServerResponse, status: number, data: any): void {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  }

  private readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 1e6) {
          req.destroy();
          reject(new Error('Payload too large'));
        }
      });
      req.on('end', () => {
        if (!body.trim()) return resolve({});
        try {
          const parsed: unknown = JSON.parse(body);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new SyntaxError();
          resolve(parsed as Record<string, unknown>);
        } catch (e) {
          reject(new SyntaxError('Invalid JSON'));
        }
      });
      req.on('error', reject);
    });
  }
}

/** 独立运行入口 */
async function main(): Promise<void> {
  const port = Number(process.env.AETHER_PORT) || 3300;
  const server = new WebServer({
    port, project: repositoryConfig(process.env),
    dataDir: resolve(process.env.AETHER_DATA_DIR ?? '.aether/runs')
  });
  const info = await server.start();
  console.log(`\n\x1b[36m⚡ AetherHarness Web 控制台已启动，访问地址：\x1b[1m${info.url}\x1b[0m\n`);
  console.log(`   多智能体协同编排、动态调度、PDCA 自愈与三层可信验证可视化平台`);
  console.log(`   按 Ctrl+C 可停止服务。\n`);

  const shutdown = async () => {
    console.log('\n正在优雅关闭 Web 服务...');
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// 直接运行判断
const isDirectRun = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isDirectRun) {
  main().catch(err => {
    console.error('启动 Web 服务失败:', err);
    process.exit(1);
  });
}
