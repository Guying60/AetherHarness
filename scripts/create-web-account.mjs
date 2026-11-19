import { randomBytes } from 'node:crypto';
import { hashWebPassword, hashWebToken, validateAccounts } from '../dist/src/web/accounts.js';

const [username, role] = process.argv.slice(2);
const password = process.env.AETHER_WEB_PASSWORD;
if (password !== undefined) {
  const [account] = validateAccounts([{ username, role, passwordHash: await hashWebPassword(password) }]);
  console.log(JSON.stringify({ account }));
} else {
  const token = randomBytes(32).toString('hex');
  const [account] = validateAccounts([{ username, role, tokenHash: hashWebToken(token) }]);
  console.log(JSON.stringify({ account, token }));
}
