#!/usr/bin/env node
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { hashWebToken } from '../dist/src/web/accounts.js';
import { WebServer } from '../dist/src/web/server.js';

const fresh = new WebServer({ port: 0 });
const { url, bootstrap } = await fresh.start();
try {
  assert.ok(bootstrap);
  const probe = await fetch(url + '/api/local-account?probe=1');
  assert.equal(probe.status, 200);
  assert.equal(probe.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await probe.json(), { available: true, username: bootstrap.username });

  const unqualified = await fetch(url + '/api/local-account');
  assert.equal(unqualified.status, 404);
  assert.deepEqual(await unqualified.json(), { available: false });

  const login = password => fetch(url + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: bootstrap.username, password })
  });
  assert.equal((await login('wrong password')).status, 401);
  assert.equal((await login(bootstrap.token)).status, 200);
} finally {
  await fresh.stop();
}

const configured = new WebServer({ port: 0, accounts: [
  { username: 'operator', role: 'operator', tokenHash: hashWebToken(randomBytes(32).toString('hex')) }
] });
const { url: configuredUrl } = await configured.start();
try {
  const probe = await fetch(configuredUrl + '/api/local-account?probe=1');
  assert.equal(probe.status, 404);
  assert.deepEqual(await probe.json(), { available: false });
} finally {
  await configured.stop();
}

console.log('ALL LOCAL-ACCOUNT CHECKS PASSED');
