import { randomBytes } from 'node:crypto';
import { hashWebToken, validateAccounts } from '../dist/src/web/accounts.js';

const [username, role] = process.argv.slice(2);
const token = randomBytes(32).toString('hex');
const [account] = validateAccounts([{ username, role, tokenHash: hashWebToken(token) }]);
console.log(JSON.stringify({ account, token }));
