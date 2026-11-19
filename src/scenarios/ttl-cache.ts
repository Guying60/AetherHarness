export const TTL_CACHE_FILE = 'src/ttl-cache.js';
export const TTL_CACHE_GOAL = 'Repair createCache without changing its API. set(key, value, now, ttl) overwrites the entry. ' +
  'get(key, now) returns undefined for an absent key or when now is at or beyond the latest write time plus its TTL. ' +
  'Timestamps and TTL are nonnegative integers. Do not use I/O or timer APIs.';

export const TTL_CACHE_REFERENCE = `function createCache() {
  const entries = new Map();
  return {
    set(key, value, now, ttl) { entries.set(key, { value, expiresAt: now + ttl }); },
    get(key, now) {
      const entry = entries.get(key);
      if (!entry || now >= entry.expiresAt) return undefined;
      return entry.value;
    }
  };
}`;

export const TTL_CACHE_BASELINE = TTL_CACHE_REFERENCE.replace('now >= entry.expiresAt', 'now > entry.expiresAt');

export const TTL_CACHE_TESTS = `
const cache = createCache();
cache.set('a', 42, 10, 5);
assertEqual(cache.get('a', 14), 42, 'TTL-001: entry is available just before expiry');
assertEqual(cache.get('a', 15), undefined, 'TTL-002: an entry expires at exactly now + ttl');
cache.set('zero', 19, 30, 0);
assertEqual(cache.get('zero', 30), undefined, 'TTL-003: zero TTL expires immediately');
cache.set('a', 20, 15, 4);
assertEqual(cache.get('a', 17), 20, 'TTL-004: writing again replaces the old value');
assertEqual(cache.get('a', 19), undefined, 'TTL-005: rewriting resets the expiry deadline');
assertEqual(cache.get('missing', 19), undefined, 'TTL-006: a missing key returns undefined');
`;
