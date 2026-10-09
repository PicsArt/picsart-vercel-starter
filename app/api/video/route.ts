import { experimental_startVideo } from 'ai';
import { readConfig, type DemoConfig } from '@/lib/server/config';
import { generationErrorReply } from '@/lib/server/errors';
import { httpUrl, notConfigured, rateLimited, unavailable } from '@/lib/server/guards';
import { clientIp, readJson, reply, type Reply } from '@/lib/server/http';
import { withIdempotency } from '@/lib/server/idempotency';
import { findModel, shortestDuration, type DemoModel } from '@/lib/server/models';
import { picsart } from '@/lib/server/picsart';
import { jsonRoute } from '@/lib/server/route';
import { picsartApiKey } from '@/lib/server/secrets';
import { issueTicket } from '@/lib/server/ticket';
import { checkModel, parseGenerationInput, type GenerationInput } from '@/lib/server/validate';
import type { VideoStartResult } from '@/lib/types';

export const maxDuration = 60;

async function start(input: GenerationInput, model: DemoModel, config: DemoConfig): Promise<Reply> {
  const secret = picsartApiKey();
  if (!secret) return notConfigured();
  try {
    const duration = config.videoShortest ? shortestDuration(model.catalog) : undefined;
    const { operation, providerMetadata } = await experimental_startVideo({
      model: picsart.video(input.modelId),
      prompt: input.prompt,
      n: 1,
      maxRetries: 0,
      ...(input.aspectRatio ? { aspectRatio: input.aspectRatio as `${number}:${number}` } : {}),
      ...(duration !== undefined ? { duration } : {}),
    });
    const playgroundUrl = httpUrl((providerMetadata?.picsart as { playgroundUrl?: unknown } | undefined)?.playgroundUrl);
    const body: VideoStartResult = { ticket: issueTicket(operation, secret), ...(playgroundUrl ? { playgroundUrl } : {}) };
    return reply(200, body);
  } catch (error) {
    return generationErrorReply('video', error);
  }
}

export const POST = jsonRoute('video', async (request) => {
  const config = readConfig();
  const blocked = unavailable(config, 'video');
  if (blocked) return blocked;
  const body = await readJson(request);
  if (!body.ok) return body.reply;
  const input = parseGenerationInput(body.value, config.promptMaxLength);
  if (!input.ok) return input.reply;
  const model = checkModel(await findModel('video', input.value.modelId, config.videoModels), input.value);
  if (!model.ok) return model.reply;
  const ip = clientIp(request);
  return withIdempotency(request, `video:${ip}`, () => rateLimited(config, 'video', ip) ?? start(input.value, model.value, config));
});
