import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { promisify } from 'node:util';

export type WebAccount = {
  username: string;
  role: 'operator' | 'viewer';
} & ({ tokenHash: string; passwordHash?: never } | { passwordHash: string; tokenHash?: never });

export const MAX_WEB_PASSWORD_LENGTH = 128;
const usernamePattern = /^[a-zA-Z0-9_-]{1,40}$/;
const tokenPattern = /^[a-f0-9]{64}$/;
const passwordHashPattern = /^[a-f0-9]{32}:[a-f0-9]{64}$/;
const derivePassword = promisify(scrypt);

export function loadWebAccounts(file: string | undefined): WebAccount[] | undefined {
  const filename = file ?? '.aether/web-accounts.json';
  if (file === undefined && !existsSync(filename)) return undefined;
  return validateAccounts(JSON.parse(readFileSync(filename, 'utf8').replace(/^\uFEFF/, '')));
}

export function validateAccounts(value: unknown): WebAccount[] {
  if (!Array.isArray(value) || !value.length) throw new Error('Provide a nonempty Web accounts array.');
  const accounts = new Set<string>();
  return value.map(account => {
    if (!account || typeof account.username !== 'string' || !usernamePattern.test(account.username) ||
      !['operator', 'viewer'].includes(account.role) || accounts.has(account.username)) {
      throw new Error('Invalid or duplicate Web account.');
    }
    const { username, role, tokenHash, passwordHash } = account;
    accounts.add(username);
    if (tokenHash === undefined && typeof passwordHash === 'string' && passwordHashPattern.test(passwordHash)) {
      return { username, role, passwordHash };
    }
    if (passwordHash === undefined && typeof tokenHash === 'string' && tokenPattern.test(tokenHash)) {
      return { username, role, tokenHash };
    }
    throw new Error('An account must have one valid password or token hash.');
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

export async function hashWebPassword(password: string): Promise<string> {
  if (!password.length || password.length > MAX_WEB_PASSWORD_LENGTH) throw new Error('Invalid password length.');
  const salt = randomBytes(16);
  const digest = await derivePassword(password, salt, 32) as Buffer;
  return salt.toString('hex') + ':' + digest.toString('hex');
}

export async function authenticate(accounts: ReadonlyMap<string, WebAccount>, header: string | undefined): Promise<WebAccount | undefined> {
  const encoded = /^Basic ([a-z\d+/=]{1,768})$/i.exec(header ?? '')?.[1];
  if (!encoded) return undefined;
  const credentials = Buffer.from(encoded, 'base64').toString('utf8');
  const colon = credentials.indexOf(':');
  if (colon < 0) return undefined;
  return authenticatePassword(accounts, credentials.slice(0, colon), credentials.slice(colon + 1));
}

export async function authenticatePassword(accounts: ReadonlyMap<string, WebAccount>, username: unknown, password: unknown): Promise<WebAccount | undefined> {
  if (typeof username !== 'string' || !usernamePattern.test(username) ||
    typeof password !== 'string' || !password.length || password.length > MAX_WEB_PASSWORD_LENGTH) return undefined;
  const account = accounts.get(username);
  if (account?.passwordHash) {
    const [salt, digest] = account.passwordHash.split(':');
    const candidate = await derivePassword(password, Buffer.from(salt, 'hex'), 32) as Buffer;
    return timingSafeEqual(Buffer.from(digest, 'hex'), candidate) ? account : undefined;
  }
  const token = password.trim();
  if (!account?.tokenHash || !tokenPattern.test(token)) return undefined;
  const expected = Buffer.from(account.tokenHash, 'hex');
  const candidate = Buffer.from(hashWebToken(token), 'hex');
  return timingSafeEqual(expected, candidate) ? account : undefined;
}
