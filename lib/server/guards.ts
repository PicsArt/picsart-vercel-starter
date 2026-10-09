import 'server-only';
import type { DemoConfig } from './config';
import { describeWait, describeWindow, errorReply, type Reply } from './http';
import { rateLimiter } from './rate-limit';
import { picsartApiKey } from './secrets';

export type Feature = 'image' | 'video' | 'status';

export function notConfigured(): Reply {
  return errorReply(503, 'not_configured', 'This deployment has no Picsart API key. Add PICSART_API_KEY to its environment variables, then redeploy.');
}

export function unavailable(config: DemoConfig, feature: Feature): Reply | undefined {
  if (!config.enabled) return errorReply(503, 'demo_disabled', 'Generation is paused on this demo. Try again later.');
  if (feature === 'video' && !config.videoEnabled) {
    return errorReply(503, 'video_disabled', 'Video generation is turned off on this demo. Image generation still works.');
  }
  return picsartApiKey() ? undefined : notConfigured();
}

const LIMITS: Record<Feature, { nouns: [string, string]; limit: (config: DemoConfig) => number }> = {
  image: { nouns: ['image', 'images'], limit: (config) => config.imageLimit },
  video: { nouns: ['video', 'videos'], limit: (config) => config.videoLimit },
  status: { nouns: ['status check', 'status checks'], limit: (config) => config.statusLimit },
};

export function rateLimited(config: DemoConfig, feature: Feature, ip: string): Reply | undefined {
  const { nouns, limit } = LIMITS[feature];
  const max = limit(config);
  const noun = max === 1 ? nouns[0] : nouns[1];
  const result = rateLimiter.hit(`${feature}:${ip}`, max, config.windowSeconds);
  if (result.ok) return undefined;
  return errorReply(
    429,
    'rate_limited',
    `This demo allows ${max} ${noun} per ${describeWindow(config.windowSeconds)}. Try again in ${describeWait(result.retryAfterSeconds)}.`,
    { headers: { 'Retry-After': String(result.retryAfterSeconds) } },
  );
}

export function httpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}
