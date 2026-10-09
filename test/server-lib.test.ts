import { describe, expect, it } from 'vitest';
import { DEFAULTS, readConfig } from '@/lib/server/config';
import { describeWait, describeWindow } from '@/lib/server/http';
import { createIdempotencyCache } from '@/lib/server/idempotency';
import { loadModels, shortestDuration } from '@/lib/server/models';
import { picsart } from '@/lib/server/picsart';
import { createRateLimiter } from '@/lib/server/rate-limit';
import { issueTicket, readTicket } from '@/lib/server/ticket';

describe('readConfig', () => {
  it('uses safe defaults when nothing is set', () => {
    expect(readConfig({})).toEqual({
      enabled: true,
      videoEnabled: true,
      promptMaxLength: DEFAULTS.promptMaxLength,
      windowSeconds: DEFAULTS.windowSeconds,
      imageLimit: DEFAULTS.imageLimit,
      videoLimit: DEFAULTS.videoLimit,
      statusLimit: DEFAULTS.statusLimit,
      videoShortest: true,
      imageModels: undefined,
      videoModels: undefined,
    });
  });

  it('reads switches, limits and allowlists', () => {
    const config = readConfig({
      PICSART_DEMO_ENABLED: 'off',
      PICSART_DEMO_VIDEO_ENABLED: 'FALSE',
      PICSART_DEMO_IMAGE_LIMIT: '25',
      PICSART_DEMO_WINDOW_SECONDS: '86400',
      PICSART_DEMO_IMAGE_MODELS: ' a , b ,, a ',
    });
    expect(config).toMatchObject({ enabled: false, videoEnabled: false, imageLimit: 25, windowSeconds: 86_400, imageModels: ['a', 'b'] });
  });

  it('falls back to defaults for invalid numbers', () => {
    const config = readConfig({ PICSART_DEMO_IMAGE_LIMIT: '-3', PICSART_DEMO_VIDEO_LIMIT: '1.5', PICSART_DEMO_STATUS_LIMIT: 'lots' });
    expect(config).toMatchObject({ imageLimit: DEFAULTS.imageLimit, videoLimit: DEFAULTS.videoLimit, statusLimit: DEFAULTS.statusLimit });
  });
});

describe('createRateLimiter', () => {
  it('allows the limit per window, then resets', () => {
    let now = 0;
    const limiter = createRateLimiter(() => now);
    expect(limiter.hit('ip', 2, 60).ok).toBe(true);
    expect(limiter.hit('ip', 2, 60).ok).toBe(true);
    expect(limiter.hit('ip', 2, 60)).toEqual({ ok: false, retryAfterSeconds: 60 });
    expect(limiter.hit('other-ip', 2, 60).ok).toBe(true);
    now = 60_000;
    expect(limiter.hit('ip', 2, 60).ok).toBe(true);
  });
});

describe('createIdempotencyCache', () => {
  it('forgets entries after ten minutes', async () => {
    let now = 0;
    const cache = createIdempotencyCache(() => now);
    cache.set('key', Promise.resolve({ status: 200, body: {} }));
    expect(cache.get('key')).toBeDefined();
    now = 10 * 60 * 1000;
    expect(cache.get('key')).toBeUndefined();
  });
});

describe('video tickets', () => {
  const operation = { modelId: 'model', generationId: 'gen-1', playgroundUrl: 'https://picsart.com/ai-playground/' };

  it('round-trips an operation signed with the same secret', () => {
    expect(readTicket(issueTicket(operation, 'secret'), 'secret')).toEqual(operation);
  });

  it('rejects other secrets, expired tickets and malformed operations', () => {
    expect(readTicket(issueTicket(operation, 'secret'), 'other')).toBeUndefined();
    expect(readTicket(issueTicket(operation, 'secret', 0), 'secret', 6 * 60 * 60 * 1000 + 1)).toBeUndefined();
    expect(readTicket(issueTicket({ modelId: 'model' }, 'secret'), 'secret')).toBeUndefined();
    expect(readTicket(issueTicket(['model', 'gen-1'], 'secret'), 'secret')).toBeUndefined();
  });
});

describe('describeWindow & describeWait', () => {
  it('reads naturally', () => {
    expect(describeWindow(3600)).toBe('hour');
    expect(describeWindow(7200)).toBe('2 hours');
    expect(describeWindow(90)).toBe('90 seconds');
    expect(describeWait(1)).toBe('1 second');
    expect(describeWait(600)).toBe('10 minutes');
    expect(describeWait(7200)).toBe('2 hours');
  });
});

describe('loadModels', () => {
  it('offers only prompt-only text-to-image and text-to-video models from the catalog', async () => {
    for (const [mode, inputType] of [['image', 't2i'], ['video', 't2v']] as const) {
      const models = await loadModels(mode);
      const listed = new Map((await picsart.listModels({ mode })).map((model) => [model.id, model]));
      expect(models.length).toBeGreaterThan(0);
      for (const { option, catalog } of models) {
        expect(listed.get(option.id)?.inputType).toBe(inputType);
        expect(catalog.params.prompt?.kind).toBe('text');
        expect(Object.entries(catalog.params).filter(([key, param]) => key !== 'prompt' && param.required)).toEqual([]);
        for (const ratio of option.aspectRatios) expect(ratio).toMatch(/^\d+(\.\d+)?:\d+(\.\d+)?$/);
      }
    }
  });

  it('keeps the allowlist order and drops unknown IDs', async () => {
    const [first, second] = await loadModels('image');
    const models = await loadModels('image', [second.option.id, 'not-a-picsart-model', first.option.id]);
    expect(models.map((model) => model.option.id)).toEqual([second.option.id, first.option.id]);
  });

  it('picks the shortest positive duration', async () => {
    const durations = (await loadModels('video')).map((model) => shortestDuration(model.catalog)).filter((value) => value !== undefined);
    expect(durations.length).toBeGreaterThan(0);
    for (const duration of durations) expect(duration).toBeGreaterThan(0);
  });
});
