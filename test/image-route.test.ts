import { APICallError, InvalidArgumentError } from '@ai-sdk/provider';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/image/route';
import { loadModels, type DemoModel } from '@/lib/server/models';
import { picsart } from '@/lib/server/picsart';
import { IMAGE_URL, imageGenerate, imageSuccess, keyState, PLAYGROUND_URL } from './fakes';
import { call } from './http';

const PATH = '/api/image';
let model: DemoModel;
let withRatio: DemoModel;
let otherModel: DemoModel;
let notTextToImage: string;

beforeAll(async () => {
  const models = await loadModels('image');
  [model, otherModel] = models;
  withRatio = models.find((candidate) => candidate.option.aspectRatios.length > 0)!;
  notTextToImage = (await picsart.listModels({ mode: 'image' })).find((candidate) => candidate.inputType !== 't2i')!.id;
  expect(model && otherModel && withRatio && notTextToImage).toBeTruthy();
});

describe('POST /api/image', () => {
  it('generates one image and surfaces its URL, playground link & credits', async () => {
    imageGenerate.mockImplementation(async (modelId) => imageSuccess(modelId, 0.0001));
    const ratio = withRatio.option.aspectRatios[0];

    const result = await call(POST, PATH, { modelId: withRatio.option.id, prompt: '  a ceramic mug  ', aspectRatio: ratio });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ image: { url: IMAGE_URL }, modelId: withRatio.option.id, playgroundUrl: PLAYGROUND_URL, credits: 0.0001 });
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(imageGenerate).toHaveBeenCalledOnce();
    const [modelId, options] = imageGenerate.mock.calls[0];
    expect(modelId).toBe(withRatio.option.id);
    expect(options).toMatchObject({ prompt: 'a ceramic mug', n: 1, aspectRatio: ratio });
  });

  it('never reports the account balance', async () => {
    imageGenerate.mockImplementation(async (modelId) => imageSuccess(modelId));
    const result = await call(POST, PATH, { modelId: model.option.id, prompt: 'a mug' });
    expect(result.text).not.toContain('balance');
    expect(result.text).not.toContain('41.5');
  });

  it('maps an out-of-credits failure to 402', async () => {
    imageGenerate.mockRejectedValue(
      new APICallError({
        message: 'Not enough credits',
        url: 'https://api.picsart.com',
        requestBodyValues: {},
        statusCode: 402,
        data: { code: 'NOT_ENOUGH_AVAILABLE_CREDITS' },
        isRetryable: false,
      }),
    );
    const result = await call(POST, PATH, { modelId: model.option.id, prompt: 'a mug' });
    expect(result.status).toBe(402);
    expect(result.body.error.code).toBe('out_of_credits');
    expect(imageGenerate).toHaveBeenCalledOnce();
  });

  it('hides unexpected upstream errors behind a generic message', async () => {
    imageGenerate.mockRejectedValue(new Error('socket hang up at 10.0.0.12:443'));
    const result = await call(POST, PATH, { modelId: model.option.id, prompt: 'a mug' });
    expect(result.status).toBe(502);
    expect(result.body.error.code).toBe('generation_failed');
    expect(result.text).not.toContain('10.0.0.12');
  });

  it('passes provider argument errors through as 400', async () => {
    imageGenerate.mockRejectedValue(new InvalidArgumentError({ argument: 'providerOptions.picsart', message: 'resolution 8K is not allowed' }));
    const result = await call(POST, PATH, { modelId: model.option.id, prompt: 'a mug' });
    expect(result.status).toBe(400);
    expect(result.body.error).toMatchObject({ code: 'invalid_request' });
    expect(result.body.error.message).toContain('resolution 8K is not allowed');
  });

  it.each([
    ['an empty prompt', () => ({ modelId: model.option.id, prompt: '   ' }), 'prompt'],
    ['a missing prompt', () => ({ modelId: model.option.id }), 'prompt'],
    ['a prompt over the cap', () => ({ modelId: model.option.id, prompt: 'x'.repeat(1001) }), 'prompt'],
    ['a missing model', () => ({ prompt: 'a mug' }), 'modelId'],
    ['a model the catalog does not list', () => ({ modelId: 'not-a-picsart-model', prompt: 'a mug' }), 'modelId'],
    ['a catalog model that is not text-to-image', () => ({ modelId: notTextToImage, prompt: 'a mug' }), 'modelId'],
    ['an aspect ratio the model does not offer', () => ({ modelId: withRatio.option.id, prompt: 'a mug', aspectRatio: '7:3' }), 'aspectRatio'],
  ])('rejects %s with 400', async (_name, body, field) => {
    const result = await call(POST, PATH, body());
    expect(result.status).toBe(400);
    expect(result.body.error.field).toBe(field);
    expect(imageGenerate).not.toHaveBeenCalled();
  });

  it('rejects malformed and oversized bodies', async () => {
    expect((await call(POST, PATH, '{not json')).status).toBe(400);
    expect((await call(POST, PATH, { modelId: model.option.id, prompt: 'x'.repeat(20_000) })).status).toBe(413);
    expect(imageGenerate).not.toHaveBeenCalled();
  });

  it('honors a lower prompt cap from the environment', async () => {
    vi.stubEnv('PICSART_DEMO_PROMPT_MAX_LENGTH', '10');
    const result = await call(POST, PATH, { modelId: model.option.id, prompt: 'eleven char' });
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain('10 characters');
  });

  it('limits each IP to PICSART_DEMO_IMAGE_LIMIT generations per window', async () => {
    vi.stubEnv('PICSART_DEMO_IMAGE_LIMIT', '2');
    imageGenerate.mockImplementation(async (modelId) => imageSuccess(modelId));
    const body = { modelId: model.option.id, prompt: 'a mug' };

    expect((await call(POST, PATH, body)).status).toBe(200);
    expect((await call(POST, PATH, body)).status).toBe(200);
    const limited = await call(POST, PATH, body);

    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('rate_limited');
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(imageGenerate).toHaveBeenCalledTimes(2);
    expect((await call(POST, PATH, body, { 'x-forwarded-for': '198.51.100.9' })).status).toBe(200);
  });

  it('runs a request once per idempotency key', async () => {
    imageGenerate.mockImplementation(async (modelId) => imageSuccess(modelId));
    const body = { modelId: model.option.id, prompt: 'a mug' };
    const headers = { 'idempotency-key': 'retry-key-0001' };

    const [first, second] = await Promise.all([call(POST, PATH, body, headers), call(POST, PATH, body, headers)]);

    expect(first.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(imageGenerate).toHaveBeenCalledOnce();
  });

  it('returns 503 without calling Picsart when the kill switch is off', async () => {
    vi.stubEnv('PICSART_DEMO_ENABLED', 'false');
    const result = await call(POST, PATH, { modelId: model.option.id, prompt: 'a mug' });
    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe('demo_disabled');
    expect(imageGenerate).not.toHaveBeenCalled();
  });

  it('returns 503 when no API key is configured', async () => {
    keyState.current = undefined;
    const result = await call(POST, PATH, { modelId: model.option.id, prompt: 'a mug' });
    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe('not_configured');
    expect(imageGenerate).not.toHaveBeenCalled();
  });

  it('only accepts models from PICSART_DEMO_IMAGE_MODELS when it is set', async () => {
    vi.stubEnv('PICSART_DEMO_IMAGE_MODELS', otherModel.option.id);
    imageGenerate.mockImplementation(async (modelId) => imageSuccess(modelId));
    expect((await call(POST, PATH, { modelId: model.option.id, prompt: 'a mug' })).status).toBe(400);
    expect((await call(POST, PATH, { modelId: otherModel.option.id, prompt: 'a mug' })).status).toBe(200);
  });
});
