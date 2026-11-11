import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';

export interface WebAccount {
  username: string;
  role: 'operator' | 'viewer';
  tokenHash: string;
}

export function loadWebAccounts(file: string | undefined): WebAccount[] | undefined {
  if (file === undefined) return undefined;
  return validateAccounts(JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')));
}

export function validateAccounts(value: unknown): WebAccount[] {
  if (!Array.isArray(value) || !value.length) throw new Error('Provide a nonempty Web accounts array.');
  const accounts = new Set<string>();
  return value.map(account => {
    if (!account || typeof account.username !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(account.username) ||
      !['operator', 'viewer'].includes(account.role) || typeof account.tokenHash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(account.tokenHash) || accounts.has(account.username)) {
      throw new Error('Invalid or duplicate Web account.');
    }
    accounts.add(account.username);
    const { username, role, tokenHash } = account;
    return { username, role, tokenHash };
  });
}

export function createBootstrapAccount() {
  const token = randomBytes(32).toString('hex');
  const account: WebAccount = { username: 'local', role: 'operator', tokenHash: hashWebToken(token) };
  return { account, token };
}

export function hashWebToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function authenticate(accounts: ReadonlyMap<string, WebAccount>, header: string | undefined): WebAccount | undefined {
  const encoded = /^Basic ([a-z\d+/=]{1,160})$/i.exec(header ?? '')?.[1];
  if (!encoded) return undefined;
  const [username, token, extra] = Buffer.from(encoded, 'base64').toString('utf8').split(':');
  if (extra !== undefined) return undefined;
  return authenticateToken(accounts, username, token);
}

export function authenticateToken(accounts: ReadonlyMap<string, WebAccount>, username: unknown, token: unknown): WebAccount | undefined {
  if (typeof username !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(username) ||
    typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return undefined;
  const account = accounts.get(username);
  const expected = Buffer.from(account?.tokenHash ?? '0'.repeat(64), 'hex');
  const candidate = Buffer.from(hashWebToken(token), 'hex');
  return timingSafeEqual(expected, candidate) ? account : undefined;
}
