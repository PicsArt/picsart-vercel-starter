import { APICallError, InvalidArgumentError, LoadAPIKeyError } from '@ai-sdk/provider';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { POST as IMAGE } from '@/app/api/image/route';
import { POST as START } from '@/app/api/video/route';
import { POST as STATUS } from '@/app/api/video/status/route';
import { loadModels, type DemoModel } from '@/lib/server/models';
import { imageGenerate, imageSuccess, TEST_KEY, videoCompleted, videoFailed, videoStart, videoStarted, videoStatus } from './fakes';
import { call, type Called } from './http';

let image: DemoModel;
let video: DemoModel;

beforeAll(async () => {
  [image] = await loadModels('image');
  [video] = await loadModels('video');
});

function leakyApiError(statusCode: number, code?: string): APICallError {
  return new APICallError({
    message: `Request failed with Authorization: Bearer ${TEST_KEY}`,
    url: `https://api.picsart.com/?key=${TEST_KEY}`,
    requestBodyValues: { apiKey: TEST_KEY },
    statusCode,
    responseBody: `{"echo":"${TEST_KEY}"}`,
    data: { ...(code ? { code } : {}), echo: TEST_KEY },
    isRetryable: false,
    cause: new Error(TEST_KEY),
  });
}

function expectNoKey(response: Called): void {
  const encoded = Buffer.from(TEST_KEY).toString('base64url');
  const surfaces = [response.text, ...[...response.headers.entries()].map(([name, value]) => `${name}: ${value}`)];
  for (const surface of surfaces) {
    expect(surface).not.toContain(TEST_KEY);
    expect(surface).not.toContain(encoded);
  }
  if (typeof response.body?.ticket === 'string') {
    const [payload] = response.body.ticket.split('.');
    expect(Buffer.from(payload, 'base64url').toString('utf8')).not.toContain(TEST_KEY);
  }
}

describe('the API key', () => {
  it('never appears in a response from any route or outcome', async () => {
    const imageBody = { modelId: image.option.id, prompt: 'a mug' };
    const videoBody = { modelId: video.option.id, prompt: 'a wave' };
    const responses: Called[] = [];

    imageGenerate.mockImplementationOnce(async (modelId) => imageSuccess(modelId));
    imageGenerate.mockRejectedValueOnce(leakyApiError(402, 'NOT_ENOUGH_AVAILABLE_CREDITS'));
    imageGenerate.mockRejectedValueOnce(leakyApiError(401));
    imageGenerate.mockRejectedValueOnce(leakyApiError(500));
    imageGenerate.mockRejectedValueOnce(new InvalidArgumentError({ argument: 'prompt', message: `bad value near ${TEST_KEY}` }));
    imageGenerate.mockRejectedValueOnce(new LoadAPIKeyError({ message: `key ${TEST_KEY} missing` }));
    imageGenerate.mockRejectedValueOnce(new Error(`boom ${TEST_KEY}`));
    for (let index = 0; index < 7; index += 1) responses.push(await call(IMAGE, '/api/image', imageBody, { 'x-forwarded-for': `198.51.100.${index}` }));

    responses.push(await call(IMAGE, '/api/image', { ...imageBody, prompt: '' }));
    responses.push(await call(IMAGE, '/api/image', { ...imageBody, modelId: TEST_KEY }));

    videoStart.mockImplementationOnce(async (modelId) => videoStarted(modelId));
    videoStart.mockRejectedValueOnce(leakyApiError(400, 'NOT_ENOUGH_AVAILABLE_CREDITS'));
    videoStart.mockRejectedValueOnce(new InvalidArgumentError({ argument: 'duration', message: `nope ${TEST_KEY}` }));
    const started = await call(START, '/api/video', videoBody, { 'x-forwarded-for': '192.0.2.1' });
    responses.push(started);
    responses.push(await call(START, '/api/video', videoBody, { 'x-forwarded-for': '192.0.2.2' }));
    responses.push(await call(START, '/api/video', videoBody, { 'x-forwarded-for': '192.0.2.3' }));

    const ticket = started.body.ticket as string;
    videoStatus.mockImplementationOnce(async (modelId) => videoCompleted(modelId));
    videoStatus.mockImplementationOnce(async (modelId) => videoFailed(modelId, `job failed for key ${TEST_KEY}`));
    videoStatus.mockRejectedValueOnce(leakyApiError(403));
    videoStatus.mockRejectedValueOnce(leakyApiError(404));
    for (let index = 0; index < 4; index += 1) responses.push(await call(STATUS, '/api/video/status', { ticket }));
    responses.push(await call(STATUS, '/api/video/status', { ticket: `${ticket}x` }));

    vi.stubEnv('PICSART_DEMO_IMAGE_LIMIT', '1');
    imageGenerate.mockImplementation(async (modelId) => imageSuccess(modelId));
    responses.push(await call(IMAGE, '/api/image', imageBody, { 'x-forwarded-for': '192.0.2.50' }));
    responses.push(await call(IMAGE, '/api/image', imageBody, { 'x-forwarded-for': '192.0.2.50' }));
    vi.stubEnv('PICSART_DEMO_ENABLED', 'false');
    responses.push(await call(IMAGE, '/api/image', imageBody));
    responses.push(await call(START, '/api/video', videoBody));
    responses.push(await call(STATUS, '/api/video/status', { ticket }));

    expect(responses.map((response) => response.status)).toEqual([
      200, 402, 502, 502, 400, 503, 502, 400, 400, 200, 402, 400, 200, 200, 502, 404, 400, 200, 429, 503, 503, 503,
    ]);
    for (const response of responses) expectNoKey(response);
    expect(responses[4].body.error.message).toContain('[redacted]');
    expect(responses[13].body.message).toContain('[redacted]');
  });
});
