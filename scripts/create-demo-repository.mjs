import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { REPOSITORY_FILE } from '../dist/src/scenarios/repository-repair.js';
import { BASE_FEATURES, renderRateLimiter } from '../dist/src/scenarios/rate-limiter.js';
import { TTL_CACHE_BASELINE, TTL_CACHE_FILE } from '../dist/src/scenarios/ttl-cache.js';

const [destination, scenario = 'rate-limiter', ...extra] = process.argv.slice(2);
if (!destination || extra.length || !['rate-limiter', 'ttl-cache'].includes(scenario)) {
  throw new Error('Usage: node scripts/create-demo-repository.mjs NEW_DIRECTORY [rate-limiter|ttl-cache]');
}
const repository = resolve(destination);
const file = scenario === 'ttl-cache' ? TTL_CACHE_FILE : REPOSITORY_FILE;
const baseline = scenario === 'ttl-cache' ? TTL_CACHE_BASELINE : renderRateLimiter(BASE_FEATURES);
mkdirSync(repository);
const git = (...args) => execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8' }).trim();
git('init', '-q');
const source = join(repository, file);
mkdirSync(dirname(source));
writeFileSync(source, '// AetherHarness demo baseline\n' + baseline + '\n');
git('add', '--', file);
git('-c', 'user.name=AetherHarness Demo', '-c', 'user.email=aether@example.test',
  '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Pinned ' + scenario + ' baseline');
console.log(JSON.stringify({ repository, revision: git('rev-parse', 'HEAD'), file }));
