import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';
import type { ToolInvocationContext } from '../tools/tool-registry.js';
import { containerTestRunner } from '../tools/container-runner.js';
import type { ToolDefinition, WorkflowDefinition } from '../types/index.js';
import { asCode, buildRateLimiterWorkflow, type RateLimiterTask } from './rate-limiter.js';

export const REPOSITORY_PROJECT_ID = 'rate-limiter-repository';
export const REPOSITORY_FILE = 'src/rate-limiter.js';
export const MAX_REPOSITORY_GOAL = 2000;

export interface RepositoryConfig {
  path: string;
  revision: string;
  runnerImage: string;
}

export interface RepositoryProject {
  id: typeof REPOSITORY_PROJECT_ID;
  title: string;
  revision: string;
  filePath: string;
  runnerImage: string;
}

export function repositoryConfig(env: NodeJS.ProcessEnv): RepositoryConfig | undefined {
  const { AETHER_PROJECT_REPO: path, AETHER_PROJECT_BASE: revision, AETHER_RUNNER_IMAGE: runnerImage } = env;
  if (!path && !revision && !runnerImage) return;
  if (!path || !revision || !runnerImage) {
    throw new Error('Set AETHER_PROJECT_REPO, AETHER_PROJECT_BASE and AETHER_RUNNER_IMAGE together.');
  }
  return { path, revision, runnerImage };
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
  const project: RepositoryProject = {
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
      containerTestRunner(runnerImage),
      {
        id: 'git_read_baseline',
        name: 'Read pinned Git baseline',
        description: 'Read the approved source file from the configured Git commit.',
        parameters: { type: 'object', properties: {} },
        handler: async (_params, ctx: ToolInvocationContext) => {
          try {
            const { stdout } = await runGit(['cat-file', 'blob', `${revision}^{commit}:${REPOSITORY_FILE}`], ctx);
            if (!stdout.trim() || stdout.includes('\0')) throw new Error('Invalid JavaScript baseline.');
            return stdout;
          } catch (cause) {
            throw new Error(`Could not read ${REPOSITORY_FILE} at the pinned commit.`, { cause });
          }
        }
      },
      {
        id: 'git_check_patch',
        name: 'Check patch against pinned Git index',
        description: 'Run git apply --cached --check with a private temporary index.',
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
            await rm(temp, { recursive: true, force: true, maxRetries: 2 });
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
  workflow.timeoutMs = 180_000;
  const gate = workflow.nodes.find(node => node.id === 'n_complexity_gate')!;
  const planBranch = gate.conditionFn!;
  gate.conditionFn = ctx => ctx.lastVerification?.passed === false ? 'n_loop_full' : planBranch(ctx);
  workflow.nodes.unshift(
    { id: 'n_git_baseline', name: 'read Git baseline', type: 'tool', toolId: 'git_read_baseline', outputKey: 'seedSource' },
    {
      id: 'n_baseline_test', name: 'baseline acceptance', type: 'verification', verifyTargetKey: 'seedSource',
      verificationSpec: { rules: [], confidenceThreshold: 1, executableSandboxCheck: sandbox }
    }
  );
  workflow.nodes.push({
    id: 'n_git_patch_check', name: 'check Git patch', type: 'tool', toolId: 'git_check_patch',
    inputTransformer: ctx => {
      if (typeof ctx.patch?.patch !== 'string' ||
        (!ctx.patch.patch && asCode(ctx.finalCode) !== ctx.seedSource)) throw new Error('Missing project patch.');
      return { patch: ctx.patch.patch };
    }
  });
  workflow.edges.push(
    { from: 'n_git_baseline', to: 'n_baseline_test' },
    { from: 'n_baseline_test', to: 'n_requirement' },
    { from: 'n_patch', to: 'n_git_patch_check' }
  );
  return workflow;
}
