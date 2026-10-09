import { APICallError } from '@ai-sdk/provider';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { POST as START } from '@/app/api/video/route';
import { POST as STATUS } from '@/app/api/video/status/route';
import { loadModels, shortestDuration, type DemoModel } from '@/lib/server/models';
import { issueTicket } from '@/lib/server/ticket';
import { PLAYGROUND_URL, TEST_KEY, VIDEO_URL, videoCompleted, videoFailed, videoPending, videoStart, videoStarted, videoStatus } from './fakes';
import { call } from './http';

const START_PATH = '/api/video';
const STATUS_PATH = '/api/video/status';
let model: DemoModel;
let withDuration: DemoModel;
let withoutDuration: DemoModel | undefined;

beforeAll(async () => {
  const models = await loadModels('video');
  [model] = models;
  withDuration = models.find((candidate) => shortestDuration(candidate.catalog) !== undefined)!;
  withoutDuration = models.find((candidate) => shortestDuration(candidate.catalog) === undefined);
  expect(model && withDuration).toBeTruthy();
});

async function startVideo(target: DemoModel = model): Promise<string> {
  videoStart.mockImplementation(async (modelId) => videoStarted(modelId));
  const started = await call(START, START_PATH, { modelId: target.option.id, prompt: 'steam rises from a mug' });
  expect(started.status).toBe(200);
  return started.body.ticket;
}

describe('POST /api/video', () => {
  it('starts one video, asks for the shortest duration and returns a signed ticket', async () => {
    videoStart.mockImplementation(async (modelId) => videoStarted(modelId));

    const started = await call(START, START_PATH, { modelId: withDuration.option.id, prompt: 'steam rises from a mug' });

    expect(started.status).toBe(200);
    expect(started.body.playgroundUrl).toBe(PLAYGROUND_URL);
    expect(started.body.ticket).toMatch(/^[\w-]+\.[\w-]+$/);
    const [, options] = videoStart.mock.calls.at(-1)!;
    expect(options).toMatchObject({ prompt: 'steam rises from a mug', n: 1, duration: shortestDuration(withDuration.catalog) });
  });

  it('leaves the duration to the model when PICSART_DEMO_VIDEO_SHORTEST is false', async () => {
    vi.stubEnv('PICSART_DEMO_VIDEO_SHORTEST', 'false');
    await startVideo(withDuration);
    expect(videoStart.mock.calls[0][1].duration).toBeUndefined();
  });

  it('sends no duration for a model without one', async () => {
    if (!withoutDuration) return;
    await startVideo(withoutDuration);
    expect(videoStart.mock.calls[0][1].duration).toBeUndefined();
  });

  it('maps out-of-credits to 402', async () => {
    videoStart.mockRejectedValue(
      new APICallError({
        message: 'insufficient credits',
        url: 'https://api.picsart.com',
        requestBodyValues: {},
        statusCode: 400,
        data: { code: 'NOT_ENOUGH_AVAILABLE_CREDITS' },
        isRetryable: false,
      }),
    );
    const result = await call(START, START_PATH, { modelId: model.option.id, prompt: 'a wave' });
    expect(result.status).toBe(402);
    expect(result.body.error.code).toBe('out_of_credits');
    expect(videoStart).toHaveBeenCalledOnce();
  });

  it('returns 503 when PICSART_DEMO_VIDEO_ENABLED is off', async () => {
    vi.stubEnv('PICSART_DEMO_VIDEO_ENABLED', 'false');
    const result = await call(START, START_PATH, { modelId: model.option.id, prompt: 'a wave' });
    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe('video_disabled');
    expect(videoStart).not.toHaveBeenCalled();
  });

  it('returns 503 when the kill switch is off', async () => {
    vi.stubEnv('PICSART_DEMO_ENABLED', '0');
    const result = await call(START, START_PATH, { modelId: model.option.id, prompt: 'a wave' });
    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe('demo_disabled');
  });

  it('limits each IP to PICSART_DEMO_VIDEO_LIMIT starts per window', async () => {
    vi.stubEnv('PICSART_DEMO_VIDEO_LIMIT', '1');
    await startVideo();
    const limited = await call(START, START_PATH, { modelId: model.option.id, prompt: 'again' });
    expect(limited.status).toBe(429);
    expect(limited.body.error.message).toContain('1 video per hour');
    expect(videoStart).toHaveBeenCalledOnce();
  });

  it('rejects invalid input with 400', async () => {
    expect((await call(START, START_PATH, { modelId: model.option.id, prompt: '' })).status).toBe(400);
    expect((await call(START, START_PATH, { modelId: 'not-a-picsart-model', prompt: 'a wave' })).status).toBe(400);
    expect((await call(START, START_PATH, { modelId: model.option.id, prompt: 'a wave', aspectRatio: 42 })).status).toBe(400);
    expect(videoStart).not.toHaveBeenCalled();
  });
});

describe('POST /api/video/status', () => {
  it('reports pending, then the completed video with its playground link & credits', async () => {
    const ticket = await startVideo();
    videoStatus.mockImplementationOnce(async (modelId) => videoPending(modelId));
    videoStatus.mockImplementationOnce(async (modelId) => videoCompleted(modelId, 0.01));

    const pending = await call(STATUS, STATUS_PATH, { ticket });
    const completed = await call(STATUS, STATUS_PATH, { ticket });

    expect(pending.body).toEqual({ status: 'pending' });
    expect(completed.status).toBe(200);
    expect(completed.body).toEqual({ status: 'completed', video: { url: VIDEO_URL }, playgroundUrl: PLAYGROUND_URL, credits: 0.01 });
    const [, options] = videoStatus.mock.calls[1];
    expect(options.operation).toEqual(videoStarted(model.option.id).operation);
  });

  it('reports a failed job as an error status', async () => {
    const ticket = await startVideo();
    videoStatus.mockImplementation(async (modelId) => videoFailed(modelId, 'The prompt was flagged by moderation.'));
    const result = await call(STATUS, STATUS_PATH, { ticket });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ status: 'error', message: 'The prompt was flagged by moderation.' });
  });

  it('maps a refused status check to an error response', async () => {
    const ticket = await startVideo();
    const refused = (statusCode: number) =>
      new APICallError({ message: 'nope', url: 'https://api.picsart.com', requestBodyValues: {}, statusCode, isRetryable: false });
    videoStatus.mockRejectedValueOnce(refused(404));
    videoStatus.mockRejectedValueOnce(refused(500));

    const missing = await call(STATUS, STATUS_PATH, { ticket });
    const failing = await call(STATUS, STATUS_PATH, { ticket });

    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('status_failed');
    expect(failing.status).toBe(502);
    expect(failing.body.error.code).toBe('status_failed');
  });

  it('accepts only tickets this deployment issued', async () => {
    const ticket = await startVideo();
    const [payload, signature] = ticket.split('.');
    const forged = issueTicket({ modelId: model.option.id, generationId: 'someone-elses-job' }, 'another-secret');
    const tampered = `${Buffer.from(JSON.stringify({ operation: { modelId: model.option.id, generationId: 'x' }, issuedAt: Date.now() })).toString('base64url')}.${signature}`;

    for (const body of [{ ticket: forged }, { ticket: tampered }, { ticket: `${payload}.` }, { ticket: 'garbage' }, { ticket: 42 }, {}]) {
      const result = await call(STATUS, STATUS_PATH, body);
      expect(result.status).toBe(400);
      expect(result.body.error.code).toBe('invalid_ticket');
    }
    expect(videoStatus).not.toHaveBeenCalled();
  });

  it('rejects expired tickets and tickets for models the catalog does not list', async () => {
    const expired = issueTicket({ modelId: model.option.id, generationId: 'gen-0001' }, TEST_KEY, Date.now() - 7 * 60 * 60 * 1000);
    const unknownModel = issueTicket({ modelId: 'not-a-picsart-model', generationId: 'gen-0001' }, TEST_KEY);
    expect((await call(STATUS, STATUS_PATH, { ticket: expired })).status).toBe(400);
    expect((await call(STATUS, STATUS_PATH, { ticket: unknownModel })).status).toBe(400);
    expect(videoStatus).not.toHaveBeenCalled();
  });

  it('lets the provider re-validate the operation', async () => {
    const suspicious = issueTicket({ modelId: model.option.id, generationId: '../admin' }, TEST_KEY);
    const result = await call(STATUS, STATUS_PATH, { ticket: suspicious });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe('invalid_ticket');
    expect(videoStatus).not.toHaveBeenCalled();
  });

  it('keeps answering when only video starts are turned off', async () => {
    const ticket = await startVideo();
    vi.stubEnv('PICSART_DEMO_VIDEO_ENABLED', 'false');
    videoStatus.mockImplementation(async (modelId) => videoPending(modelId));
    expect((await call(STATUS, STATUS_PATH, { ticket })).status).toBe(200);
  });

  it('returns 503 when the kill switch is off', async () => {
    const ticket = await startVideo();
    vi.stubEnv('PICSART_DEMO_ENABLED', 'off');
    const result = await call(STATUS, STATUS_PATH, { ticket });
    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe('demo_disabled');
    expect(videoStatus).not.toHaveBeenCalled();
  });

  it('limits status checks per IP', async () => {
    vi.stubEnv('PICSART_DEMO_STATUS_LIMIT', '2');
    const ticket = await startVideo();
    videoStatus.mockImplementation(async (modelId) => videoPending(modelId));
    await call(STATUS, STATUS_PATH, { ticket });
    await call(STATUS, STATUS_PATH, { ticket });
    const limited = await call(STATUS, STATUS_PATH, { ticket });
    expect(limited.status).toBe(429);
    expect(videoStatus).toHaveBeenCalledTimes(2);
  });
});
