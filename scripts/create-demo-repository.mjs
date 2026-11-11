import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { REPOSITORY_FILE } from '../dist/src/scenarios/repository-repair.js';
import { BASE_FEATURES, renderRateLimiter } from '../dist/src/scenarios/rate-limiter.js';

if (process.argv.length !== 3) throw new Error('Usage: node scripts/create-demo-repository.mjs NEW_DIRECTORY');
const repository = resolve(process.argv[2]);
mkdirSync(repository);
const git = (...args) => execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8' }).trim();
git('init', '-q');
const source = join(repository, REPOSITORY_FILE);
mkdirSync(dirname(source));
writeFileSync(source, '// AetherHarness demo baseline\n' + renderRateLimiter(BASE_FEATURES) + '\n');
git('add', '--', REPOSITORY_FILE);
git('-c', 'user.name=AetherHarness Demo', '-c', 'user.email=aether@example.test',
  '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Pinned rate-limiter baseline');
console.log(JSON.stringify({ repository, revision: git('rev-parse', 'HEAD'), file: REPOSITORY_FILE }));
