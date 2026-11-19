import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';
import { ToolCleanupError, type ToolInvocationContext } from '../tools/tool-registry.js';
import { containerTestRunner } from '../tools/container-runner.js';
import type { ToolDefinition, WorkflowDefinition } from '../types/index.js';
import { asCode, buildRateLimiterWorkflow, rateLimiterDeliveryNodes, type RateLimiterTask } from './rate-limiter.js';
import { TTL_CACHE_FILE } from './ttl-cache.js';

export const REPOSITORY_PROJECT_ID = 'rate-limiter-repository';
export const REPOSITORY_FILE = 'src/rate-limiter.js';
export const TTL_CACHE_PROJECT_ID = 'ttl-cache-repository';
export const MAX_REPOSITORY_GOAL = 2000;
const DELIVERY_WORKFLOW_ID = 'repository-delivery';

export interface RepositoryConfig {
  path: string;
  revision: string;
  runnerImage?: string;
  scenario?: 'rate-limiter' | 'ttl-cache';
}

export interface RepositoryProject {
  id: typeof REPOSITORY_PROJECT_ID | typeof TTL_CACHE_PROJECT_ID;
  title: string;
  revision: string;
  filePath: string;
  runnerImage?: string;
}

export function repositoryConfig(env: NodeJS.ProcessEnv, localFile?: string): RepositoryConfig | undefined {
  let { AETHER_PROJECT_REPO: path, AETHER_PROJECT_BASE: revision, AETHER_RUNNER_IMAGE: runnerImage,
    AETHER_PROJECT_SCENARIO: scenario } = env;
  if (!path && !revision && localFile) {
    let raw: string | undefined;
    try { raw = readFileSync(localFile, 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (raw !== undefined) {
      const local = JSON.parse(raw);
      if (typeof local?.path !== 'string' || typeof local.revision !== 'string' ||
        (local.scenario !== undefined && typeof local.scenario !== 'string')) {
        throw new Error('Invalid local repository configuration: ' + localFile);
      }
      path = local.path;
      revision = local.revision;
      scenario ??= local.scenario;
    }
  }
  if (!path && !revision && !runnerImage) return;
  if (!path || !revision) {
    throw new Error('Set AETHER_PROJECT_REPO and AETHER_PROJECT_BASE together.');
  }
  if (scenario !== undefined && scenario !== 'rate-limiter' && scenario !== 'ttl-cache') {
    throw new Error('AETHER_PROJECT_SCENARIO must be rate-limiter or ttl-cache.');
  }
  return { path, revision, runnerImage, scenario };
}

const git = promisify(execFile);
const gitEnv = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    /^(path|systemroot|windir|temp|tmp)$/i.test(key))),
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_NO_REPLACE_OBJECTS: '1', GIT_TERMINAL_PROMPT: '0'
};

export function repositoryTools(config: RepositoryConfig): { project: RepositoryProject; tools: ToolDefinition[] } {
  const { path, revision, runnerImage } = config;
  if (!isAbsolute(path) || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(revision)) {
    throw new Error('Project repository requires an absolute local path and a full Git commit hash.');
  }
  const project: RepositoryProject = config.scenario === 'ttl-cache' ? {
    id: TTL_CACHE_PROJECT_ID, title: 'TTL 缓存仓库修复', revision, filePath: TTL_CACHE_FILE, runnerImage
  } : {
    id: REPOSITORY_PROJECT_ID, title: '限流器仓库修复', revision, filePath: REPOSITORY_FILE, runnerImage
  };
  const runGit = (args: string[], ctx: ToolInvocationContext, index?: string) =>
    git('git', ['-C', path, ...args], {
      env: { ...gitEnv, GIT_INDEX_FILE: index },
      signal: ctx.signal, timeout: ctx.timeoutMs, maxBuffer: 200_000, windowsHide: true
    });

  return {
    project,
    tools: [
      ...(runnerImage ? [containerTestRunner(runnerImage)] : []),
      {
        id: 'git_read_baseline',
        name: 'Read pinned Git baseline',
        description: 'Read the approved source file from the configured Git commit.',
        waitForCleanup: true,
        parameters: { type: 'object', properties: {} },
        handler: async (_params, ctx: ToolInvocationContext) => {
          try {
            const { stdout } = await runGit(['cat-file', 'blob', `${revision}^{commit}:${project.filePath}`], ctx);
            if (!stdout.trim() || stdout.includes('\0')) throw new Error('Invalid JavaScript baseline.');
            return stdout;
          } catch (cause) {
            throw new Error(`Could not read ${project.filePath} at the pinned commit.`, { cause });
          }
        }
      },
      {
        id: 'git_check_patch',
        name: 'Check patch against pinned Git index',
        description: 'Run git apply --cached --check with a private temporary index.',
        waitForCleanup: true,
        parameters: {
          type: 'object', required: ['patch'],
          properties: { patch: { type: 'string', description: 'Generated unified Git patch' } }
        },
        handler: async ({ patch }: { patch: string }, ctx: ToolInvocationContext) => {
          if (!patch) return { checked: false };
          const temp = await mkdtemp(join(tmpdir(), 'aether-git-index-'));
          try {
            const index = join(temp, 'index');
            const diff = join(temp, 'repair.patch');
            await writeFile(diff, patch);
            await runGit(['read-tree', `${revision}^{commit}`], ctx, index);
            await runGit(['apply', '--cached', '--check', '--', diff], ctx, index);
            return { checked: true, revision };
          } catch (cause) {
            throw new Error('Patch did not apply to the pinned Git baseline.', { cause });
          } finally {
            try {
              await rm(temp, { recursive: true, force: true, maxRetries: 2 });
            } catch (cause) {
              throw new ToolCleanupError('Could not remove the temporary Git index.', { cause });
            }
          }
        }
      }
    ]
  };
}

export function buildRepositoryWorkflow(task: RateLimiterTask): WorkflowDefinition {
  const sandbox = {
    ...task.verificationSpec.executableSandboxCheck,
    toolId: 'container_test_runner',
    timeoutMs: 12_000
  };
  const workflow = buildRateLimiterWorkflow({
    ...task, verificationSpec: { ...task.verificationSpec, executableSandboxCheck: sandbox }
  });
  workflow.entryNodeId = 'n_git_baseline';
  workflow.version = '2.1.0';
  workflow.timeoutMs = 180_000;
  const gate = workflow.nodes.find(node => node.id === 'n_complexity_gate')!;
  const planBranch = gate.conditionFn!;
  gate.conditionFn = ctx => ctx.lastVerification?.passed === false ? 'n_loop_full' : planBranch(ctx);
  workflow.nodes.unshift(
    { id: 'n_git_baseline', name: '读取 Git 基线', type: 'tool', toolId: 'git_read_baseline', outputKey: 'seedSource' },
    {
      id: 'n_baseline_checks', name: '并行检查基线', type: 'parallel_group',
      parallelChildIds: ['n_baseline_test', 'n_baseline_scan'],
      description: 'Run behavioural tests and static analysis on the pinned source.'
    },
    {
      id: 'n_baseline_test', name: '基线功能验收', type: 'verification', verifyTargetKey: 'seedSource',
      verificationSpec: { rules: [], confidenceThreshold: 1, executableSandboxCheck: sandbox }
    },
    {
      id: 'n_baseline_scan', name: '基线静态扫描', type: 'tool', toolId: 'static_analyzer',
      inputTransformer: ctx => ({ code: ctx.seedSource })
    }
  );
  workflow.nodes = workflow.nodes.filter(node => node.id !== 'n_scan' && node.id !== 'n_patch');
  workflow.nodes.push({
    id: 'n_delivery', name: '仓库补丁交付', type: 'subworkflow',
    subworkflowId: DELIVERY_WORKFLOW_ID, outputKey: 'delivery',
    inputTransformer: ctx => ({ finalCode: ctx.finalCode, seedSource: ctx.seedSource }),
    description: 'Scan the candidate, generate a patch and check it against the pinned index.'
  });
  workflow.edges = workflow.edges.filter(edge => edge.from !== 'n_scan').map(edge =>
    edge.to === 'n_scan' ? { ...edge, to: 'n_delivery' } : edge
  );
  workflow.edges.push(
    { from: 'n_git_baseline', to: 'n_baseline_checks' },
    { from: 'n_baseline_checks', to: 'n_requirement' }
  );
  return workflow;
}

export function buildRepositoryDeliveryWorkflow(filePath = REPOSITORY_FILE): WorkflowDefinition {
  return {
    id: DELIVERY_WORKFLOW_ID,
    name: 'Git 补丁交付',
    description: 'Validate a patch against the pinned Git baseline before releasing it.',
    version: '1.0.0',
    entryNodeId: 'n_scan',
    nodes: [
      ...rateLimiterDeliveryNodes(filePath),
      {
        id: 'n_git_patch_check', name: '检查补丁能否应用', type: 'tool', toolId: 'git_check_patch',
        inputTransformer: ctx => {
          if (typeof ctx.patch?.patch !== 'string' ||
            (!ctx.patch.patch && asCode(ctx.finalCode) !== ctx.seedSource)) throw new Error('Missing project patch.');
          return { patch: ctx.patch.patch };
        }
      }
    ],
    edges: [{ from: 'n_scan', to: 'n_patch' }, { from: 'n_patch', to: 'n_git_patch_check' }]
  };
}
