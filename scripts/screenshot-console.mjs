#!/usr/bin/env node
/**
 * Headless screenshot of the Web console (visual acceptance for UI work).
 *
 * Boots the real server against a throwaway data dir and a throwaway account,
 * drives Microsoft Edge over the DevTools protocol, logs in through the real
 * /api/login endpoint, then captures PNGs.
 *
 *   node scripts/screenshot-console.mjs <out-dir> [--paths=/,/runs,/settings]
 *                                        [--width=1440] [--height=1000] [--full]
 *
 * Requires Edge (default path can be overridden with EDGE_PATH). No npm deps:
 * Node >= 22 for the global WebSocket + fetch used by the CDP client.
 */
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const outDir = resolve(args.find(a => !a.startsWith('--')) ?? 'design/screenshots');
const flag = (name, fallback) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const paths = flag('paths', '/').split(',').map(p => p.trim()).filter(Boolean);
const width = Number(flag('width', '1440'));
const height = Number(flag('height', '1000'));
const full = args.includes('--full');
const anon = args.includes('--anon');
const bootstrap = args.includes('--bootstrap');
const seed = flag('seed', '');
const edgePath = process.env.EDGE_PATH ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function freePort() {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.once('error', rej);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => res(port));
    });
  });
}

async function waitForPort(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await fetch(`http://127.0.0.1:${port}/login`, { redirect: 'manual' });
      return;
    } catch {
      if (Date.now() > deadline) throw new Error(`server on :${port} never came up`);
      await sleep(150);
    }
  }
}

/** Minimal CDP client over the built-in WebSocket. */
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let next = 0;
  const pending = new Map();
  const events = new Map();
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', () => res());
    ws.addEventListener('error', e => rej(new Error('CDP socket error: ' + e.message)));
  });
  ws.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve: ok, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : ok(msg.result);
      return;
    }
    for (const handler of events.get(msg.method) ?? []) handler(msg.params);
  });
  const send = (method, params = {}) => new Promise((ok, reject) => {
    const id = ++next;
    pending.set(id, { resolve: ok, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const once = method => new Promise(ok => {
    const handler = params => {
      events.set(method, (events.get(method) ?? []).filter(h => h !== handler));
      ok(params);
    };
    events.set(method, [...(events.get(method) ?? []), handler]);
  });
  return { ready, send, once, close: () => ws.close() };
}

const children = [];
const cleanup = () => {
  for (const child of children) {
    try { child.kill(); } catch { /* already gone */ }
  }
};

try {
  mkdirSync(outDir, { recursive: true });
  const dataDir = mkdtempSync(join(tmpdir(), 'aether-shot-'));
  const token = randomBytes(32).toString('hex');
  const accountsFile = join(dataDir, 'accounts.json');
  writeFileSync(accountsFile, JSON.stringify([{
    username: 'operator', role: 'operator',
    tokenHash: createHash('sha256').update(token).digest('hex')
  }]));

  const port = await freePort();
  // Use a clean working directory so bootstrap mode cannot pick up a local accounts file.
  const serverEnv = { ...process.env, AETHER_DATA_DIR: join(dataDir, 'runs') };
  if (bootstrap) delete serverEnv.AETHER_ACCOUNTS_FILE;
  else serverEnv.AETHER_ACCOUNTS_FILE = accountsFile;
  const server = spawn(process.execPath, [resolve('dist/src/cli.js'), '--web', '--port', String(port)], {
    env: serverEnv, cwd: dataDir,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  children.push(server);
  let startupOutput = '';
  server.stdout.on('data', chunk => {
    if (bootstrap && startupOutput.length < 4096) startupOutput += chunk;
  });
  server.stderr.on('data', chunk => process.stderr.write('[server] ' + chunk));
  await waitForPort(port);
  process.stdout.write(`server up on :${port}\n`);

  const debugPort = await freePort();
  const profile = mkdtempSync(join(tmpdir(), 'aether-edge-'));
  const edge = spawn(edgePath, [
    '--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--hide-scrollbars', '--force-color-profile=srgb', `--window-size=${width},${height}`, 'about:blank'
  ], { stdio: 'ignore' });
  children.push(edge);

  let target;
  for (let i = 0; i < 100 && !target; i++) {
    await sleep(150);
    try {
      const list = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
      target = list.find(t => t.type === 'page');
    } catch { /* not up yet */ }
  }
  if (!target) throw new Error('Edge DevTools endpoint never answered');

  const client = cdp(target.webSocketDebuggerUrl);
  await client.ready;
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: false
  });

  // Real login: same-origin fetch so the session cookie lands in the jar.
  const loaded = client.once('Page.loadEventFired');
  await client.send('Page.navigate', { url: `http://127.0.0.1:${port}/login` });
  await loaded;
  if (!anon) {
    const temporary = startupOutput.match(/本次启动的临时账号 ([\w-]+)，密码 ([a-f0-9]{64})/);
    if (bootstrap && !temporary) throw new Error('Bootstrap credentials were not printed at startup.');
    const credentials = temporary
      ? { username: temporary[1], password: temporary[2] }
      : { username: 'operator', password: token };
    const login = await client.send('Runtime.evaluate', {
      expression: `fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},`
        + `body:${JSON.stringify(JSON.stringify(credentials))}}).then(r=>r.status)`,
      awaitPromise: true, returnByValue: true
    });
    if (login.result.value !== 200) throw new Error(`login failed with ${login.result.value}`);
  }

  if (seed) {
    // Produce one real run through the public API so the table has evidence.
    const started = await client.send('Runtime.evaluate', {
      expression: `fetch('/api/tasks/run',{method:'POST',headers:{'Content-Type':'application/json'},`
        + `body:JSON.stringify({taskId:'${seed}'})}).then(r=>r.json())`,
      awaitPromise: true, returnByValue: true
    });
    const runId = started.result.value?.runId;
    if (!runId) throw new Error('seed run was not created: ' + JSON.stringify(started.result.value));
    process.stdout.write(`seeded ${runId}, waiting for it to settle…\n`);
    for (let i = 0; i < 240; i++) {
      await sleep(500);
      const state = await client.send('Runtime.evaluate', {
        expression: `fetch('/api/runs/${runId}').then(r=>r.json()).then(r=>r.status)`,
        awaitPromise: true, returnByValue: true
      });
      const status = state.result.value;
      if (['completed', 'failed', 'needs_human', 'cancelled'].includes(status)) {
        process.stdout.write(`seeded run settled: ${status}\n`);
        break;
      }
    }
  }

  for (const path of paths) {
    const nav = client.once('Page.loadEventFired');
    await client.send('Page.navigate', { url: `http://127.0.0.1:${port}${path}` });
    await nav;
    await sleep(1200); // first /api/dashboard round trip + render
    const script = flag('eval', '');
    if (script) {
      await client.send('Runtime.evaluate', { expression: script, awaitPromise: true, returnByValue: true });
      await sleep(700);
    }
    const options = { format: 'png' };
    if (full) {
      const metrics = await client.send('Page.getLayoutMetrics');
      const size = metrics.cssContentSize ?? metrics.contentSize;
      options.captureBeyondViewport = true;
      options.clip = { x: 0, y: 0, width, height: Math.ceil(size.height), scale: 1 };
    }
    const shot = await client.send('Page.captureScreenshot', options);
    const name = (path === '/' ? 'workbench' : path.replace(/^\//, '').replace(/[^\w-]+/g, '-')) + '.png';
    writeFileSync(join(outDir, name), Buffer.from(shot.data, 'base64'));
    process.stdout.write(`captured ${name}\n`);
  }

  client.close();
  process.stdout.write(`shots written to ${outDir}\n`);
} finally {
  cleanup();
}
