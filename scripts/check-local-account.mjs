#!/usr/bin/env node
/**
 * Regression check for the loopback-only credential endpoint that powers the
 * sign-in page's "填入测试 Token" button.
 *
 *   node scripts/check-local-account.mjs
 *
 * It boots the real server twice and asserts the security envelope:
 *   1. bootstrap mode (no AETHER_ACCOUNTS_FILE)
 *        - `?probe=1` reports availability + username and NEVER the token
 *        - a bare GET returns the token that the CLI printed on startup
 *        - those credentials actually log in (200)
 *   2. accounts-file mode
 *        - the endpoint answers 404 and carries no token
 *
 * Requires a prior `npm run build` (it runs `dist/src/cli.js`).
 */
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = ms => new Promise(r => setTimeout(r, ms));

const freePort = () => new Promise((ok, fail) => {
  const srv = createServer();
  srv.once('error', fail);
  srv.listen(0, '127.0.0.1', () => {
    const { port } = srv.address();
    srv.close(() => ok(port));
  });
});

async function start(port, env) {
  const child = spawn(process.execPath, ['dist/src/cli.js', '--web', '--port', String(port)], {
    env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let out = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    await sleep(150);
    try {
      await fetch(`${base}/login`, { redirect: 'manual' });
      return { child, base, out: () => out };
    } catch { /* still starting */ }
  }
  throw new Error('server did not start: ' + out.slice(0, 400));
}

const dir = mkdtempSync(join(tmpdir(), 'aether-local-account-'));

// --- 1. ephemeral bootstrap account (the sign-in "fill token" path) ----------
const fresh = await start(await freePort(), { AETHER_DATA_DIR: join(dir, 'r1') });
await sleep(400);

const probe = await (await fetch(`${fresh.base}/api/local-account?probe=1`)).json();
console.log('probe ->', JSON.stringify(probe));
if (probe.available !== true) throw new Error('probe should report available');
if ('token' in probe) throw new Error('probe must never carry the token');

const secret = await (await fetch(`${fresh.base}/api/local-account`)).json();
const printed = (fresh.out().match(/([a-f0-9]{64})/) ?? [])[1];
console.log('secret -> user=' + secret.username + ' tokenLen=' + (secret.token ?? '').length +
  ' matchesTerminal=' + (secret.token === printed));
if (!secret.token || secret.token !== printed) throw new Error('served token differs from the terminal one');

const login = await fetch(`${fresh.base}/api/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: secret.username, token: secret.token })
});
console.log('login with filled credentials ->', login.status);
if (login.status !== 200) throw new Error('login with the filled credentials failed');
fresh.child.kill();

// --- 2. long-lived accounts file (must stay sealed) -------------------------
const token = randomBytes(32).toString('hex');
const file = join(dir, 'accounts.json');
writeFileSync(file, JSON.stringify([{
  username: 'op',
  role: 'operator',
  tokenHash: createHash('sha256').update(token).digest('hex')
}]));
const sealed = await start(await freePort(), {
  AETHER_DATA_DIR: join(dir, 'r2'),
  AETHER_ACCOUNTS_FILE: file
});
const denied = await fetch(`${sealed.base}/api/local-account`);
const body = await denied.json();
console.log('accounts-file mode ->', denied.status, JSON.stringify(body));
if (denied.status !== 404) throw new Error('accounts-file mode must not expose credentials');
if ('token' in body) throw new Error('404 body must not carry a token');
sealed.child.kill();

console.log('ALL LOCAL-ACCOUNT CHECKS PASSED');
