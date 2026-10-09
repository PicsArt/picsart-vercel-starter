import 'server-only';
import type { Reply } from './http';

const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 1000;
const KEY = /^[A-Za-z0-9_-]{8,128}$/;

export function idempotencyKey(request: Request): string | undefined {
  const value = request.headers.get('idempotency-key')?.trim();
  return value && KEY.test(value) ? value : undefined;
}

export function createIdempotencyCache(now: () => number = Date.now) {
  const entries = new Map<string, { expiresAt: number; reply: Promise<Reply> }>();

  return {
    get(key: string): Promise<Reply> | undefined {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt > now()) return entry.reply;
      entries.delete(key);
      return undefined;
    },
    set(key: string, reply: Promise<Reply>): void {
      if (entries.size >= MAX_ENTRIES) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
      entries.set(key, { expiresAt: now() + TTL_MS, reply });
    },
    reset(): void {
      entries.clear();
    },
  };
}

export const idempotencyCache = createIdempotencyCache();

export function withIdempotency(request: Request, scope: string, run: () => Reply | Promise<Reply>): Promise<Reply> {
  const key = idempotencyKey(request);
  if (!key) return Promise.resolve(run());
  const cacheKey = `${scope}:${key}`;
  const cached = idempotencyCache.get(cacheKey);
  if (cached) return cached;
  const result = Promise.resolve(run());
  idempotencyCache.set(cacheKey, result);
  return result;
}
