import 'server-only';

export interface RateLimitResult {
  ok: boolean;
  retryAfterSeconds: number;
}

const SWEEP_THRESHOLD = 10_000;

export function createRateLimiter(now: () => number = Date.now) {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return {
    hit(key: string, limit: number, windowSeconds: number): RateLimitResult {
      const time = now();
      if (buckets.size > SWEEP_THRESHOLD) {
        for (const [bucketKey, bucket] of buckets) if (bucket.resetAt <= time) buckets.delete(bucketKey);
      }
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= time) {
        bucket = { count: 0, resetAt: time + windowSeconds * 1000 };
        buckets.set(key, bucket);
      }
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - time) / 1000));
      if (bucket.count >= limit) return { ok: false, retryAfterSeconds };
      bucket.count += 1;
      return { ok: true, retryAfterSeconds };
    },
    reset(): void {
      buckets.clear();
    },
  };
}

export const rateLimiter = createRateLimiter();
