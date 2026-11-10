import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import type { ToolDefinition } from '../types/index.js';
import type { TestInput } from './test-runner.js';
import type { ToolInvocationContext } from './tool-registry.js';

const docker = promisify(execFile);
const MAX_SOURCE_BYTES = 200_000;
const proxyVars = ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY', 'FTP_PROXY'];
const dockerEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(path|systemroot|windir|temp|tmp|home|userprofile|docker_(config|host|context|tls_verify|cert_path))$/i.test(key)));

export function containerTestRunner(image: string): ToolDefinition {
  if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw new Error('Project runner image must be a full Docker image ID.');
  return {
    id: 'container_test_runner',
    name: 'Isolated project acceptance tests',
    description: 'Run the fixed JS suite in a restricted Docker container.',
    isSandboxed: true,
    timeoutMs: 12_000,
    parameters: {
      type: 'object',
      properties: {
        sourceCode: { type: 'string', description: 'Candidate JavaScript' },
        testCode: { type: 'string', description: 'Trusted test suite' },
        bindings: { type: 'array', description: 'Candidate bindings exposed to the suite' }
      },
      required: ['sourceCode', 'testCode', 'bindings']
    },
    handler: async (input: Omit<TestInput, 'timeoutMs'>, ctx: ToolInvocationContext) => {
      const { sourceCode, testCode, bindings } = input;
      if (Buffer.byteLength(sourceCode) + Buffer.byteLength(testCode) > MAX_SOURCE_BYTES) {
        throw new Error('Project test payload too large.');
      }
      const runner = await readFile(new URL('./test-runner.js', import.meta.url), 'utf8');
      const testInput: TestInput = { sourceCode, testCode, bindings, timeoutMs: 3000 };
      const script = `${runner}\nprocess.stdout.write(JSON.stringify(runTests(${JSON.stringify(testInput)})));\n`;
      const name = `aether-acceptance-${randomUUID()}`;
      const args = [
        'run', '--rm', '--interactive', '--name', name, '--pull=never',
        '--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
        '--user=65534:65534', '--pids-limit=32', '--memory=128m', '--memory-swap=128m', '--cpus=1',
        '--log-driver=none', '--entrypoint=node',
        ...proxyVars.flatMap(key => ['--env', `${key}=`, '--env', `${key.toLowerCase()}=`]),
        image, '--max-old-space-size=64', '--input-type=module'
      ];
      try {
        ctx.signal?.throwIfAborted();
        const result = docker('docker', args, {
          env: dockerEnv, windowsHide: true, timeout: ctx.timeoutMs, signal: ctx.signal, maxBuffer: 256_000
        });
        result.child.stdin?.on('error', () => {});
        result.child.stdin?.end(script);
        const { stdout } = await result;
        const outcome = JSON.parse(stdout);
        const report = outcome?.report;
        if (!report || ![report.passed, report.failed, report.total].every(n => Number.isSafeInteger(n) && n >= 0) ||
          report.passed + report.failed !== report.total || !Array.isArray(report.errors) ||
          !report.errors.every((message: unknown) => typeof message === 'string') ||
          outcome.success !== (report.failed === 0 && report.total > 0)) {
          throw new Error('Malformed acceptance report.');
        }
        return outcome;
      } catch (cause) {
        await docker('docker', ['rm', '-f', name], {
          env: dockerEnv, windowsHide: true, timeout: 3000, maxBuffer: 8192
        }).catch(() => {});
        ctx.signal?.throwIfAborted();
        throw new Error('Isolated acceptance failed. Check that Docker is running and the pinned Node image is local.', { cause });
      }
    }
  };
}
